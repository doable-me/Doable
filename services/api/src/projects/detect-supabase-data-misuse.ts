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

/** True when the file imports the Supabase JS client package directly. */
function usesSupabaseClientPackage(content: string): boolean {
  return /["'`]@supabase\/supabase-js["'`]/.test(content);
}

/**
 * Deterministic guard for the provision RACE. `provision_supabase` only OPENS a
 * user-gated "Connect Supabase" dialog and returns immediately — the connection
 * (and thus the DB credentials + a real project ref) does not exist until the
 * user completes it. The model frequently races ahead in the SAME turn: it calls
 * `provision_supabase`, then `run_supabase_migration` (which fails — "no project
 * ref"), then writes the `@supabase/supabase-js` client + components — leaving a
 * half-built app whose tables were never created. The user then has to re-prompt
 * ("use supabase") to make it work, so it looks intermittent.
 *
 * We stop the race at the single write chokepoint: a source file that imports
 * `@supabase/supabase-js` while NO supabase connection exists for the project is
 * REJECTED with a STOP-and-wait message. This forces the turn to end after
 * provisioning. When the user finishes the dialog, the editor automatically
 * restarts the dev server and re-prompts the agent ("Supabase provisioning
 * complete…", see apps/web .../editor/[projectId]/page.tsx onClose) — and by then
 * the connection IS present, so `isProjectSupabaseBacked` is true and this guard
 * allows the write. Net: migrations + client code only run once the DB is real.
 *
 * Fast-path (only looks up the DB when the file imports the client package) and
 * fail-open (never blocks on infra error), exactly like the sibling guard.
 */
export async function supabaseNotConnectedViolation(
  projectId: string,
  relPath: string,
  content: string,
): Promise<string | null> {
  if (!isInspectableSource(relPath)) return null;
  if (typeof content !== "string" || content.length === 0) return null;

  // Fast path — only candidate files import the Supabase client package.
  if (!usesSupabaseClientPackage(content)) return null;

  // If a Supabase connection already exists for this project, the write is fine.
  if (await isProjectSupabaseBacked(projectId)) return null;

  return (
    "Supabase is NOT connected to this project yet. `provision_supabase` only opens " +
    "the Connect-Supabase dialog for the user — the database connection is not ready " +
    "until they complete it, so you CANNOT write Supabase client code or run " +
    "migrations yet (a migration now fails with 'no project ref' and leaves the app " +
    "referencing tables that were never created).\n\n" +
    "STOP this turn now: do not write `@supabase/supabase-js` code and do not call " +
    "run_supabase_migration. End with a short message asking the user to finish " +
    "connecting Supabase in the dialog. Doable will then restart the dev server and " +
    "automatically re-prompt you with 'Supabase provisioning complete' — ONLY THEN " +
    "create tables with run_supabase_migration and write the client code using " +
    "import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY."
  );
}

// ─── Schema-first enforcement: block querying tables that don't exist yet ─────
//
// Root-cause class (traced on a real demo app): a Supabase-backed app ships
// client code that queries `supabase.from('<table>')`, but run_supabase_migration
// never created that table in the connected project. Supabase's PostgREST then
// 404s every call ("relation does not exist") and no data can be read or stored
// — with no clear signal to the user. §0e mandates "SCHEMA FIRST", but that is
// only model GUIDANCE; nothing verified the table actually existed before the
// query code was written, so generated apps could ship referencing tables that
// don't exist.
//
// This guard makes it DETERMINISTIC: when a Supabase-backed project writes app
// code that queries a literal table via `.from('<table>')`, we check the LIVE
// Supabase project (Management API) for that table and REJECT the write if it is
// missing, instructing the model to run_supabase_migration first. Net: query
// code can only be written once the table truly exists.
//
// Cheap + fail-open: only fires for files that query a literal table on a
// Supabase-backed project; the (one) Management-API table listing is cached per
// project with a short TTL and invalidated after each migration; ANY failure
// (no mgmt token, API error, dynamic table name) returns null so a legitimate
// write is never blocked on infra trouble.

const SUPABASE_MGMT_API = "https://api.supabase.com";

/** Extract table names from `.from('<table>')` / `.from("<table>")` calls. */
function extractQueriedTables(content: string): string[] {
  const out = new Set<string>();
  const re = /\.from\(\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

interface TableCacheEntry { tables: Set<string>; at: number }
const tableCache = new Map<string, TableCacheEntry>();
const TABLE_CACHE_TTL_MS = 15_000;

/**
 * Drop the cached Supabase table set for a project. Call this right after a
 * successful run_supabase_migration so newly-created tables are visible to the
 * very next write (instead of waiting out the TTL).
 */
export function invalidateSupabaseTableCache(projectId: string): void {
  tableCache.delete(projectId);
}

/**
 * Resolve { projectRef, accessToken } for a project's connected Supabase, or
 * null if it can't be determined. projectRef comes from the (non-secret)
 * `supabase` connection metadata; the management OAuth token is decrypted via
 * the credential vault under the workspace owner (whoever connected Supabase).
 */
async function resolveSupabaseMgmt(
  projectId: string,
): Promise<{ projectRef: string; accessToken: string } | null> {
  const rows = await sql<{ project_ref: string; workspace_id: string; owner_id: string }[]>`
    SELECT ic.metadata->>'projectRef' AS project_ref, p.workspace_id, w.owner_id
    FROM integration_connections ic
    JOIN projects p ON p.workspace_id = ic.workspace_id
    JOIN workspaces w ON w.id = p.workspace_id
    WHERE p.id = ${projectId}
      AND ic.integration_id = 'supabase'
      AND ic.metadata->>'projectRef' IS NOT NULL
    ORDER BY (ic.scope = 'project') DESC
    LIMIT 1
  `;
  const projectRef = rows[0]?.project_ref;
  const ownerId = rows[0]?.owner_id;
  const workspaceId = rows[0]?.workspace_id;
  if (!projectRef || !ownerId || !workspaceId) return null;

  // Dynamic import mirrors the run_supabase_migration handler — avoids a static
  // import cycle and only loads the vault on the (rare) candidate-write path.
  const { credentialVault } = await import("../integrations/credential-vault.js");
  const mgmtConn = await credentialVault.get(ownerId, "supabase-mgmt", workspaceId, projectId);
  const accessToken = (mgmtConn?.credentials as Record<string, unknown> | null)?.access_token as
    | string
    | undefined;
  if (!accessToken) return null;
  return { projectRef, accessToken };
}

/**
 * Live set of `public` table names in the connected Supabase project, cached
 * per project with a short TTL. Returns null when it can't be resolved (so the
 * caller fails open).
 */
async function listSupabaseTables(projectId: string): Promise<Set<string> | null> {
  const cached = tableCache.get(projectId);
  if (cached && Date.now() - cached.at < TABLE_CACHE_TTL_MS) return cached.tables;

  const ctx = await resolveSupabaseMgmt(projectId);
  if (!ctx) return null;

  const res = await fetch(`${SUPABASE_MGMT_API}/v1/projects/${ctx.projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select tablename from pg_tables where schemaname='public'" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ tablename?: string }>;
  const tables = new Set(
    data.map((r) => r.tablename).filter((t): t is string => typeof t === "string" && t.length > 0),
  );
  tableCache.set(projectId, { tables, at: Date.now() });
  return tables;
}

/**
 * Return a human-readable reason when `content` queries a Supabase table that
 * does not exist in the project's connected Supabase project (so the app would
 * 404 on every call), or `null` when the file is fine.
 *
 * Fast (only inspects files that query a literal table) and fail-open (never
 * blocks a write on infra failure / unresolvable credentials).
 */
export async function supabaseMissingTableViolation(
  projectId: string,
  relPath: string,
  content: string,
): Promise<string | null> {
  if (!isInspectableSource(relPath)) return null;
  if (typeof content !== "string" || content.length === 0) return null;

  // Fast path — only files that query a literal Supabase table are candidates,
  // and only when the Supabase client is actually in play in this file.
  const queried = extractQueriedTables(content);
  if (queried.length === 0) return null;
  if (!/["'`]@supabase\/supabase-js["'`]/.test(content) && !/\bsupabase\b/.test(content)) return null;

  if (!(await isProjectSupabaseBacked(projectId))) return null;

  let existing: Set<string> | null;
  try {
    existing = await listSupabaseTables(projectId);
  } catch (err) {
    console.warn(
      `[supabase-schema-guard] table listing failed for ${projectId} — failing open:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!existing) return null; // couldn't resolve creds / tables — fail open

  const missing = queried.filter((t) => !existing!.has(t));
  if (missing.length === 0) return null;

  const quoted = missing.map((t) => `'${t}'`).join(", ");
  const plural = missing.length > 1;
  const have = [...existing].sort();
  return (
    `This file queries the Supabase table(s) ${quoted} via \`.from(...)\`, but ` +
    `${plural ? "they do" : "it does"} NOT exist in your connected Supabase project yet — so every ` +
    `query would 404 ("relation does not exist") and no data could be read or stored.\n\n` +
    `⛔ SCHEMA FIRST (framework prompt §0e): call \`run_supabase_migration\` with the full ` +
    `\`CREATE TABLE IF NOT EXISTS <name> (...)\` DDL (plus any RLS policy) for ${quoted} BEFORE ` +
    `writing code that queries ${plural ? "them" : "it"}, then write this file again. ` +
    (have.length
      ? `Tables that currently exist in your project: ${have.join(", ")}.`
      : `Your Supabase project currently has no tables.`)
  );
}
