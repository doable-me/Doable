/**
 * Detect whether an (imported) project uses Supabase.
 *
 * Imported apps (e.g. Lovable / v0 exports) frequently talk to Supabase via
 * `@supabase/supabase-js` + `import.meta.env.VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_ANON_KEY` (client) and `process.env.SUPABASE_*` (SSR). When the
 * committed `.env` ships empty creds and Doable injects nothing, the app silently
 * renders "Supabase is not configured" with no way for the user to know they must
 * connect Supabase. The import flow uses this detector to decide whether to
 * prompt the user to connect their Supabase project (gap #7).
 *
 * Generic + connection-agnostic: keys only off well-known Supabase signals in the
 * imported source — no project/account/Supabase-ref specifics.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Signals that the app talks to Supabase. */
const SUPABASE_SIGNALS = [
  /@supabase\/supabase-js/,
  /\bVITE_SUPABASE_[A-Z_]+/,
  /\bNEXT_PUBLIC_SUPABASE_[A-Z_]+/,
  /\bSUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEY)\b/,
  /\bcreateClient\s*\(/, // supabase-js createClient (paired with the import above)
];

const SCANNABLE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".env", ".example",
]);
const SCAN_FILE_NAMES = new Set([
  ".env", ".env.local", ".env.example", ".env.development",
]);

function looksLikeSupabase(content: string): boolean {
  return SUPABASE_SIGNALS.some((re) => re.test(content));
}

/**
 * Returns true when the project at `projectPath` references Supabase. Checks
 * `package.json` dependencies first (cheap + definitive when present), then
 * walks the source tree (bounded depth, skips node_modules/dot-dirs) for
 * Supabase env-var / client signals. Never throws — returns false on any error.
 */
export async function detectSupabaseUsage(projectPath: string): Promise<boolean> {
  // 1. package.json dependency — the strongest signal.
  try {
    const pkgRaw = await readFile(join(projectPath, "package.json"), "utf-8");
    if (/@supabase\/supabase-js/.test(pkgRaw)) return true;
  } catch {
    // no package.json → still scan source below
  }

  // 2. Bounded source/env scan.
  let found = false;
  async function walk(dir: string, depth: number): Promise<void> {
    if (found || depth > 6) return;
    let entries: Array<{ name: string; isDir: boolean; isFile: boolean }>;
    try {
      const raw = await readdir(dir, { withFileTypes: true });
      entries = raw.map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
        isFile: e.isFile(),
      }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      // Allow dot-files we care about (.env*), skip other dot-dirs/files.
      if (entry.name.startsWith(".") && !SCAN_FILE_NAMES.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDir) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile) continue;
      const dot = entry.name.lastIndexOf(".");
      const ext = dot >= 0 ? entry.name.slice(dot) : "";
      const isEnvFile = SCAN_FILE_NAMES.has(entry.name);
      if (!isEnvFile && !SCANNABLE_EXTS.has(ext)) continue;
      let content: string;
      try {
        content = await readFile(full, "utf-8");
      } catch {
        continue;
      }
      if (looksLikeSupabase(content)) {
        found = true;
        return;
      }
    }
  }
  try {
    await walk(projectPath, 0);
  } catch {
    return found;
  }
  return found;
}
