import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { OpenCodeSettings, DEFAULT_SETTINGS, OPENCODE_VIEW_TYPE, Installation } from "./types";
import { OpenCodeView } from "./OpenCodeView";
import { OpenCodeSettingTab } from "./SettingsTab";
import { ProcessManager, ProcessState } from "./ProcessManager";
import { InstallationManager, InstallationState, InstallProgress } from "./InstallationManager";
import { OpencodeSettingsManager } from "./OpencodeSettingsManager";
import { registerOpenCodeIcons, OPENCODE_ICON_NAME } from "./icons";
import { getPluginDataDir, getConfigDir } from "./platform";

export default class OpenCodePlugin extends Plugin {
  settings: OpenCodeSettings = DEFAULT_SETTINGS;
  private processManager: ProcessManager;
  private installationManager: InstallationManager;
  private opencodeSettingsManager: OpencodeSettingsManager | null = null;
  private stateChangeCallbacks: Array<(state: ProcessState) => void> = [];

  async onload(): Promise<void> {
    console.log("Loading OpenCode plugin");

    registerOpenCodeIcons();

    await this.loadSettings();

    // Initialize Installation Manager
    this.installationManager = new InstallationManager(this);
    await this.installationManager.initialize();

    // Initialize OpenCode Settings Manager
    const dataDir = await getPluginDataDir(this);
    const configDir = getConfigDir(dataDir);
    this.opencodeSettingsManager = new OpencodeSettingsManager(configDir);

    // Update opencodePath from selected installation if available
    const selectedInstallation = this.installationManager.getSelectedInstallation();
    if (selectedInstallation) {
      console.log("[OpenCode] Using selected installation:", selectedInstallation.executablePath);
      this.settings.opencodePath = selectedInstallation.executablePath;
      this.settings.installations = this.installationManager.getInstallations();
      this.settings.selectedInstallationId = selectedInstallation.id;
      this.settings.opencodeConfigPath = this.opencodeSettingsManager.getConfigPath();
    } else {
      // Detect existing installations
      console.log("[OpenCode] No selected installation, detecting existing installations...");
      const detected = await this.installationManager.detectExistingInstallations();
      console.log("[OpenCode] Detected installations:", detected);
      if (detected.length > 0) {
        this.settings.installations = detected;
        this.settings.opencodePath = detected[0].executablePath;
        // Save the detected path so it persists
        await this.saveSettings();
        console.log("[OpenCode] Saved detected opencode path:", detected[0].executablePath);
      } else {
        console.log("[OpenCode] No existing installations detected. Please install OpenCode or check the opencodePath setting.");
      }
    }

    console.log("[OpenCode] Final opencodePath:", this.settings.opencodePath);

    const projectDirectory = this.getProjectDirectory();

    this.processManager = new ProcessManager(
      this.settings,
      projectDirectory,
      this.settings.opencodeConfigPath,
      (state) => this.notifyStateChange(state)
    );

    console.log("[OpenCode] Configured with project directory:", projectDirectory);

    this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));
    this.addSettingTab(new OpenCodeSettingTab(this.app, this));

    this.addRibbonIcon(OPENCODE_ICON_NAME, "OpenCode", () => {
      this.activateView();
    });

    this.addCommand({
      id: "toggle-opencode-view",
      name: "Toggle OpenCode panel",
      callback: () => {
        this.toggleView();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "o",
        },
      ],
    });

    this.addCommand({
      id: "start-opencode-server",
      name: "Start OpenCode server",
      callback: () => {
        this.startServer();
      },
    });

    this.addCommand({
      id: "stop-opencode-server",
      name: "Stop OpenCode server",
      callback: () => {
        this.stopServer();
      },
    });

    this.addCommand({
      id: "install-opencode",
      name: "Install OpenCode",
      callback: () => {
        this.installOpenCode();
      },
    });

    if (this.settings.autoStart) {
      this.app.workspace.onLayoutReady(async () => {
        await this.startServer();
      });
    }

    console.log("OpenCode plugin loaded");
  }

  async onunload(): Promise<void> {
    this.stopServer();
    this.app.workspace.detachLeavesOfType(OPENCODE_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.processManager.updateSettings(this.settings);
  }

  // Update project directory and restart server if running
  async updateProjectDirectory(directory: string): Promise<void> {
    this.settings.projectDirectory = directory;
    await this.saveData(this.settings);

    this.processManager.updateProjectDirectory(this.getProjectDirectory());

    if (this.getProcessState() === "running") {
      this.stopServer();
      await this.startServer();
    }
  }

  private getExistingLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE);
    return leaves.length > 0 ? leaves[0] : null;
  }

  async activateView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    // Create new leaf based on defaultViewLocation setting
    let leaf: WorkspaceLeaf | null = null;
    if (this.settings.defaultViewLocation === "main") {
      leaf = this.app.workspace.getLeaf("tab");
    } else {
      leaf = this.app.workspace.getRightLeaf(false);
    }

    if (leaf) {
      await leaf.setViewState({
        type: OPENCODE_VIEW_TYPE,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async toggleView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      // Check if the view is in the sidebar or main area
      const isInSidebar = existingLeaf.getRoot() === this.app.workspace.rightSplit;

      if (isInSidebar) {
        // For sidebar views, check if sidebar is collapsed
        const rightSplit = this.app.workspace.rightSplit;
        if (rightSplit && !rightSplit.collapsed) {
          existingLeaf.detach();
        } else {
          this.app.workspace.revealLeaf(existingLeaf);
        }
      } else {
        // For main area views, just detach (close the tab)
        existingLeaf.detach();
      }
    } else {
      await this.activateView();
    }
  }

  async startServer(): Promise<boolean> {
    const success = await this.processManager.start();
    if (success) {
      new Notice("OpenCode server started");
    }
    return success;
  }

  stopServer(): void {
    this.processManager.stop();
    new Notice("OpenCode server stopped");
  }

  getProcessState(): ProcessState {
    return this.processManager?.getState() ?? "stopped";
  }

  getLastError(): string | null {
    return this.processManager.getLastError() ?? null;
  }

  getServerUrl(): string {
    return this.processManager.getUrl();
  }

  onProcessStateChange(callback: (state: ProcessState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyStateChange(state: ProcessState): void {
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  getProjectDirectory(): string {
    if (this.settings.projectDirectory) {
      console.log("[OpenCode] Using project directory from settings:", this.settings.projectDirectory);
      return this.settings.projectDirectory;
    }
    const adapter = this.app.vault.adapter as any;
    const vaultPath = adapter.basePath || "";
    if (!vaultPath) {
      console.warn("[OpenCode] Warning: Could not determine vault path");
    }
    console.log("[OpenCode] Using vault path as project directory:", vaultPath);
    return vaultPath;
  }

  // Installation management methods

  getInstallationState(): InstallationState {
    return this.installationManager?.getState() ?? "not-installed";
  }

  getInstalledVersion(): string | null {
    return this.installationManager?.getInstalledVersion() ?? null;
  }

  getInstallations(): Installation[] {
    return this.installationManager?.getInstallations() ?? [];
  }

  async installOpenCode(): Promise<void> {
    const result = await this.installationManager.installOpenCode({
      onProgress: (progress) => {
        console.log("[OpenCode Install]", progress.stage, progress.message);
        new Notice(`OpenCode: ${progress.message}`);
      },
    });

    if (result.success && result.installation) {
      this.settings.installations = this.installationManager.getInstallations();
      this.settings.selectedInstallationId = result.installation.id;
      this.settings.opencodePath = result.installation.executablePath;
      await this.saveSettings();
      new Notice("OpenCode installed successfully!");
    } else if (result.error) {
      new Notice(`Installation failed: ${result.error}`);
    }
  }

  async selectInstallation(installationId: string): Promise<void> {
    await this.installationManager.selectInstallation(installationId);
    const selected = this.installationManager.getSelectedInstallation();
    if (selected) {
      this.settings.opencodePath = selected.executablePath;
      this.settings.selectedInstallationId = selected.id;
      await this.saveSettings();

      // Restart server if running
      if (this.getProcessState() === "running") {
        this.stopServer();
        await this.startServer();
      }
    }
  }

  async uninstallOpenCode(installationId: string): Promise<void> {
    await this.installationManager.uninstallOpenCode(installationId);
    this.settings.installations = this.installationManager.getInstallations();

    // If we uninstalled the selected one, clear it
    if (this.settings.selectedInstallationId === installationId) {
      this.settings.selectedInstallationId = null;
      const installations = this.installationManager.getInstallations();
      if (installations.length > 0) {
        this.settings.selectedInstallationId = installations[0].id;
        this.settings.opencodePath = installations[0].executablePath;
      }
    }

    await this.saveSettings();
  }

  getInstallationManager(): InstallationManager {
    return this.installationManager;
  }

  getOpencodeSettingsManager(): OpencodeSettingsManager | null {
    return this.opencodeSettingsManager;
  }
}
