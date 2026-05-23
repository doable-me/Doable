/**
 * POST /projects/:id/data-token
 *
 * Mints a short-lived (15 min) project JWT for the settings-UI Database tab.
 * The JWT carries kind="connector-proxy" so it is accepted by the existing
 * /__doable/data/* auth path without any changes to the verifier.
 *
 * Auth: this router is mounted standalone at `/projects` (gated behind
 * DOABLE_APP_DB_ENABLED in routes.ts), separate from the main projectRoutes
 * router, so it must apply the session/RLS auth middleware itself —
 * otherwise c.get("userId") is undefined and requireProjectAccess() blows up
 * with a postgres UNDEFINED_VALUE error.
 *
 * Export: dataTokenRoutes — mounted at app.route("/projects", ...) in routes.ts.
 */

import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls } from "../../middleware/rls.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../lib/secrets.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";
import { runOnProject } from "../../data-worker/pool.js";
import type { WorkerResponse } from "../../data-worker/types.js";

/** Safe table-name slug (lowercase ident); excludes quotes/specials so it is
 *  safe to interpolate inside double-quotes in a DDL statement. */
const TABLE_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/;
/** Roles allowed to run privileged DDL ops (drop/reset/enable-rls). */
const DESTRUCTIVE_ROLES = new Set(["owner", "admin"]);
/** Per-user identity columns, in preference order, used to author an RLS owner policy. */
const IDENTITY_COLS = ["created_by", "owner_id", "user_id"];

/** Run a privileged exec op on a project's worker (superuser; bypasses the
 *  data-plane HTTP tier-gate, which is correct here — these are session-authed,
 *  owner-gated management operations, not the public data plane). */
async function execOnProject(projectId: string, sql: string): Promise<WorkerResponse> {
  return runOnProject(projectId, { op: "exec", sql });
}

function execRows(resp: WorkerResponse): Array<Record<string, unknown>> {
  if (!resp.ok) throw new Error(`${resp.error.code}: ${resp.error.message}`);
  return (resp as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}

export const dataTokenRoutes = new Hono<AuthEnv>({ strict: false });

// Resolve the session → userId (+ RLS context) before any handler runs. This
// router is NOT a child of projectRoutes, so it does not inherit that auth.
dataTokenRoutes.use("*", authMiddlewareWithRls);
dataTokenRoutes.use("/:id", validateProjectIdParam());
dataTokenRoutes.use("/:id/*", validateProjectIdParam());

// ─── Exported mint helper (testable without Hono) ───────────

export async function mintDataToken(
  projectId: string,
  workspaceId: string,
  userId: string,
): Promise<{ token: string; expiresIn: number }> {
  const LIFETIME_SEC = 15 * 60;
  const token = await signProjectJwt(
    {
      projectId,
      workspaceId,
      userId,
      kind: "connector-proxy",
    },
    PROJECT_JWT_SECRET,
    LIFETIME_SEC,
  );
  return { token, expiresIn: LIFETIME_SEC };
}

// ─── Route ──────────────────────────────────────────────────

dataTokenRoutes.post("/:id/data-token", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const result = await mintDataToken(id, access.project.workspace_id, userId);
  return c.json(result);
});

// ─── Management plane: migrations + danger ops ──────────────
// These run privileged exec server-side (the data-plane JWT can't, by design —
// exec/migrate are tier-gated). Auth is the session middleware above; reads
// need project access, destructive ops need an owner/admin role.

/** GET /projects/:id/data/migrations — applied-migration ledger history. */
dataTokenRoutes.get("/:id/data/migrations", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  try {
    const resp = await execOnProject(
      id,
      "SELECT migration_id, sql_hash, applied_at FROM _doable_migrations ORDER BY applied_at DESC",
    );
    return c.json({ migrations: execRows(resp) });
  } catch (err) {
    // The ledger table only exists after the first data.migrate — treat
    // "relation does not exist" as "no migrations yet", not an error.
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|undefined_table|42P01/i.test(msg)) {
      return c.json({ migrations: [] });
    }
    console.error(`[data/migrations] ${id}:`, msg);
    return c.json({ error: "Failed to read migrations" }, 500);
  }
});

/** POST /projects/:id/data/drop-table { table } — drop one user table. */
dataTokenRoutes.post("/:id/data/drop-table", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!DESTRUCTIVE_ROLES.has(access.role)) {
    return c.json({ error: "Only an owner or admin can drop tables" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const table = typeof body?.table === "string" ? body.table : "";
  if (!TABLE_NAME_RE.test(table) || table.startsWith("_doable_")) {
    return c.json({ error: "Invalid or protected table name" }, 400);
  }

  try {
    const resp = await execOnProject(id, `DROP TABLE IF EXISTS "${table}" CASCADE`);
    if (!resp.ok) throw new Error(`${resp.error.code}: ${resp.error.message}`);
    return c.json({ ok: true, dropped: table });
  } catch (err) {
    console.error(`[data/drop-table] ${id} ${table}:`, err instanceof Error ? err.message : err);
    return c.json({ error: "Failed to drop table" }, 500);
  }
});

/** POST /projects/:id/data/reset — drop ALL tables (clean slate). */
dataTokenRoutes.post("/:id/data/reset", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!DESTRUCTIVE_ROLES.has(access.role)) {
    return c.json({ error: "Only an owner or admin can reset the database" }, 403);
  }

  try {
    const list = execRows(
      await execOnProject(id, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"),
    );
    const tables = list
      .map((r) => String(r.tablename))
      .filter((t) => TABLE_NAME_RE.test(t));
    if (tables.length > 0) {
      const quoted = tables.map((t) => `"${t}"`).join(", ");
      const resp = await execOnProject(id, `DROP TABLE IF EXISTS ${quoted} CASCADE`);
      if (!resp.ok) throw new Error(`${resp.error.code}: ${resp.error.message}`);
    }
    return c.json({ ok: true, dropped: tables.length });
  } catch (err) {
    console.error(`[data/reset] ${id}:`, err instanceof Error ? err.message : err);
    return c.json({ error: "Failed to reset database" }, 500);
  }
});

/** POST /projects/:id/data/enable-rls { table } — one-click: ENABLE ROW LEVEL
 *  SECURITY + an owner policy keyed on the table's identity column. */
dataTokenRoutes.post("/:id/data/enable-rls", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!DESTRUCTIVE_ROLES.has(access.role)) {
    return c.json({ error: "Only an owner or admin can change row-level security" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const table = typeof body?.table === "string" ? body.table : "";
  if (!TABLE_NAME_RE.test(table) || table.startsWith("_doable_")) {
    return c.json({ error: "Invalid or protected table name" }, 400);
  }

  try {
    // Find a per-user identity column to scope the policy by. Names come from the
    // catalog and are re-validated, so they are safe to interpolate (quoted).
    const cols = execRows(
      await execOnProject(
        id,
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'`,
      ),
    ).map((r) => String(r.column_name));
    const idCol = IDENTITY_COLS.find((c) => cols.includes(c));
    if (!idCol || !TABLE_NAME_RE.test(idCol)) {
      return c.json(
        { error: "Table has no owner column (created_by / owner_id / user_id) to scope a policy by. Add one first." },
        400,
      );
    }
    const policy = `${table}_owner`;
    // ENABLE RLS + replace the owner policy idempotently. created_by::text is
    // compared to the GUC so an absent identity fails closed to zero rows.
    const ddl =
      `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;\n` +
      `DROP POLICY IF EXISTS "${policy}" ON "${table}";\n` +
      `CREATE POLICY "${policy}" ON "${table}" ` +
      `USING ("${idCol}"::text = current_setting('app.user_id', true)) ` +
      `WITH CHECK ("${idCol}"::text = current_setting('app.user_id', true))`;
    const resp = await execOnProject(id, ddl);
    if (!resp.ok) throw new Error(`${resp.error.code}: ${resp.error.message}`);
    return c.json({ ok: true, table, policy, column: idCol });
  } catch (err) {
    console.error(`[data/enable-rls] ${id} ${table}:`, err instanceof Error ? err.message : err);
    return c.json({ error: "Failed to enable row-level security" }, 500);
  }
});
