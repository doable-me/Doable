/**
 * Path-safety helper — reject any user-controlled file path that could escape
 * a project directory before it reaches the in-memory store, the filesystem,
 * or an AI tool call.
 *
 * Background: BUG-CORPUS-EDT-002 — POST /projects/:id/files accepted
 * `{"path":"../../escape.txt"}` verbatim. The same field flows into AI
 * create_file / edit_file tool handlers that touch disk, so the surface
 * is wider than just the in-memory map.
 *
 * Rules enforced:
 *   1. Reject empty / non-string paths.
 *   2. Reject NUL bytes.
 *   3. Reject absolute paths — POSIX (`/etc/passwd`) and Windows drive
 *      letters / UNC (`C:\Windows`, `\\server\share`).
 *   4. Reject backslashes on POSIX — Windows-style separators tucked into
 *      a POSIX-running API are a strong signal of an attempted bypass and
 *      `path.normalize` does not collapse them on POSIX.
 *   5. After POSIX-normalization, reject any segment equal to `..`.
 *   6. Resolve the candidate against `<projectsRoot>/<projectId>` and verify
 *      the resolved absolute path is contained within that directory.
 *
 * Used at every user-controlled boundary:
 *   - services/api/src/routes/editor.ts (POST/PUT/GET/DELETE handlers)
 *   - services/api/src/routes/project-files/file-crud.ts (PUT/GET/DELETE)
 *   - defense-in-depth via the same validation invoked from
 *     services/api/src/ai/project-files.ts (validatePath()).
 */

import path from "node:path";

const POSIX_ABSOLUTE_RE = /^\//;
// Matches `C:\`, `C:/`, `\\?\`, `\\.\` and bare `\\server\share` UNC paths.
const WINDOWS_ABSOLUTE_RE = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

export interface PathSafetyResult {
  ok: boolean;
  /** Reason code suitable for an API error body. */
  code?:
    | "empty_path"
    | "nul_byte"
    | "absolute_path"
    | "backslash"
    | "traversal"
    | "escapes_project_dir";
  /** Human-readable message safe to return to the caller. */
  message?: string;
  /** Normalized POSIX-style path (only set when ok === true). */
  normalized?: string;
}

/**
 * Defaults to the Node POSIX root so the resolved-path containment check
 * works the same on Windows dev boxes as on the Linux API server.
 */
function getProjectsRoot(): string {
  return (
    process.env.DOABLE_PROJECTS_DIR ?? path.join(process.cwd(), "projects")
  );
}

/**
 * Run all containment checks against a user-controlled relative path.
 * Pure function — no I/O. Safe to call from a zod refine, a route handler,
 * or an AI tool execute().
 */
export function validatePathSafe(
  candidate: unknown,
  projectId: string,
): PathSafetyResult {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return {
      ok: false,
      code: "empty_path",
      message: "path is required and must be a non-empty string",
    };
  }

  if (candidate.includes("\0")) {
    return {
      ok: false,
      code: "nul_byte",
      message: "path contains NUL byte",
    };
  }

  if (POSIX_ABSOLUTE_RE.test(candidate) || WINDOWS_ABSOLUTE_RE.test(candidate)) {
    return {
      ok: false,
      code: "absolute_path",
      message: "absolute paths are not allowed",
    };
  }

  // Reject backslashes regardless of host OS. The API normalizes on POSIX
  // semantics; a backslash is either a Windows separator (rejected as a
  // potential bypass) or a literal in a filename (we don't support those
  // for project files).
  if (candidate.includes("\\")) {
    return {
      ok: false,
      code: "backslash",
      message: "backslash characters are not allowed in paths",
    };
  }

  // Normalize via POSIX so `..` collapsing matches the on-disk join below.
  const normalized = path.posix.normalize(candidate);

  // After normalization any leading `..` means the path escapes upward.
  // path.posix.normalize collapses interior `..` so a residual `..` segment
  // can only appear at the start (e.g. `..`, `../foo`, `../../etc`).
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    return {
      ok: false,
      code: "traversal",
      message: "path traversal segments (..) are not allowed",
    };
  }

  // Belt-and-braces containment check: resolve the candidate against the
  // canonical project directory and require the result to live under it.
  const projectDir = path.resolve(getProjectsRoot(), projectId);
  const resolved = path.resolve(projectDir, normalized);
  const rel = path.relative(projectDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      ok: false,
      code: "escapes_project_dir",
      message: "resolved path is outside the project directory",
    };
  }

  return { ok: true, normalized };
}

/**
 * Convenience wrapper: throw a tagged error if the path is unsafe.
 * Used by the AI project-files layer for defense in depth.
 */
export class UnsafePathError extends Error {
  readonly code: NonNullable<PathSafetyResult["code"]>;
  constructor(code: NonNullable<PathSafetyResult["code"]>, message: string) {
    super(message);
    this.name = "UnsafePathError";
    this.code = code;
  }
}

export function assertPathSafe(candidate: unknown, projectId: string): string {
  const result = validatePathSafe(candidate, projectId);
  if (!result.ok || !result.normalized) {
    throw new UnsafePathError(
      result.code ?? "traversal",
      result.message ?? "invalid path",
    );
  }
  return result.normalized;
}
