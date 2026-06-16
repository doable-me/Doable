import { readFile, writeFile, unlink, readdir, mkdir, stat } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { writeFileThroughYjs } from "./yjs-bridge.js";
import { validatePathSafe } from "../projects/path-safety.js";
import {
  detectTanStackStart,
  tanStackHijackViolation,
} from "../projects/detect-tanstack-start.js";
import { handRolledMcpAgentViolation } from "../projects/detect-mcp-agent-misuse.js";
import { supabaseDataMisuseViolation } from "../projects/detect-supabase-data-misuse.js";

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

/**
 * Validate a user/AI-supplied relative path before any filesystem op.
 *
 * Defense-in-depth: route handlers also call validatePathSafe at the
 * boundary. Calling it here catches any internal caller (or future AI tool)
 * that bypasses the route layer. See BUG-CORPUS-EDT-002 and
 * services/api/src/projects/path-safety.ts.
 *
 * `.` and an empty directory are tolerated for listProjectFiles which
 * passes the project root itself through this gate.
 */
function validatePath(filePath: string, projectId?: string): void {
  // Allow the project-root sentinel used by listProjectFiles.
  if (filePath !== "." && filePath !== "") {
    const safety = validatePathSafe(filePath, projectId ?? "");
    if (!safety.ok) {
      throw new FileAccessError(safety.message ?? "invalid path");
    }
  }
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
  validatePath(filePath, projectId);
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

// shadcn-style raw-HSL tokens that, when present under `:root`, require a
// matching `--color-<token>: hsl(var(--<token>))` alias inside `@theme` so
// Tailwind v4 emits the corresponding utility (`.text-foreground`, etc.).
const SHADCN_COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
];

export function repairShadcnTheme(css: string): string {
  // Only fire on Tailwind v4 stylesheets that declare raw shadcn tokens.
  // The :root declaration uses raw HSL triplets like `--foreground: 0 0% 9%;`.
  if (!/@import\s+["']tailwindcss["']/.test(css)) return css;
  if (!/:root\s*\{[\s\S]*?--foreground\s*:\s*\d/.test(css)) return css;

  // Find the @theme block (if any). Tailwind v4 requires aliases live there.
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  if (!themeMatch) {
    // No @theme block at all — inject one after @import "tailwindcss";
    const aliases = SHADCN_COLOR_TOKENS
      .map((t) => `  --color-${t}: hsl(var(--${t}));`)
      .join("\n");
    return css.replace(
      /(@import\s+["']tailwindcss["'];?\s*)/,
      `$1\n@theme {\n${aliases}\n}\n\n`,
    );
  }

  // @theme exists — check which color aliases are missing and inject them.
  const themeBody = themeMatch[1] ?? "";
  const missing = SHADCN_COLOR_TOKENS.filter(
    (t) => !new RegExp(`--color-${t}\\s*:`).test(themeBody),
  );
  if (missing.length === 0) return css;

  const injected = missing
    .map((t) => `  --color-${t}: hsl(var(--${t}));`)
    .join("\n");
  return css.replace(
    /@theme\s*\{([\s\S]*?)\}/,
    `@theme {$1${themeBody.endsWith("\n") ? "" : "\n"}${injected}\n}`,
  );
}

export async function writeProjectFile(
  projectId: string,
  filePath: string,
  content: string,
): Promise<void> {
  validatePath(filePath, projectId);

  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
    throw new FileAccessError("Content exceeds max file size");
  }

  // TanStack Start bootstrap protection. The single chokepoint both AI write
  // paths converge on (native create_file/edit_file tools AND the copilot
  // tools, which re-export this as `writeFile`). For a detected TanStack Start
  // project, reject the specific writes that would hijack the native bootstrap
  // (CSR src/main.tsx, rewritten src/start.*, or an index.html repointed off
  // /src/start.tsx) — the exact corruption that blanks an imported preview.
  // Legitimate edits to routes/components/styles pass through untouched.
  // See projects/detect-tanstack-start.ts for the precise rule.
  if (detectTanStackStart(getProjectPath(projectId))) {
    // For the __root.tsx shell-removal check the guard needs the current
    // on-disk content (best-effort; absent on first create).
    let currentContent: string | undefined;
    try {
      currentContent = await readFile(resolveFilePath(projectId, filePath), "utf-8");
    } catch {
      currentContent = undefined;
    }
    const violation = tanStackHijackViolation(filePath, content, currentContent);
    if (violation) {
      throw new FileAccessError(violation);
    }
  }

  // MCP assistant guard. Same single chokepoint: reject a generated source file
  // that hand-rolls an MCP tool-calling loop (ai.chat + doable.mcp.call + manual
  // tool-call parsing / [TOOL_CALL] scraping) instead of using the robust
  // runMcpAgent helper from @doable/ai. Guidance alone doesn't stop the model
  // from writing its own fragile parser, which leaks raw JSON / hallucinated
  // data; this forces the working path. Generic to any MCP server/workspace/
  // project — see projects/detect-mcp-agent-misuse.ts for the precise rule.
  const mcpAgentViolation = handRolledMcpAgentViolation(filePath, content);
  if (mcpAgentViolation) {
    throw new FileAccessError(mcpAgentViolation);
  }

  // Supabase-backed data guard. Same single chokepoint: when this project's
  // database is a connected Supabase project (§0e), reject a source file that
  // pulls in the inbuilt per-app DB (`@doable/data`) — otherwise the model's
  // regression silently writes the user's records to a throwaway PGlite DB and
  // their connected Supabase stays empty. The check is cheap (DB lookup only
  // runs when the file actually imports @doable/data) and fails open. Generic to
  // any workspace/project/Supabase ref — see projects/detect-supabase-data-misuse.ts.
  const supabaseDataViolation = await supabaseDataMisuseViolation(
    projectId,
    filePath,
    content,
  );
  if (supabaseDataViolation) {
    throw new FileAccessError(supabaseDataViolation);
  }

  // AI scaffolds with Tailwind v4 + shadcn-style raw-HSL CSS variables need
  // `--color-*: hsl(var(--*))` aliases inside `@theme` for utility classes
  // like `text-foreground` / `bg-background` to exist. AI agents routinely
  // rewrite index.css and drop those aliases, which silently invisibles every
  // shadcn utility. Auto-repair on write so users never see a half-broken theme.
  if (/(^|\/)(index|globals|app|tailwind)\.css$/i.test(filePath)) {
    content = repairShadcnTheme(content);
  }

  // Always write to the local filesystem so the Vite dev server sees changes immediately
  const fullPath = resolveFilePath(projectId, filePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");

  // Also write through Yjs CRDT if collaboration is active (syncs to other clients)
  try {
    await writeFileThroughYjs(projectId, filePath, content);
  } catch {
    // Non-critical — local write already succeeded
  }
}

export async function deleteProjectFile(
  projectId: string,
  filePath: string,
): Promise<void> {
  validatePath(filePath, projectId);
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
  validatePath(directory, projectId);
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
