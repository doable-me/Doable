/**
 * Ensure `_doable_outbox` exists in the project PGlite DB.
 */

import { runOnProject } from "../../data-worker/pool.js";

const OUTBOX_SQL = `
CREATE TABLE IF NOT EXISTS _doable_outbox (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  op text NOT NULL,
  row_pk text,
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);
`;

const RBAC_SQL = `
CREATE TABLE IF NOT EXISTS _doable_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS _doable_role_members (
  user_id text NOT NULL,
  role_id uuid NOT NULL REFERENCES _doable_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
`;

const ensured = new Set<string>();

export async function ensureRuntimeAppTables(projectId: string): Promise<void> {
  if (ensured.has(projectId)) return;
  await runOnProject(projectId, {
    op: "exec",
    sql: OUTBOX_SQL + RBAC_SQL,
  });
  ensured.add(projectId);
}

export async function writeOutboxRow(
  projectId: string,
  row: { table: string; op: string; rowPk?: string | null; payload?: unknown },
): Promise<void> {
  await ensureRuntimeAppTables(projectId);
  await runOnProject(projectId, {
    op: "exec",
    sql: `INSERT INTO _doable_outbox (table_name, op, row_pk, payload, published_at)
          VALUES ($1, $2, $3, $4::jsonb, now())`,
    params: [
      row.table,
      row.op,
      row.rowPk ?? null,
      JSON.stringify(row.payload ?? null),
    ],
  });
}
