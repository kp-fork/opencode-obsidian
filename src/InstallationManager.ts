import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import type { Plugin } from "obsidian";

// Simple ID generator (replaces uuid dependency)
function generateId(): string {
  return Date.now().toString(36) + randomBytes(8).toString("hex");
}
import { exec, execWithProgress, parseVersionFromOutput, NPM_INSTALL_TIMEOUT, VERSION_CHECK_TIMEOUT } from "./utils/exec";
import { ensureDir, fileExists } from "./utils/download";
import { getPlatform, getArch, getExecutableExtension, getPluginDataDir, getInstallationsDir } from "./platform";

// Platform-specific imports
import * as darwin from "./platform/darwin";
import * as win32 from "./platform/win32";
import * as linux from "./platform/linux";

export type InstallationState = "not-installed" | "installing" | "installed" | "error";

export interface Installation {
  id: string;
  version: string;
  installDate: string;
  path: string;
  executablePath: string;
  source: "managed" | "system";
  platform: string;
  arch: string;
}

export interface InstallProgress {
  stage: "detecting" | "downloading" | "installing" | "validating" | "done";
  message: string;
  percentage?: number;
}

export interface InstallOptions {
  version?: string;
  onProgress?: (progress: InstallProgress) => void;
}

export interface InstallResult {
  success: boolean;
  installation?: Installation;
  error?: string;
}

export class InstallationManager {
  private plugin: Plugin;
  private dataDir: string;
  private installationsDir: string;
  private registryPath: string;
  private state: InstallationState = "not-installed";
  private installations: Installation[] = [];
  private selectedInstallationId: string | null = null;
  private stateChangeCallbacks = new Set<(state: InstallationState) => void>();
  private progressCallbacks = new Set<(progress: InstallProgress) => void>();

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.dataDir = "";
    this.installationsDir = "";
    this.registryPath = "";
  }

  async initialize(): Promise<void> {
    this.dataDir = await getPluginDataDir(this.plugin);
    this.installationsDir = getInstallationsDir(this.dataDir);
    this.registryPath = path.join(this.dataDir, "registry.json");

    // Ensure directories exist
    await ensureDir(this.installationsDir);

    // Load registry
    await this.loadRegistry();

    // Detect state
    await this.detectState();
  }

  getState(): InstallationState {
    return this.state;
  }

  getInstalledVersion(): string | null {
    const selected = this.getSelectedInstallation();
    return selected?.version || null;
  }

  getInstallations(): Installation[] {
    return [...this.installations];
  }

  getSelectedInstallation(): Installation | null {
    if (!this.selectedInstallationId) {
      return null;
    }
    return this.installations.find((i) => i.id === this.selectedInstallationId) || null;
  }

  async detectSystemNpm(): Promise<string | null> {
    const platform = getPlatform();
    if (platform === "darwin") {
      return darwin.detectSystemNpm();
    } else if (platform === "win32") {
      return win32.detectSystemNpm();
    } else {
      return linux.detectSystemNpm();
    }
  }

  async detectExistingInstallations(): Promise<Installation[]> {
    const platform = getPlatform();
    const detections: Installation[] = [];

    // Use platform-specific detection
    let systemPath: string | null = null;
    if (platform === "darwin") {
      systemPath = await darwin.detectExistingOpenCode();
    } else if (platform === "win32") {
      systemPath = await win32.detectExistingOpenCode();
    } else {
      systemPath = await linux.detectExistingOpenCode();
    }

    if (systemPath) {
      const version = await this.getVersionExecutable(systemPath);
      if (version) {
        detections.push({
          id: generateId(),
          version,
          installDate: new Date().toISOString(),
          path: path.dirname(systemPath),
          executablePath: systemPath,
          source: "system",
          platform,
          arch: getArch(),
        });
      }
    }

    return detections;
  }

  async installOpenCode(options: InstallOptions = {}): Promise<InstallResult> {
    try {
      this.setState("installing");
      this.notifyProgress({ stage: "detecting", message: "Checking environment..." });

      // Check for npm
      const npmPath = await this.detectSystemNpm();
      if (!npmPath) {
        return {
          success: false,
          error: "npm not found. Please install Node.js from https://nodejs.org/",
        };
      }

      this.notifyProgress({ stage: "downloading", message: "Downloading OpenCode..." });

      // Create installation directory
      const installId = generateId();
      const installDir = path.join(this.installationsDir, `opencode-${installId}`);
      await ensureDir(installDir);

      this.notifyProgress({
        stage: "installing",
        message: "Installing OpenCode via npm...",
      });

      // Run npm install
      const platform = getPlatform();
      const npmCmd = platform === "win32" ? "npm.cmd" : "npm";

      const result = await execWithProgress(
        npmCmd,
        ["install", "--save-dev", "opencode-ai"],
        (stdout) => {
          // Parse npm output for progress
          if (stdout.includes("opencode-ai@")) {
            this.notifyProgress({
              stage: "installing",
              message: "Installing OpenCode package...",
            });
          }
        },
        (stderr) => {
          console.error("[OpenCode Install]", stderr);
        },
        { cwd: installDir, timeout: NPM_INSTALL_TIMEOUT }
      );

      if (result.exitCode !== 0) {
        throw new Error(`npm install failed: ${result.stderr}`);
      }

      // Find executable
      const binPath = path.join(installDir, "node_modules", ".bin");
      const ext = getExecutableExtension();
      const execName = `opencode${ext}`;
      let execPath = path.join(binPath, execName);

      // On Windows, npm creates .cmd files
      if (platform === "win32") {
        const cmdPath = path.join(binPath, "opencode.cmd");
        if (await fileExists(cmdPath)) {
          execPath = cmdPath;
        }
      }

      if (!(await fileExists(execPath))) {
        throw new Error("Executable not found after installation");
      }

      this.notifyProgress({ stage: "validating", message: "Validating installation..." });

      // Get version
      const version = await this.getVersionExecutable(execPath);
      if (!version) {
        throw new Error("Failed to get version from installed executable");
      }

      // Create installation record
      const installation: Installation = {
        id: installId,
        version,
        installDate: new Date().toISOString(),
        path: installDir,
        executablePath: execPath,
        source: "managed",
        platform,
        arch: getArch(),
      };

      // Add to installations
      this.installations.push(installation);
      this.selectedInstallationId = installId;

      // Save registry
      await this.saveRegistry();

      this.setState("installed");
      this.notifyProgress({ stage: "done", message: "Installation complete!" });

      return { success: true, installation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setState("error");
      this.notifyProgress({ stage: "done", message: `Installation failed: ${errorMessage}` });
      return { success: false, error: errorMessage };
    }
  }

  async uninstallOpenCode(installationId: string): Promise<void> {
    const installation = this.installations.find((i) => i.id === installationId);
    if (!installation) {
      throw new Error("Installation not found");
    }

    if (installation.source !== "managed") {
      throw new Error("Cannot uninstall system installation");
    }

    // Remove directory
    await fs.promises.rm(installation.path, { recursive: true, force: true });

    // Remove from list
    this.installations = this.installations.filter((i) => i.id !== installationId);

    if (this.selectedInstallationId === installationId) {
      this.selectedInstallationId = null;
    }

    await this.saveRegistry();
    await this.detectState();
  }

  async selectInstallation(installationId: string): Promise<void> {
    const installation = this.installations.find((i) => i.id === installationId);
    if (!installation) {
      throw new Error("Installation not found");
    }

    this.selectedInstallationId = installationId;
    await this.saveRegistry();
  }

  onStateChange(callback: (state: InstallationState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  onProgress(callback: (progress: InstallProgress) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => {
      this.progressCallbacks.delete(callback);
    };
  }

  private setState(state: InstallationState): void {
    this.state = state;
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  private notifyProgress(progress: InstallProgress): void {
    for (const callback of this.progressCallbacks) {
      callback(progress);
    }
  }

  private async detectState(): Promise<void> {
    const selected = this.getSelectedInstallation();
    if (selected) {
      // Verify it still exists
      if (await fileExists(selected.executablePath)) {
        this.state = "installed";
      } else {
        this.state = "not-installed";
        this.selectedInstallationId = null;
      }
    } else {
      this.state = "not-installed";
    }
  }

  private async loadRegistry(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.registryPath, "utf-8");
      const registry = JSON.parse(data);

      this.installations = registry.installations || [];
      this.selectedInstallationId = registry.selectedInstallationId || null;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        // File doesn't exist yet - that's fine for first run
        this.installations = [];
        this.selectedInstallationId = null;
      } else {
        // Actual error - log it and start fresh
        console.error("[OpenCode] Failed to load registry:", err);
        this.installations = [];
        this.selectedInstallationId = null;
      }
    }
  }

  private async saveRegistry(): Promise<void> {
    try {
      const registry = {
        installations: this.installations,
        selectedInstallationId: this.selectedInstallationId,
      };

      await fs.promises.writeFile(
        this.registryPath,
        JSON.stringify(registry, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("[OpenCode] Failed to save registry:", error);
      throw new Error(`Failed to save installation registry: ${(error as Error).message}`);
    }
  }

  private async getVersionExecutable(execPath: string): Promise<string | null> {
    try {
      const result = await exec(execPath, ["--version"], { timeout: VERSION_CHECK_TIMEOUT });
      return parseVersionFromOutput(result.stdout);
    } catch {
      return null;
    }
  }
}
