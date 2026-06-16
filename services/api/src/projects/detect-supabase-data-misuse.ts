/**
 * Deterministic guard: block per-app PGlite (`@doable/data`) usage in apps whose
 * database is a connected Supabase project.
 *
 * When a `supabase` connection exists for a project (the user connected it, or
 * the AI provisioned it via `provision_supabase`), Supabase — NOT the inbuilt
 * per-app PGlite DB — is that project's database (framework-prompts/vite-react.ts
 * §0e). The model is told this, but under pressure (e.g. an `npm install
 * @supabase/supabase-js` that times out, or a long multi-file edit) it regresses
 * and writes `import { db } from "@doable/data"` again — so the user's records
 * land in the throwaway per-app DB instead of their own Supabase project, and the
 * connected Supabase looks empty. Guidance alone does not stop this regression.
 *
 * So we enforce it deterministically at the single write chokepoint
 * (ai/project-files.ts: writeProjectFile, which both the native create_file/
 * edit_file tools and the copilot write path converge on). A generated/edited
 * source file that pulls in `@doable/data` while the project is Supabase-backed
 * is REJECTED with an actionable message telling the agent to use
 * `@supabase/supabase-js` instead.
 *
 * Precise + cheap by design:
 *   - Fast path: returns null immediately unless the file actually references the
 *     `@doable/data` import specifier — so the (one) DB lookup only happens on
 *     the rare write that is a candidate violation, never on the common case.
 *   - Fail-open: any error resolving the connection returns null (never blocks a
 *     legitimate write on infra failure).
 *   - Generic: keys only off "a supabase connection exists for this project" +
 *     "this file imports @doable/data". No project/account/Supabase-ref specifics.
 */

import { sql } from "../db/index.js";

/** Source files we inspect — generated app code only (mirrors detect-mcp-agent-misuse). */
function isInspectableSource(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  if (p.includes("node_modules/")) return false;
  return /\.(t|j)sx?$/.test(p);
}

/**
 * True when the file pulls in the per-app PGlite DB. The import specifier
 * `@doable/data` is the definitive signal — it is how app code reaches the
 * inbuilt DB (`import { db } from "@doable/data"`). Matches single/double/back
 * quotes and `import(...)`/`from "..."` forms.
 */
function usesDoableData(content: string): boolean {
  return /["'`]@doable\/data["'`]/.test(content);
}

/**
 * Whether the given project's database is a connected Supabase project. True
 * when ANY `supabase` connection is effective for the project — workspace-scope,
 * this-project-scope, or user-scope (the data-binding rule in §0e treats any of
 * these as "Supabase is the DB"). Never throws — returns false on error so the
 * guard fails open.
 */
export async function isProjectSupabaseBacked(projectId: string): Promise<boolean> {
  try {
    const rows = await sql<{ one: number }[]>`
      SELECT 1 AS one
      FROM integration_connections ic
      JOIN projects p ON p.workspace_id = ic.workspace_id
      WHERE p.id = ${projectId}
        AND ic.integration_id = 'supabase'
        AND (
          ic.scope = 'workspace'
          OR (ic.scope = 'project' AND ic.project_id = ${projectId})
          OR ic.scope = 'user'
        )
      LIMIT 1
    `;
    return rows.length > 0;
  } catch (err) {
    console.warn(
      `[supabase-data-guard] connection lookup failed for ${projectId} — failing open:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Return a human-readable reason when `content` uses `@doable/data` in a project
 * whose database is a connected Supabase project (and should use
 * `@supabase/supabase-js` instead), or `null` when the file is fine.
 *
 * Cheap: only does the connection lookup for files that actually reference
 * `@doable/data`. Safe to call on every write.
 */
export async function supabaseDataMisuseViolation(
  projectId: string,
  relPath: string,
  content: string,
): Promise<string | null> {
  if (!isInspectableSource(relPath)) return null;
  if (typeof content !== "string" || content.length === 0) return null;

  // Fast path — the overwhelming majority of writes never touch @doable/data.
  if (!usesDoableData(content)) return null;

  // Candidate: does this project's DB live in a connected Supabase project?
  if (!(await isProjectSupabaseBacked(projectId))) return null;

  return (
    "This project's database is a connected Supabase project, so it MUST NOT use " +
    "the inbuilt per-app database (`@doable/data`) — records would land in a " +
    "throwaway PGlite DB instead of the user's Supabase, and their connected " +
    "Supabase would look empty. Remove the `@doable/data` import and every " +
    "`db.query`/`db.exec`/`data.migrate`/`data.schema` call from this file, and " +
    "use the Supabase client instead:\n\n" +
    "  import { createClient } from \"@supabase/supabase-js\";\n" +
    "  const url = import.meta.env.VITE_SUPABASE_URL ?? \"\";\n" +
    "  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? \"\";\n" +
    "  export const supabase = url ? createClient(url, key, { auth: { persistSession: false } }) : null;\n\n" +
    "Do EVERY read/write through `supabase.from('<table>').select()/insert()/update()/delete()`. " +
    "Create tables in Supabase with the `supabase_migrate` tool (run the CREATE TABLE DDL there), " +
    "NOT `data.migrate`. See framework prompt §0e."
  );
}
