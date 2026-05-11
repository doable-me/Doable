/**
 * Sandbox audit sink.
 *
 * Writes one row per jailedSpawn() invocation into
 * `audit_sandbox_spawn`. The table doesn't exist yet — the migration
 * lands in a later wave — so we wrap the INSERT in try/catch and emit
 * a console.warn on "undefined_table" / "relation does not exist"
 * errors. Every other error is rethrown so it shows up in tracing.
 */

import { sql } from "../db/index.js";

export interface SandboxAuditRecord {
  projectId: string;
  workspaceId: string | null;
  userId: string;
  sessionId: string;
  hardening: "off" | "dev" | "staging" | "prod";
  profileId: string;
  backendId: string;
  composers: string[];
  command: string;
  args: string[];
  exitCode: number | null;
  durationMs: number;
  oomKilled: boolean;
  /** ISO-8601 timestamp of the spawn start (orchestrator's `startedAt`). */
  startedAt: string;
}

/**
 * Treat the missing-table state as expected during Phase 1 rollout —
 * the migration that creates `audit_sandbox_spawn` is queued behind
 * the orchestrator merge.
 */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  // Postgres "undefined_table" SQLSTATE.
  if (e.code === "42P01") return true;
  if (typeof e.message === "string" && /relation .*audit_sandbox_spawn.* does not exist/i.test(e.message)) {
    return true;
  }
  return false;
}

export async function auditSpawn(record: SandboxAuditRecord): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_sandbox_spawn (
        project_id,
        workspace_id,
        user_id,
        session_id,
        hardening,
        profile_id,
        backend_id,
        composers,
        command,
        args,
        exit_code,
        duration_ms,
        oom_killed,
        started_at
      ) VALUES (
        ${record.projectId},
        ${record.workspaceId},
        ${record.userId},
        ${record.sessionId},
        ${record.hardening},
        ${record.profileId},
        ${record.backendId},
        ${record.composers as unknown as string[]},
        ${record.command},
        ${record.args as unknown as string[]},
        ${record.exitCode},
        ${record.durationMs},
        ${record.oomKilled},
        ${record.startedAt}
      )
    `;
  } catch (err) {
    if (isMissingTableError(err)) {
      // Soft-warn once per process to avoid log spam — but include the
      // backendId so operators can confirm the orchestrator is running.
      console.warn(
        `[sandbox.audit] audit_sandbox_spawn table missing — skipping insert (backend=${record.backendId}, profile=${record.profileId}). Run the pending migration to enable audit logs.`,
      );
      return;
    }
    throw err;
  }
}
