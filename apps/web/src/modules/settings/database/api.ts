"use client";

/**
 * Thin API client for the Database settings tab.
 * All data-plane calls go through /__doable/data/* with the minted data token.
 * The management-plane call (minting the token) uses the standard apiFetch.
 */

import { apiFetch } from "@/lib/api";

// ─── Token mint ─────────────────────────────────────────────

export async function fetchDataToken(
  projectId: string,
): Promise<{ token: string; expiresIn: number }> {
  return apiFetch<{ token: string; expiresIn: number }>(
    `/projects/${projectId}/data-token`,
    { method: "POST" },
  );
}

// ─── Management plane (session-authed; NOT the data token) ──

export interface MigrationRow {
  migration_id: string;
  sql_hash: string;
  applied_at: string;
}

/** Applied-migration ledger history for the project's DB. */
export async function fetchMigrations(projectId: string): Promise<MigrationRow[]> {
  const r = await apiFetch<{ migrations: MigrationRow[] }>(
    `/projects/${projectId}/data/migrations`,
  );
  return r.migrations ?? [];
}

/** Drop a single user table (owner/admin only). */
export async function dropTable(
  projectId: string,
  table: string,
): Promise<{ ok: boolean; dropped: string }> {
  return apiFetch(`/projects/${projectId}/data/drop-table`, {
    method: "POST",
    body: JSON.stringify({ table }),
  });
}

/** Drop all tables — clean slate (owner/admin only). */
export async function resetDatabase(
  projectId: string,
): Promise<{ ok: boolean; dropped: number }> {
  return apiFetch(`/projects/${projectId}/data/reset`, { method: "POST" });
}

/** Enable row-level security on a table + add an owner policy (owner/admin only). */
export async function enableRls(
  projectId: string,
  table: string,
): Promise<{ ok: boolean; table: string; policy: string; column: string }> {
  return apiFetch(`/projects/${projectId}/data/enable-rls`, {
    method: "POST",
    body: JSON.stringify({ table }),
  });
}

// ─── Data-plane helpers ─────────────────────────────────────

async function dataFetch<T>(
  apiBase: string,
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${apiBase}/__doable/data/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      // Required by the /__doable/data/* guard (PARAMS_INVALID without it).
      "x-doable-data-api": "1",
      "x-doable-surface": "settings-ui",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`data/${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Raw query response from /__doable/data/query (data-worker contract).
interface RawQueryResult {
  ok: boolean;
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
  error?: { code: string; message: string } | string;
}

export function makeDataClient(apiBase: string, token: string) {
  return {
    schema: () => dataFetch<SchemaResult>(apiBase, "schema", token, {}),
    query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
      const raw = await dataFetch<RawQueryResult>(apiBase, "query", token, { sql, params });
      // The server returns `fields: [{name,type}]`; the panes consume a flat
      // `columns: string[]`. Derive it (fall back to the keys of the first row
      // for SELECT * results where fields may be empty).
      const columns =
        raw.fields?.map((f) => f.name) ??
        (raw.rows[0] ? Object.keys(raw.rows[0]) : []);
      return { ok: raw.ok, rows: raw.rows ?? [], columns, rowCount: raw.rowCount ?? 0 };
    },
  };
}

// ─── Result shapes (mirror the data-worker / introspectSchema contract) ─────

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface PolicyInfo {
  name: string;
  command: string;
  using_expr: string | null;
  with_check_expr: string | null;
}

export interface TableSchema {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
  /** Raw CREATE INDEX statements (pg_indexes.indexdef). */
  indexes: string[];
  policies: PolicyInfo[];
  rls_enabled: boolean;
}

export interface SchemaResult {
  ok: boolean;
  tables: TableSchema[];
  error?: string;
}

export interface QueryResult {
  ok: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  error?: string;
}
