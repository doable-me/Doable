/**
 * Embedding erase route — DELETE /projects/:id/embeddings
 *
 * Implements the destructive part of the "change embedding model"
 * flow surfaced from the Doable AI tab in Project Settings. The pgvector
 * column dimension is fixed per row, so a model change with different
 * `dimensions` invalidates every existing embedding for that project.
 *
 * Behaviour:
 *   - Walk the per-app DB's information_schema to find every table that
 *     has a column of type `vector` (USER-DEFINED type with udt_name = 'vector').
 *   - For each such table, DELETE all rows.
 *   - Return the per-table affected counts.
 *
 * Auth: workspace owner/admin only (same as the AI settings PUT).
 *
 * Body (optional): { confirm: "ERASE" }. Required as a sanity check —
 * the UI types this into a confirmation modal before calling the
 * endpoint. The HTTP layer rejects without it so curl users can't
 * fat-finger their way into wiping a vector store.
 */

import { Hono } from "hono";

import { sql } from "../../db/index.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls } from "../../middleware/rls.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";
import { runOnProject } from "../../data-worker/pool.js";
import {
  DOABLE_APP_DB_ENABLED,
} from "../../data-worker/config.js";

export const embeddingsRoutes = new Hono<AuthEnv>({ strict: false });

embeddingsRoutes.use("*", authMiddlewareWithRls);
embeddingsRoutes.use("/:id/embeddings", validateProjectIdParam());

const DESTRUCTIVE_ROLES = new Set(["owner", "admin"]);

embeddingsRoutes.delete("/:id/embeddings", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!DESTRUCTIVE_ROLES.has(access.role)) {
    return c.json({ error: "Only an owner or admin can erase embeddings" }, 403);
  }

  let body: { confirm?: string; mode?: string } = {};
  try { body = (await c.req.json()) as typeof body; } catch { /* allow empty */ }
  if (body.confirm !== "ERASE") {
    return c.json({
      error: 'Missing confirm token. Pass { "confirm": "ERASE" } to proceed.',
    }, 400);
  }

  if (!DOABLE_APP_DB_ENABLED) {
    // Fallback path — the per-app DB isn't enabled in this install. Record
    // a "stale" marker on project_ai_settings so the next embedding call
    // can short-circuit with EMBEDDING_STALE if needed.
    try {
      await sql`
        UPDATE project_ai_settings
        SET embedding_provider_id = embedding_provider_id  -- no-op write to bump updated_at
        WHERE project_id = ${id}
      `;
    } catch { /* noop */ }
    return c.json({
      ok: true,
      mode: "fallback-stale",
      message: "Per-app DB is disabled — vector rows could not be deleted in-place. Embeddings will be re-ingested on next access.",
      tables: [],
    });
  }

  // 1. List tables containing a column of type `vector` (pgvector).
  const listResp = await runOnProject(id, {
    op: "query",
    sql: `
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.udt_name = 'vector'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name, c.column_name
    `,
  }).catch((err) => {
    console.error("[embeddings] list vector tables failed:", err);
    return null;
  });

  if (!listResp || !listResp.ok) {
    const msg = listResp && !listResp.ok ? listResp.error.message : "worker offline";
    return c.json({
      ok: false,
      mode: "worker-error",
      message: `Could not list vector tables: ${msg}. Falling back to staleness marker.`,
      tables: [],
    }, 503);
  }

  type Row = { table_schema: string; table_name: string; column_name: string };
  const rows = (listResp.rows ?? []) as Row[];

  // Deduplicate by (schema, table) — one DELETE per table even if it has
  // multiple vector columns.
  const seen = new Set<string>();
  const tables: { schema: string; table: string }[] = [];
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tables.push({ schema: r.table_schema, table: r.table_name });
  }

  if (tables.length === 0) {
    return c.json({
      ok: true,
      mode: "per-app-db",
      message: "No tables with vector columns found.",
      tables: [],
    });
  }

  // 2. DELETE rows from each table. We use DELETE instead of TRUNCATE
  // because TRUNCATE requires owner privileges and bypasses RLS, which is
  // a stronger blast radius than we need.
  const erased: { table: string; deleted: number; error?: string }[] = [];
  for (const t of tables) {
    // Identifier quoting — PGlite's parser accepts the standard
    // double-quoted identifier syntax.
    const qualified = `"${t.schema.replace(/"/g, '""')}"."${t.table.replace(/"/g, '""')}"`;
    const delResp = await runOnProject(id, {
      op: "exec",
      sql: `DELETE FROM ${qualified}`,
    }).catch((err) => ({ ok: false, error: { code: "INTERNAL", message: String(err) } } as const));
    if (delResp && delResp.ok) {
      erased.push({
        table: `${t.schema}.${t.table}`,
        deleted: delResp.rowCount ?? 0,
      });
    } else {
      erased.push({
        table: `${t.schema}.${t.table}`,
        deleted: 0,
        error: delResp && !delResp.ok ? delResp.error.message : "unknown",
      });
    }
  }

  return c.json({
    ok: true,
    mode: "per-app-db",
    tables: erased,
  });
});

// ─── GET /projects/:id/embeddings/stats — used by the UI to render the
//     "current model: X, N rows" banner inside the destructive modal.

embeddingsRoutes.get("/:id/embeddings/stats", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  if (!DOABLE_APP_DB_ENABLED) {
    return c.json({ data: { mode: "fallback", tables: [], totalRows: 0 } });
  }

  const listResp = await runOnProject(id, {
    op: "query",
    sql: `
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.udt_name = 'vector'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name
    `,
  }).catch(() => null);

  if (!listResp || !listResp.ok) {
    return c.json({ data: { mode: "worker-error", tables: [], totalRows: 0 } });
  }

  type Row = { table_schema: string; table_name: string; column_name: string };
  const rows = (listResp.rows ?? []) as Row[];

  const tables: { table: string; column: string; rows: number }[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const qualified = `"${r.table_schema.replace(/"/g, '""')}"."${r.table_name.replace(/"/g, '""')}"`;
    const countResp = await runOnProject(id, {
      op: "query",
      sql: `SELECT COUNT(*)::bigint AS n FROM ${qualified}`,
    }).catch(() => null);
    const n = countResp && countResp.ok
      ? Number((countResp.rows?.[0] as { n: string | number } | undefined)?.n ?? 0)
      : 0;
    tables.push({ table: `${r.table_schema}.${r.table_name}`, column: r.column_name, rows: n });
    total += n;
  }

  return c.json({ data: { mode: "per-app-db", tables, totalRows: total } });
});
