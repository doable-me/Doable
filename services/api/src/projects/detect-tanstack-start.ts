/**
 * Deterministic TanStack Start detection + bootstrap-hijack guard.
 *
 * Lovable exports two flavours of Vite project: classic Vite + React (CSR,
 * `src/main.tsx` + `createRoot`) and TanStack Start (a native bootstrap
 * `src/start.tsx` + file-based routing under `src/routes/`). Doable runs a
 * CLEAN TanStack Start project correctly with NO special handling — it spawns
 * the exact same `vite --config vite.config.platform.mjs` as vite-react, and
 * TanStack's dev middleware serves the client entry. (Proven live:
 * `24d15619` renders via its native `start.tsx`.)
 *
 * The ONLY thing that blanks an imported TanStack Start app is the AI
 * "analyze/migrate" step rewriting the native bootstrap into a CSR
 * `src/main.tsx` + repointed `index.html`. Under the TanStack dev middleware
 * the `@vitejs/plugin-react` Fast-Refresh preamble is never injected into the
 * served HTML, so the CSR entry throws "can't detect preamble" at the first
 * component and the preview goes blank.
 *
 * This module detects TanStack Start from disk — it deliberately does NOT
 * change `projects.framework_id`, so the proven vite runtime and the framework
 * registry are untouched (a `framework_id` the registry can't resolve would
 * make `defaultRegistry.getAdapter` throw and break the spawn entirely). Two
 * consumers key off it:
 *   - routes/chat/system-prompts.ts        → prompt guidance (prevention)
 *   - ai/project-files.ts:writeProjectFile → hard block (enforcement)
 *
 * See ~/doableinfo/LOVABLE_IMPORT_FIX_PLAN.md (Stories 1 + 3) and
 * SESSION_LOG_LOVABLE_IMPORT.md §6 for the full root-cause analysis.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Dependency names that uniquely identify a Lovable TanStack Start export. */
const TANSTACK_DEP_MARKERS = [
  "@tanstack/react-start",
  "@lovable.dev/vite-tanstack-config",
];

/**
 * Cache keyed by absolute projectPath. A project's framework shape does not
 * change at runtime, so detection is memoized to keep `writeProjectFile`
 * (called many times during a build) off the disk. Invalidated on (re-)import
 * via `invalidateTanStackStartCache` so a fresh clone re-detects.
 */
const detectionCache = new Map<string, boolean>();

/** Drop the cached detection for a project — call after a clone/import. */
export function invalidateTanStackStartCache(projectPath: string): void {
  detectionCache.delete(projectPath);
}

/**
 * True iff `projectPath` is a TanStack Start project. Deterministic, disk-only,
 * never throws — any read/parse error degrades to `false` (treat as a normal
 * vite-react project, i.e. apply no special handling).
 */
export function detectTanStackStart(projectPath: string): boolean {
  const cached = detectionCache.get(projectPath);
  if (cached !== undefined) return cached;
  const result = computeDetectTanStackStart(projectPath);
  detectionCache.set(projectPath, result);
  return result;
}

function computeDetectTanStackStart(projectPath: string): boolean {
  // Signal 1 (strongest): dependency markers in package.json (deps OR devDeps).
  try {
    const pkgRaw = readFileSync(join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    if (TANSTACK_DEP_MARKERS.some((m) => m in allDeps)) return true;
  } catch {
    // No / invalid package.json — fall through to the file-shape signal.
  }

  // Signal 2: native bootstrap entry + generated route tree both present.
  const hasStart =
    existsSync(join(projectPath, "src", "start.tsx")) ||
    existsSync(join(projectPath, "src", "start.ts"));
  const hasRouteTree =
    existsSync(join(projectPath, "routeTree.gen.ts")) ||
    existsSync(join(projectPath, "src", "routeTree.gen.ts"));
  return hasStart && hasRouteTree;
}

// ─── Bootstrap-hijack guard ──────────────────────────────

function normalizeRel(relPath: string): string {
  return relPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/**
 * Given a write the AI is about to perform on a TanStack Start project, return
 * a human-readable reason when the write would HIJACK the native bootstrap
 * (the exact corruption that blanks the preview), or `null` when it is safe.
 *
 * Precise by design — it blocks ONLY the CSR-entry swap, never legitimate
 * edits to routes (`src/routes/**`, including `__root.tsx`), components, or
 * styles. Callers must gate on `detectTanStackStart` first; this function
 * assumes the project is already known to be TanStack Start.
 */
export function tanStackHijackViolation(
  relPath: string,
  content: string,
): string | null {
  const rel = normalizeRel(relPath);

  // A CSR entry has no place in a TanStack Start app — its mere creation IS
  // the hijack. (start.tsx is the entry; main.tsx is what the AI wrongly adds.)
  if (rel === "src/main.tsx" || rel === "src/main.ts" || rel === "main.tsx") {
    return (
      "This is a TanStack Start project — its entry is src/start.tsx, not a CSR src/main.tsx. " +
      "Do NOT create a main.tsx / createRoot entry: under TanStack's dev middleware the React " +
      "preamble is never injected and the preview goes blank. Add pages as file routes under " +
      "src/routes/ and edit components under src/components/ instead."
    );
  }

  // The native bootstrap files are fixed platform infrastructure.
  if (rel === "src/start.tsx" || rel === "src/start.ts") {
    return (
      "src/start.* is the fixed TanStack Start bootstrap and must not be rewritten or stubbed. " +
      "Edit routes (src/routes/) and components (src/components/) instead — never the entry."
    );
  }

  // index.html must keep loading the TanStack Start entry. The hijack repoints
  // it at /src/main.tsx; reject any rewrite that drops the start entry or adds
  // a CSR main entry.
  if (rel === "index.html") {
    const pointsAtStart = /src\/start(\.tsx)?/.test(content);
    const pointsAtCsrMain = /src\/main\.(t|j)sx?/.test(content);
    if (!pointsAtStart || pointsAtCsrMain) {
      return (
        "index.html must keep its TanStack Start entry script (/src/start.tsx). Do NOT repoint it " +
        "at a CSR /src/main.tsx — that blanks the preview. Leave index.html's entry as imported and " +
        "add functionality via routes and components."
      );
    }
  }

  return null;
}
