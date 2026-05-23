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

export function makeDataClient(apiBase: string, token: string) {
  return {
    schema: () =>
      dataFetch<SchemaResult>(apiBase, "schema", token, {}),
    query: (sql: string, params?: unknown[]) =>
      dataFetch<QueryResult>(apiBase, "query", token, { sql, params }),
  };
}

// ─── Result shapes (mirrors data-worker contract) ───────────

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
  dflt_value: string | null;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface PolicyInfo {
  name: string;
  cmd: string;
  permissive: boolean;
}

export interface TableSchema {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  policies: PolicyInfo[];
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
  rowsAffected?: number;
  error?: string;
}
