import * as fs from "fs";
import * as path from "path";
import { ensureDir } from "./utils/download";
import type { OpenCodeSettings } from "./types";

export interface OpenCodeConfig {
  server?: {
    port?: number;
    hostname?: string;
  };
  cors?: {
    allowedOrigins?: string[];
  };
}

export class OpencodeSettingsManager {
  private configDir: string;
  private configPath: string;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.configPath = path.join(configDir, "opencode.json");
  }

  /**
   * Generate OpenCode config from plugin settings
   */
  generateConfig(settings: OpenCodeSettings): string {
    const config: OpenCodeConfig = {
      server: {
        port: settings.port,
        hostname: settings.hostname,
      },
      cors: {
        allowedOrigins: ["app://obsidian.md"],
      },
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Write config file to disk
   */
  async writeConfig(settings: OpenCodeSettings): Promise<string> {
    await ensureDir(this.configDir);

    const configContent = this.generateConfig(settings);
    await fs.promises.writeFile(this.configPath, configContent, "utf-8");

    return this.configPath;
  }

  /**
   * Read existing config file
   */
  async readConfig(): Promise<OpenCodeConfig | null> {
    try {
      const content = await fs.promises.readFile(this.configPath, "utf-8");
      return JSON.parse(content) as OpenCodeConfig;
    } catch {
      return null;
    }
  }

  /**
   * Validate config object
   */
  validateConfig(config: unknown): config is OpenCodeConfig {
    if (typeof config !== "object" || config === null) {
      return false;
    }

    const c = config as Record<string, unknown>;

    // Validate server section
    if (c.server !== undefined) {
      if (typeof c.server !== "object" || c.server === null) {
        return false;
      }
      const server = c.server as Record<string, unknown>;

      if (server.port !== undefined && typeof server.port !== "number") {
        return false;
      }

      if (server.hostname !== undefined && typeof server.hostname !== "string") {
        return false;
      }
    }

    // Validate cors section
    if (c.cors !== undefined) {
      if (typeof c.cors !== "object" || c.cors === null) {
        return false;
      }
      const cors = c.cors as Record<string, unknown>;

      if (cors.allowedOrigins !== undefined) {
        if (!Array.isArray(cors.allowedOrigins)) {
          return false;
        }
        if (!cors.allowedOrigins.every((o) => typeof o === "string")) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Merge user config with default config
   */
  mergeConfig(userConfig: Partial<OpenCodeConfig>, defaultConfig: OpenCodeConfig): OpenCodeConfig {
    return {
      ...defaultConfig,
      ...userConfig,
      server: {
        ...defaultConfig.server,
        ...userConfig.server,
      },
      cors: {
        ...defaultConfig.cors,
        ...userConfig.cors,
      },
    };
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Check if config file exists
   */
  async configExists(): Promise<boolean> {
    try {
      await fs.promises.access(this.configPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete config file
   */
  async deleteConfig(): Promise<void> {
    await fs.promises.rm(this.configPath, { force: true });
  }
}
