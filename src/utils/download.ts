import * as fs from "fs";
import * as path from "path";

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Download a file with progress tracking.
 * Note: Obsidian plugins run in Node.js environment, so we can use https/http modules.
 * However, for npm packages, we typically use npm directly to download.
 */
export async function downloadFile(
  url: string,
  destination: string,
  onProgress?: ProgressCallback
): Promise<void> {
  // For now, we'll use a simple approach - delegate to npm
  // This is a placeholder for future direct download implementation
  throw new Error("Direct download not implemented - use npm to install packages");
}

/**
 * Check if a file exists and is accessible
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, create if it doesn't
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Get directory size
 */
export async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;

  async function calculateSize(filePath: string): Promise<void> {
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      const files = await fs.promises.readdir(filePath);
      for (const file of files) {
        await calculateSize(path.join(filePath, file));
      }
    } else {
      size += stats.size;
    }
  }

  await calculateSize(dirPath);
  return size;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
