import { readFile, writeFile, unlink, readdir, mkdir, stat } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { writeFileThroughYjs } from "./yjs-bridge.js";

// ─── Configuration ────────────────────────────────────────

const PROJECTS_ROOT = process.env.DOABLE_PROJECTS_DIR ?? join(process.cwd(), "projects");

const FORBIDDEN_PATHS = [
  "..",
  "node_modules",
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  "dist",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ─── Path Resolution ──────────────────────────────────────

export function getProjectPath(projectId: string): string {
  return join(PROJECTS_ROOT, projectId);
}

export function resolveFilePath(projectId: string, filePath: string): string {
  const projectPath = getProjectPath(projectId);
  const resolved = resolve(projectPath, filePath);

  // Prevent path traversal
  if (!resolved.startsWith(projectPath)) {
    throw new FileAccessError(`Path traversal detected: ${filePath}`);
  }

  return resolved;
}

function validatePath(filePath: string): void {
  const segments = filePath.split(/[/\\]/);
  for (const segment of segments) {
    if (FORBIDDEN_PATHS.includes(segment)) {
      throw new FileAccessError(`Access to '${segment}' is forbidden`);
    }
  }
}

// ─── File Operations ──────────────────────────────────────

export async function readProjectFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  validatePath(filePath);
  const fullPath = resolveFilePath(projectId, filePath);

  try {
    const stats = await stat(fullPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new FileAccessError(
        `File exceeds max size (${stats.size} > ${MAX_FILE_SIZE})`,
      );
    }
    return await readFile(fullPath, "utf-8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new FileNotFoundError(filePath);
    }
    throw err;
  }
}

export async function writeProjectFile(
  projectId: string,
  filePath: string,
  content: string,
): Promise<void> {
  validatePath(filePath);

  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
    throw new FileAccessError("Content exceeds max file size");
  }

  // Try to write through Yjs CRDT if collaboration is active
  try {
    const result = await writeFileThroughYjs(projectId, filePath, content);
    if (result.handled) {
      return; // CRDT handled the write — persistence is debounced
    }
  } catch {
    // Fall through to direct write
  }

  // Direct filesystem write (no active collaboration)
  const fullPath = resolveFilePath(projectId, filePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

export async function deleteProjectFile(
  projectId: string,
  filePath: string,
): Promise<void> {
  validatePath(filePath);
  const fullPath = resolveFilePath(projectId, filePath);

  try {
    await unlink(fullPath);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new FileNotFoundError(filePath);
    }
    throw err;
  }
}

export async function listProjectFiles(
  projectId: string,
  directory = ".",
  options: { recursive?: boolean; maxDepth?: number } = {},
): Promise<string[]> {
  validatePath(directory);
  const { recursive = true, maxDepth = 10 } = options;
  const projectPath = getProjectPath(projectId);
  const dirPath = resolveFilePath(projectId, directory);

  if (!existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  await walkDir(dirPath, projectPath, files, recursive, maxDepth, 0);
  return files.sort();
}

async function walkDir(
  dir: string,
  root: string,
  results: string[],
  recursive: boolean,
  maxDepth: number,
  depth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (FORBIDDEN_PATHS.includes(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".doable") continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (recursive) {
        await walkDir(fullPath, root, results, recursive, maxDepth, depth + 1);
      }
    } else {
      results.push(relPath);
    }
  }
}

export async function ensureProjectDir(projectId: string): Promise<string> {
  const projectPath = getProjectPath(projectId);
  await mkdir(projectPath, { recursive: true });
  return projectPath;
}

export async function ensureDoableDir(projectId: string): Promise<string> {
  const doablePath = join(getProjectPath(projectId), ".doable");
  await mkdir(doablePath, { recursive: true });
  return doablePath;
}

// ─── Errors ───────────────────────────────────────────────

export class FileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileAccessError";
  }
}

export class FileNotFoundError extends Error {
  readonly filePath: string;
  constructor(filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = "FileNotFoundError";
    this.filePath = filePath;
  }
}

// ─── Helpers ──────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
