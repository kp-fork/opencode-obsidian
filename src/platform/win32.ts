import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import { exec as execSafe, parseVersionFromOutput, VERSION_CHECK_TIMEOUT } from "../utils/exec";

const execAsync = promisify(exec);

export async function detectSystemNpm(): Promise<string | null> {
  try {
    // Use 'where' command on Windows
    const { stdout } = await execAsync("where npm");
    const lines = stdout.trim().split("\n");
    return lines[0] || null;
  } catch {
    return null;
  }
}

export async function detectSystemNode(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("where node");
    const lines = stdout.trim().split("\n");
    return lines[0] || null;
  } catch {
    return null;
  }
}

export function getCommonOpenCodePaths(): string[] {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";

  return [
    `${programFiles}\\OpenCode\\opencode.exe`,
    `${localAppData}\\OpenCode\\opencode.exe`,
    `${appData}\\npm\\opencode.cmd`,
    `${appData}\\npm\\opencode.exe`,
  ];
}

export async function detectExistingOpenCode(): Promise<string | null> {
  // First try to find in PATH
  try {
    const { stdout } = await execAsync("where opencode");
    const lines = stdout.trim().split("\n");
    if (lines[0]) {
      return lines[0];
    }
  } catch {
    // Check common paths
    for (const p of getCommonOpenCodePaths()) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}

export async function getOpenCodeVersion(executablePath: string): Promise<string | null> {
  try {
    // Use safe exec that doesn't use shell interpolation
    const result = await execSafe(executablePath, ["--version"], { timeout: VERSION_CHECK_TIMEOUT });
    return parseVersionFromOutput(result.stdout);
  } catch {
    return null;
  }
}
