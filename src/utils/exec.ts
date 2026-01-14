import { spawn } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd, env = process.env, timeout = 30000 } = options;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(command, args, {
      cwd,
      env: { ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function execWithProgress(
  command: string,
  args: string[],
  onStdout?: (data: string) => void,
  onStderr?: (data: string) => void,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd, env = process.env, timeout = 300000 } = options; // 5 min default for npm install

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(command, args, {
      cwd,
      env: { ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      onStdout?.(text);
    });

    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      onStderr?.(text);
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function parseVersionFromOutput(output: string): string | null {
  // Try to match version patterns like "1.2.3" or "v1.2.3"
  const versionMatch = output.match(/v?(\d+\.\d+\.\d+)/);
  return versionMatch ? versionMatch[1] : null;
}
