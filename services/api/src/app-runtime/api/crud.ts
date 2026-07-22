/**
 * Auto CRUD over PGlite tables with optional tables.json ACL.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { BACKEND_DIR } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { runOnProject } from "../../data-worker/pool.js";
import { emitCdcIfMutation } from "../cdc/emit.js";
import type { WorkerResponse } from "../../data-worker/types.js";

const tablesAclSchema = z.object({
  tables: z
    .record(
      z.object({
        expose: z.boolean().optional(),
        methods: z
          .array(z.enum(["GET", "POST", "PATCH", "DELETE"]))
          .optional(),
      }),
    )
    .optional(),
  /** If set, only these tables are exposed (unless listed false in tables). */
  allow: z.array(z.string()).optional(),
});

export type TablesAcl = z.infer<typeof tablesAclSchema>;

export async function loadTablesAcl(projectId: string): Promise<TablesAcl> {
  const p = path.join(getProjectPath(projectId), BACKEND_DIR, "api", "tables.json");
  if (!existsSync(p)) return {};
  try {
    return tablesAclSchema.parse(JSON.parse(await readFile(p, "utf-8")));
  } catch {
    return {};
  }
}

export function isTableAllowed(
  table: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  acl: TablesAcl,
): boolean {
  if (table.startsWith("_doable")) return false;
  if (!/^[a-zA-Z_][\w]*$/.test(table)) return false;

  if (acl.allow && acl.allow.length > 0 && !acl.allow.includes(table)) {
    return false;
  }
  const entry = acl.tables?.[table];
  if (entry?.expose === false) return false;
  if (entry?.methods && !entry.methods.includes(method)) return false;
  return true;
}

function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

export interface CrudOpts {
  projectId: string;
  table: string;
  appUserId?: string;
  elevated?: boolean;
}

export async function crudList(
  opts: CrudOpts & { limit?: number; offset?: number; where?: Record<string, unknown> },
): Promise<WorkerResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const values: unknown[] = [];
  const whereParts: string[] = [];
  if (opts.where) {
    for (const [k, v] of Object.entries(opts.where)) {
      if (!/^[a-zA-Z_][\w]*$/.test(k)) continue;
      values.push(v);
      whereParts.push(`${quoteIdent(k)} = $${values.length}`);
    }
  }
  values.push(limit);
  const limP = `$${values.length}`;
  values.push(offset);
  const offP = `$${values.length}`;
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const sql = `SELECT * FROM ${quoteIdent(opts.table)} ${whereSql} LIMIT ${limP} OFFSET ${offP}`;
  return runOnProject(opts.projectId, {
    op: "query",
    sql,
    params: values,
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });
}

export async function crudGet(opts: CrudOpts & { id: string }): Promise<WorkerResponse> {
  const sql = `SELECT * FROM ${quoteIdent(opts.table)} WHERE id = $1 LIMIT 1`;
  return runOnProject(opts.projectId, {
    op: "query",
    sql,
    params: [opts.id],
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });
}

export async function crudCreate(
  opts: CrudOpts & { data: Record<string, unknown> },
): Promise<WorkerResponse> {
  const cols = Object.keys(opts.data).filter((k) => /^[a-zA-Z_][\w]*$/.test(k));
  if (cols.length === 0) {
    return {
      id: "",
      ok: false,
      error: { code: "INTERNAL", message: "No valid columns" },
    };
  }
  const values = cols.map((c) => opts.data[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${quoteIdent(opts.table)} (${cols.map(quoteIdent).join(", ")})
               VALUES (${placeholders.join(", ")}) RETURNING *`;
  const resp = await runOnProject(opts.projectId, {
    op: "query",
    sql,
    params: values,
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });
  if (resp.ok) {
    await emitCdcIfMutation({ projectId: opts.projectId, sql, payload: opts.data });
  }
  return resp;
}

export async function crudUpdate(
  opts: CrudOpts & { id: string; data: Record<string, unknown> },
): Promise<WorkerResponse> {
  const cols = Object.keys(opts.data).filter(
    (k) => /^[a-zA-Z_][\w]*$/.test(k) && k !== "id",
  );
  if (cols.length === 0) {
    return {
      id: "",
      ok: false,
      error: { code: "INTERNAL", message: "No valid columns" },
    };
  }
  const values: unknown[] = cols.map((c) => opts.data[c]);
  const sets = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`);
  values.push(opts.id);
  const sql = `UPDATE ${quoteIdent(opts.table)} SET ${sets.join(", ")}
               WHERE id = $${values.length} RETURNING *`;
  const resp = await runOnProject(opts.projectId, {
    op: "query",
    sql,
    params: values,
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });
  if (resp.ok) {
    await emitCdcIfMutation({
      projectId: opts.projectId,
      sql,
      rowPk: opts.id,
      payload: opts.data,
    });
  }
  return resp;
}

export async function crudDelete(opts: CrudOpts & { id: string }): Promise<WorkerResponse> {
  const sql = `DELETE FROM ${quoteIdent(opts.table)} WHERE id = $1 RETURNING id`;
  const resp = await runOnProject(opts.projectId, {
    op: "query",
    sql,
    params: [opts.id],
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });
  if (resp.ok) {
    await emitCdcIfMutation({
      projectId: opts.projectId,
      sql,
      rowPk: opts.id,
    });
  }
  return resp;
}
