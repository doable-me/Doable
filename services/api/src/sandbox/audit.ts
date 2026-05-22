
import { sql } from "../db/index.js";

export interface SandboxAuditRecord {
  projectId: string;
  workspaceId: string | null;
  /** Nullable: system/unauthenticated spawns MUST pass null, not "" or a sentinel. */
  userId: string | null;
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

// Missing-table is expected until the audit migration runs.
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

// Coerce non-UUID values to null — UUID columns reject empty strings and sentinels.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asUuidOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  return UUID_RE.test(value) ? value : null;
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
        ${asUuidOrNull(record.projectId)},
        ${asUuidOrNull(record.workspaceId)},
        ${asUuidOrNull(record.userId)},
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
      // Soft-warn — include backendId so operators can confirm the orchestrator is running.
      console.warn(
        `[sandbox.audit] audit_sandbox_spawn table missing — skipping insert (backend=${record.backendId}, profile=${record.profileId}). Run the pending migration to enable audit logs.`,
      );
      return;
    }
    throw err;
  }
}
