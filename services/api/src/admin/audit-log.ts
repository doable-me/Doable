/**
 * Admin audit log helper.
 *
 * Every privileged read/write performed by a platform admin against
 * enterprise audit surfaces (prompt viewer, conversation lookups,
 * exports) goes through `recordAdminAction`. The helper is intentionally
 * fire-and-forget — audit failures must never break the admin request.
 */
import type { Context } from "hono";
import { sql } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";

export type AdminAuditEntry = {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  targetUserId?: string | null;
  targetWorkspaceId?: string | null;
  targetProjectId?: string | null;
  details?: Record<string, unknown> | null;
};

function pickClientIp(c: Context<AuthEnv>): string | null {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return null;
}

export async function recordAdminAction(
  c: Context<AuthEnv>,
  entry: AdminAuditEntry,
): Promise<void> {
  const actorId = c.get("userId");
  const actorEmail = c.get("userEmail") ?? null;
  if (!actorId) return; // Should never happen behind authMiddleware
  try {
    await sql`
      INSERT INTO admin_audit_log
        (actor_id, actor_email, actor_role, action,
         resource_type, resource_id,
         target_user_id, target_workspace_id, target_project_id,
         details, client_ip, user_agent)
      VALUES
        (${actorId}::uuid, ${actorEmail}, 'platform_admin', ${entry.action},
         ${entry.resourceType ?? null}, ${entry.resourceId ?? null},
         ${entry.targetUserId ?? null}::uuid,
         ${entry.targetWorkspaceId ?? null}::uuid,
         ${entry.targetProjectId ?? null}::uuid,
         ${entry.details ? sql.json(entry.details as never) : null},
         ${pickClientIp(c)}::inet,
         ${c.req.header("user-agent") ?? null})
    `;
  } catch (err) {
    // Never fail the request because of audit insert failure.
    // Surface via console so it lands in the existing log pipeline.
    console.warn("[admin-audit] insert failed:", err);
  }
}
