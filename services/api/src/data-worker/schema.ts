/**
 * Read-only schema introspection for a project's PGlite DB (PRD 05 §schema,
 * 06 §data.schema). Runs over the worker's `exec` op (superuser) so it sees the
 * full catalog — including RLS policy definitions, which the AI uses to
 * self-verify it actually emitted policies (a common failure mode is claiming
 * RLS while only adding a WHERE clause).
 *
 * Internal infra tables (the _doable_* prefix, e.g. the migration ledger) are
 * hidden from the caller.
 */
import type { WorkerResponse } from "./types.js";
import type { WorkerExec } from "./migrate.js";

export interface ColumnInfo { name: string; type: string; nullable: boolean; }
export interface PolicyInfo { name: string; command: string; using_expr: string | null; with_check_expr: string | null; }
export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: string[];
  policies: PolicyInfo[];
  rls_enabled: boolean;
}
export interface SchemaResult { tables: TableSchema[]; }

function rows<T>(resp: WorkerResponse, what: string): T[] {
  if (!resp.ok) throw new Error(`[schema] ${what} failed: ${resp.error.code} ${resp.error.message}`);
  return ((resp as { rows?: T[] }).rows) ?? [];
}

export async function introspectSchema(exec: WorkerExec): Promise<SchemaResult> {
  const tableRows = rows<{ tablename: string; rowsecurity: boolean }>(
    await exec({
      op: "exec",
      sql:
        "SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity " +
        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
        "WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\\_doable\\_%' " +
        "ORDER BY c.relname",
    }),
    "tables",
  );

  const columnRows = rows<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
    await exec({
      op: "exec",
      sql:
        "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns " +
        "WHERE table_schema = 'public' ORDER BY table_name, ordinal_position",
    }),
    "columns",
  );

  const indexRows = rows<{ tablename: string; indexdef: string }>(
    await exec({ op: "exec", sql: "SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'" }),
    "indexes",
  );

  const policyRows = rows<{ tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }>(
    await exec({
      op: "exec",
      sql: "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'",
    }),
    "policies",
  );

  const byTable = new Map<string, TableSchema>();
  for (const t of tableRows) {
    byTable.set(t.tablename, { name: t.tablename, columns: [], indexes: [], policies: [], rls_enabled: !!t.rowsecurity });
  }
  for (const c of columnRows) {
    const t = byTable.get(c.table_name);
    if (t) t.columns.push({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === "YES" });
  }
  for (const i of indexRows) {
    const t = byTable.get(i.tablename);
    if (t) t.indexes.push(i.indexdef);
  }
  for (const p of policyRows) {
    const t = byTable.get(p.tablename);
    if (t) t.policies.push({ name: p.policyname, command: p.cmd, using_expr: p.qual, with_check_expr: p.with_check });
  }

  return { tables: [...byTable.values()] };
}

/** Browse rows of one table (data.inspect). table is validated by the caller. */
export async function inspectTable(
  exec: WorkerExec,
  table: string,
  opts: { where?: string; limit?: number; offset?: number; appUserId?: string } = {},
): Promise<WorkerResponse> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) {
    throw new Error(`[schema] invalid table name: ${JSON.stringify(table)}`);
  }
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 500);
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const where = opts.where && opts.where.length <= 1024 ? ` WHERE ${opts.where}` : "";
  // inspect runs over query op so RLS still applies in the row viewer; the
  // caller's app_user_id is threaded through so per-user tables show the
  // intended rows (omitting it would fail closed to zero rows).
  return exec({
    op: "query",
    sql: `SELECT * FROM ${table}${where} LIMIT ${limit} OFFSET ${offset}`,
    app_user_id: opts.appUserId ?? "",
  });
}
