/**
 * Idempotent per-project migration runner (PRD per-app-db 05 §migrate, 06 §data.migrate).
 *
 * The migration ledger `_doable_migrations` lives INSIDE each project's PGlite
 * DB (self-contained — exports/imports cleanly with the project), per the
 * data-locality bias in 08 §10. Replaying the same migration_id is a no-op and
 * reports whether the body drifted (sql_hash mismatch) without re-running it.
 *
 * Runs over the worker's `exec` op (superuser, RLS-bypassing) because schema
 * authoring is intentionally not constrained by the policies it writes. The
 * caller supplies an `exec` bound to one project's pool worker.
 */
import { createHash } from "node:crypto";
import type { WorkerRequest, WorkerResponse } from "./types.js";

export type WorkerExec = (req: Omit<WorkerRequest, "id">) => Promise<WorkerResponse>;

export const MIGRATION_ID_RE = /^[a-z0-9_-]{1,80}$/;

export interface MigrationResult {
  applied: boolean;
  reason?: "already_applied";
  migration_id: string;
  sql_hash: string;
  sql_hash_matches?: boolean;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const LEDGER_DDL =
  "CREATE TABLE IF NOT EXISTS _doable_migrations (" +
  "migration_id text PRIMARY KEY, sql_hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())";

function assertOk(resp: WorkerResponse, what: string): void {
  if (!resp.ok) {
    throw new Error(`[migrate] ${what} failed: ${resp.error.code} ${resp.error.message}`);
  }
}

/**
 * Apply a named migration idempotently. migrationId must match MIGRATION_ID_RE
 * (validated again here as defence in depth — it is interpolated into the ledger
 * SQL, so it must be a safe slug). The body + ledger insert run in ONE exec
 * frame so they commit atomically.
 */
export async function applyMigration(
  exec: WorkerExec,
  migrationId: string,
  sql: string,
): Promise<MigrationResult> {
  if (!MIGRATION_ID_RE.test(migrationId)) {
    throw new Error(`[migrate] invalid migration_id: ${JSON.stringify(migrationId)}`);
  }
  const hash = sha256(sql);

  // Ensure the ledger exists (idempotent).
  assertOk(await exec({ op: "exec", sql: LEDGER_DDL }), "ledger ddl");

  // Has this id been applied? (exec op returns rows for the trailing SELECT.)
  const check = await exec({
    op: "exec",
    sql: `SELECT sql_hash FROM _doable_migrations WHERE migration_id = '${migrationId}'`,
  });
  assertOk(check, "ledger lookup");
  const existing = (check as { rows?: Array<{ sql_hash?: string }> }).rows ?? [];
  if (existing.length > 0) {
    const priorHash = existing[0]!.sql_hash;
    return {
      applied: false,
      reason: "already_applied",
      migration_id: migrationId,
      sql_hash: hash,
      sql_hash_matches: priorHash === hash,
    };
  }

  // Apply body + record ledger atomically in a single exec frame (one
  // BEGIN/COMMIT). The lookup above + the per-project single worker's serial IPC
  // loop already serialize migrations; ON CONFLICT DO NOTHING is belt-and-
  // suspenders so a hypothetical concurrent double-insert is a no-op, not a PK error.
  const body =
    `${stripTrailingSemicolon(sql)};\n` +
    `INSERT INTO _doable_migrations (migration_id, sql_hash) VALUES ('${migrationId}', '${hash}') ON CONFLICT (migration_id) DO NOTHING`;
  assertOk(await exec({ op: "exec", sql: body }), "migration body");

  return { applied: true, migration_id: migrationId, sql_hash: hash };
}

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, "");
}
