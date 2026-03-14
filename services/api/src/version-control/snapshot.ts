import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

// ─── Types ──────────────────────────────────────────────────
export interface FileEntry {
  path: string;
  content: string;
  size: number;
}

export interface Snapshot {
  files: FileEntry[];
  createdAt: string;
  totalSize: number;
}

// Directories and patterns to skip when snapshotting
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".env",
]);

const IGNORED_EXTENSIONS = new Set([
  ".lock",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".zip",
  ".tar",
  ".gz",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB per file

// ─── Snapshot Creation ──────────────────────────────────────

async function collectFiles(
  basePath: string,
  currentPath: string,
  files: FileEntry[]
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      await collectFiles(basePath, fullPath, files);
    } else if (entry.isFile()) {
      const ext = entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext)) continue;

      const fileStat = await stat(fullPath);
      if (fileStat.size > MAX_FILE_SIZE) continue;

      try {
        const content = await readFile(fullPath, "utf-8");
        const relativePath = relative(basePath, fullPath).replace(/\\/g, "/");
        files.push({
          path: relativePath,
          content,
          size: fileStat.size,
        });
      } catch {
        // Skip files that can't be read (binary, permission issues)
      }
    }
  }
}

export async function createSnapshot(projectPath: string): Promise<Snapshot> {
  const files: FileEntry[] = [];
  await collectFiles(projectPath, projectPath, files);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    files,
    createdAt: new Date().toISOString(),
    totalSize,
  };
}

// ─── Snapshot Restoration ───────────────────────────────────

export async function restoreSnapshot(
  projectPath: string,
  snapshot: Snapshot
): Promise<{ restoredFiles: number; errors: string[] }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  let restoredFiles = 0;
  const errors: string[] = [];

  for (const file of snapshot.files) {
    const fullPath = join(projectPath, file.path);

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf-8");
      restoredFiles++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore ${file.path}: ${message}`);
    }
  }

  return { restoredFiles, errors };
}

// ─── Snapshot Serialization ─────────────────────────────────

export function snapshotToJson(snapshot: Snapshot): Record<string, unknown> {
  return {
    files: snapshot.files.map((f) => ({
      path: f.path,
      content: f.content,
      size: f.size,
    })),
    createdAt: snapshot.createdAt,
    totalSize: snapshot.totalSize,
  };
}

export function jsonToSnapshot(data: Record<string, unknown>): Snapshot {
  const rawFiles = data.files as Array<{
    path: string;
    content: string;
    size: number;
  }>;

  return {
    files: rawFiles.map((f) => ({
      path: f.path,
      content: f.content,
      size: f.size,
    })),
    createdAt: data.createdAt as string,
    totalSize: data.totalSize as number,
  };
}
