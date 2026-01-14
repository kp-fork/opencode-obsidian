export type ViewLocation = "sidebar" | "main";

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

export interface OpenCodeSettings {
  port: number;
  hostname: string;
  autoStart: boolean;
  opencodePath: string;
  projectDirectory: string;
  startupTimeout: number;
  defaultViewLocation: ViewLocation;

  // New installation management settings
  installations: Installation[];
  selectedInstallationId: string | null;
  opencodeConfigPath: string;
  autoInstallEnabled: boolean;
  checkForUpdates: boolean;
}

export const DEFAULT_SETTINGS: OpenCodeSettings = {
  port: 14096,
  hostname: "127.0.0.1",
  autoStart: false,
  opencodePath: "opencode",
  projectDirectory: "",
  startupTimeout: 15000,
  defaultViewLocation: "sidebar",
  installations: [],
  selectedInstallationId: null,
  opencodeConfigPath: "",
  autoInstallEnabled: false,
  checkForUpdates: true,
};

export const OPENCODE_VIEW_TYPE = "opencode-view";
