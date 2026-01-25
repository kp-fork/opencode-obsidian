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
    // Native binaries (prefer these - no node required)
    "~/node_modules/opencode-darwin-arm64/bin/opencode",
    "~/node_modules/opencode-darwin-x64/bin/opencode",
    "~/.bun/node_modules/opencode-darwin-arm64/bin/opencode",
    "~/.bun/node_modules/opencode-darwin-x64/bin/opencode",
    "/usr/local/lib/node_modules/opencode-darwin-arm64/bin/opencode",
    "/usr/local/lib/node_modules/opencode-darwin-x64/bin/opencode",
    // Wrapper scripts (these require node in PATH - less preferred)
    "~/node_modules/.bin/opencode",
    "~/.bun/bin/opencode",
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
    "~/.local/bin/opencode",
  ];
}

export async function detectExistingOpenCode(): Promise<string | null> {
  // First check common paths for native binaries (no node required)
  console.log("[OpenCode] Checking for native opencode binaries...");
  for (const p of getCommonOpenCodePaths()) {
    const expanded = p.replace("~", process.env.HOME || "");
    console.log("[OpenCode] Checking path:", expanded);
    if (fs.existsSync(expanded)) {
      console.log("[OpenCode] Found opencode at:", expanded);
      return expanded;
    }
  }

  // Fallback: try 'which opencode' (may return wrapper script requiring node)
  try {
    const { stdout } = await execAsync("which opencode");
    const path = stdout.trim();
    console.log("[OpenCode] Found via which:", path);
    // Check if it's a wrapper script (has node shebang)
    try {
      const content = fs.readFileSync(path, "utf-8");
      if (content.startsWith("#!/usr/bin/env node")) {
        console.log("[OpenCode] Warning: 'which' returned a wrapper script that requires node in PATH");
      }
    } catch {}
    return path;
  } catch {
    console.log("[OpenCode] No opencode found");
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
