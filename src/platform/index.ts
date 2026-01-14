import { platform, arch } from "os";
import type { Plugin } from "obsidian";

export type Platform = "darwin" | "win32" | "linux";
export type Arch = "x64" | "arm64" | "ia32";

export function getPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "win32" || p === "linux") {
    return p;
  }
  throw new Error(`Unsupported platform: ${p}`);
}

export function getArch(): Arch {
  const a = arch();
  if (a === "x64" || a === "arm64" || a === "ia32") {
    return a;
  }
  throw new Error(`Unsupported architecture: ${a}`);
}

export function getExecutableExtension(): string {
  return getPlatform() === "win32" ? ".exe" : "";
}

export async function getPluginDataDir(plugin: Plugin): Promise<string> {
  const adapter = plugin.app.vault.adapter as any;
  const vaultPath = adapter.basePath || "";

  // Obsidian plugins store data in .obsidian/plugins/<plugin-id>/data
  const dataDir = `${vaultPath}/.obsidian/plugins/${plugin.manifest.id}/data`;

  return dataDir;
}

export function getInstallationsDir(dataDir: string): string {
  return `${dataDir}/installations`;
}

export function getConfigDir(dataDir: string): string {
  return `${dataDir}/config`;
}

export function getDownloadsDir(dataDir: string): string {
  return `${dataDir}/downloads`;
}
