import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { exec as execSafe, parseVersionFromOutput, VERSION_CHECK_TIMEOUT } from "../utils/exec";

const execAsync = promisify(exec);

export async function detectSystemNpm(): Promise<string | null> {
  try {
    // Check if npm is in PATH
    const { stdout } = await execAsync("which npm");
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function detectSystemNode(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("which node");
    return stdout.trim();
  } catch {
    return null;
  }
}

export function getCommonOpenCodePaths(): string[] {
  return [
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
    "~/.local/bin/opencode",
    "~/node_modules/.bin/opencode",
  ];
}

export async function detectExistingOpenCode(): Promise<string | null> {
  // First try to find in PATH
  try {
    const { stdout } = await execAsync("which opencode");
    return stdout.trim();
  } catch {
    // Check common paths
    for (const p of getCommonOpenCodePaths()) {
      const expanded = p.replace("~", process.env.HOME || "");
      if (fs.existsSync(expanded)) {
        return expanded;
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
