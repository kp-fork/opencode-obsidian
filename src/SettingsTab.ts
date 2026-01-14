import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { existsSync, statSync } from "fs";
import { homedir } from "os";
import type OpenCodePlugin from "./main";
import type { ViewLocation, Installation } from "./types";
import type { InstallationState } from "./InstallationManager";

function expandTilde(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return path.replace("~", homedir());
  }
  return path;
}

export class OpenCodeSettingTab extends PluginSettingTab {
  plugin: OpenCodePlugin;
  private validateTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, plugin: OpenCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "OpenCode Settings" });
    containerEl.createEl("h3", { text: "Server Configuration" });

    new Setting(containerEl)
      .setName("Port")
      .setDesc("Port number for the OpenCode web server")
      .addText((text) =>
        text
          .setPlaceholder("14096")
          .setValue(this.plugin.settings.port.toString())
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.port = port;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Hostname")
      .setDesc("Hostname to bind the server to (usually 127.0.0.1)")
      .addText((text) =>
        text
          .setPlaceholder("127.0.0.1")
          .setValue(this.plugin.settings.hostname)
          .onChange(async (value) => {
            this.plugin.settings.hostname = value || "127.0.0.1";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("OpenCode path")
      .setDesc(
        "Path to the OpenCode executable. Leave as 'opencode' if it's in your PATH."
      )
      .addText((text) =>
        text
          .setPlaceholder("opencode")
          .setValue(this.plugin.settings.opencodePath)
          .onChange(async (value) => {
            this.plugin.settings.opencodePath = value || "opencode";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Project directory")
      .setDesc(
        "Override the starting directory for OpenCode. Leave empty to use the vault root. Supports ~ for home directory."
      )
      .addText((text) =>
        text
          .setPlaceholder("/path/to/project or ~/project")
          .setValue(this.plugin.settings.projectDirectory)
          .onChange((value) => {
            // Debounce validation to avoid spamming notices on every keypress
            if (this.validateTimeout) {
              clearTimeout(this.validateTimeout);
            }
            this.validateTimeout = setTimeout(async () => {
              await this.validateAndSetProjectDirectory(value);
            }, 500);
          })
      );

    containerEl.createEl("h3", { text: "Behavior" });

    new Setting(containerEl)
      .setName("Auto-start server")
      .setDesc(
        "Automatically start the OpenCode server when Obsidian opens (not recommended for faster startup)"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoStart)
          .onChange(async (value) => {
            this.plugin.settings.autoStart = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default view location")
      .setDesc(
        "Where to open the OpenCode panel: sidebar opens in the right panel, main opens as a tab in the editor area"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("sidebar", "Sidebar")
          .addOption("main", "Main window")
          .setValue(this.plugin.settings.defaultViewLocation)
          .onChange(async (value) => {
            this.plugin.settings.defaultViewLocation = value as ViewLocation;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "OpenCode Installation" });

    this.renderInstallationSection(containerEl);

    containerEl.createEl("h3", { text: "Server Status" });

    const statusContainer = containerEl.createDiv({ cls: "opencode-settings-status" });
    this.renderServerStatus(statusContainer);
  }

  private async validateAndSetProjectDirectory(value: string): Promise<void> {
    const trimmed = value.trim();

    // Empty value is valid - means use vault root
    if (!trimmed) {
      await this.plugin.updateProjectDirectory("");
      return;
    }

    // Validate absolute path (supports ~, /, and Windows drive letters)
    if (!trimmed.startsWith("/") && !trimmed.startsWith("~") && !trimmed.match(/^[A-Za-z]:\\/)) {
      new Notice("Project directory must be an absolute path (or start with ~)");
      return;
    }

    const expanded = expandTilde(trimmed);

    try {
      if (!existsSync(expanded)) {
        new Notice("Project directory does not exist");
        return;
      }
      const stat = statSync(expanded);
      if (!stat.isDirectory()) {
        new Notice("Project directory path is not a directory");
        return;
      }
    } catch (error) {
      new Notice(`Failed to validate path: ${(error as Error).message}`);
      return;
    }

    await this.plugin.updateProjectDirectory(expanded);
  }

  private renderServerStatus(container: HTMLElement): void {
    container.empty();

    const state = this.plugin.getProcessState();
    const statusText = {
      stopped: "Stopped",
      starting: "Starting...",
      running: "Running",
      error: "Error",
    };

    const statusClass = {
      stopped: "status-stopped",
      starting: "status-starting",
      running: "status-running",
      error: "status-error",
    };

    const statusEl = container.createDiv({ cls: "opencode-status-line" });
    statusEl.createSpan({ text: "Status: " });
    statusEl.createSpan({
      text: statusText[state],
      cls: `opencode-status-badge ${statusClass[state]}`,
    });

    if (state === "running") {
      const urlEl = container.createDiv({ cls: "opencode-status-line" });
      urlEl.createSpan({ text: "URL: " });
      const linkEl = urlEl.createEl("a", {
        text: this.plugin.getServerUrl(),
        href: this.plugin.getServerUrl(),
      });
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(this.plugin.getServerUrl(), "_blank");
      });
    }

    const buttonContainer = container.createDiv({ cls: "opencode-settings-buttons" });

    if (state === "stopped" || state === "error") {
      const startButton = buttonContainer.createEl("button", {
        text: "Start Server",
        cls: "mod-cta",
      });
      startButton.addEventListener("click", async () => {
        await this.plugin.startServer();
        this.renderServerStatus(container);
      });
    }

    if (state === "running") {
      const stopButton = buttonContainer.createEl("button", {
        text: "Stop Server",
      });
      stopButton.addEventListener("click", () => {
        this.plugin.stopServer();
        this.renderServerStatus(container);
      });

      const restartButton = buttonContainer.createEl("button", {
        text: "Restart Server",
        cls: "mod-warning",
      });
      restartButton.addEventListener("click", async () => {
        this.plugin.stopServer();
        await this.plugin.startServer();
        this.renderServerStatus(container);
      });
    }

    if (state === "starting") {
      buttonContainer.createSpan({
        text: "Please wait...",
        cls: "opencode-status-waiting",
      });
    }
  }

  private renderInstallationSection(containerEl: HTMLElement): void {
    const state = this.plugin.getInstallationState();
    const version = this.plugin.getInstalledVersion();
    const installations = this.plugin.getInstallations();

    // Installation status
    const statusText = {
      "not-installed": "Not Installed",
      "installing": "Installing...",
      "installed": "Installed",
      "error": "Error",
    };

    const statusClass = {
      "not-installed": "status-stopped",
      "installing": "status-starting",
      "installed": "status-running",
      "error": "status-error",
    };

    new Setting(containerEl)
      .setName("Installation Status")
      .setDesc("Current status of OpenCode installation")
      .addButton((button) => {
        button
          .setButtonText(statusText[state])
          .setDisabled(true)
          .buttonEl.addClass(`opencode-status-badge ${statusClass[state]}`);
        return button;
      });

    if (version) {
      new Setting(containerEl)
        .setName("Installed Version")
        .setDesc(`OpenCode version ${version} is installed`);
    }

    // Installation actions
    if (state === "not-installed") {
      new Setting(containerEl)
        .setName("Install OpenCode")
        .setDesc("Install OpenCode via npm (requires Node.js and npm)")
        .addButton((button) => {
          button
            .setButtonText("Install")
            .setCta()
            .onClick(async () => {
              button.setDisabled(true);
              button.setButtonText("Installing...");
              await this.plugin.installOpenCode();
              this.display(); // Refresh the UI
            });
          return button;
        });
    }

    // Installation selector
    if (installations.length > 0) {
      new Setting(containerEl)
        .setName("Active Installation")
        .setDesc("Select which OpenCode installation to use")
        .addDropdown((dropdown) => {
          for (const installation of installations) {
            const label = installation.source === "managed"
              ? `Managed (${installation.version})`
              : `System (${installation.version}) - ${installation.executablePath}`;
            dropdown.addOption(installation.id, label);
          }

          dropdown
            .setValue(this.plugin.settings.selectedInstallationId || installations[0].id)
            .onChange(async (value) => {
              await this.plugin.selectInstallation(value);
              this.display();
            });

          return dropdown;
        });

      // Uninstall button for managed installations
      const managedInstallations = installations.filter((i) => i.source === "managed");
      if (managedInstallations.length > 0) {
        new Setting(containerEl)
          .setName("Managed Installations")
          .setDesc("Uninstall managed OpenCode installations");

        for (const installation of managedInstallations) {
          new Setting(containerEl)
            .setName(`Version ${installation.version}`)
            .setDesc(`Installed at ${new Date(installation.installDate).toLocaleString()}`)
            .addButton((button) => {
              button
                .setButtonText("Uninstall")
                .setWarning()
                .onClick(async () => {
                  if (confirm(`Uninstall OpenCode ${installation.version}?`)) {
                    await this.plugin.uninstallOpenCode(installation.id);
                    this.display();
                  }
                });
              return button;
            });
        }
      }
    }

    // Auto-install setting
    new Setting(containerEl)
      .setName("Auto-install on first run")
      .setDesc("Automatically install OpenCode when no installation is found")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoInstallEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoInstallEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    // Check for updates setting
    new Setting(containerEl)
      .setName("Check for updates")
      .setDesc("Periodically check for OpenCode updates")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.checkForUpdates)
          .onChange(async (value) => {
            this.plugin.settings.checkForUpdates = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
