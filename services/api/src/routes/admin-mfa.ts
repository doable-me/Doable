/**
 * Admin endpoints for MFA — list users with MFA enabled and force-reset
 * MFA for a locked-out user.
 *
 * Policy v1 is "optional only": admins do NOT enforce MFA org-wide;
 * they only observe and reset. Force-reset clears all factors and
 * recovery codes for a target user, audited via admin_audit_log.
 */
import { Hono } from "hono";
import { sql } from "../db/index.js";
import { mfaQueries } from "@doable/db/queries/mfa.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { recordAdminAction } from "../admin/audit-log.js";

const mfa = mfaQueries(sql);

export const adminMfaRoutes = new Hono<AuthEnv>({ strict: false });

adminMfaRoutes.use("*", authMiddleware, platformAdminMiddleware);

// ─── GET /admin/mfa/users ───────────────────────────────────────────

adminMfaRoutes.get("/users", async (c) => {
  const rows = await mfa.listUsersWithMfa();
  return c.json({
    users: rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      verifiedAt: r.verified_at?.toISOString() ?? null,
      lastUsedAt: r.last_used_at?.toISOString() ?? null,
      unusedRecoveryCodes: r.unused_recovery_codes,
    })),
  });
});

// ─── POST /admin/mfa/reset/:userId ──────────────────────────────────

adminMfaRoutes.post("/reset/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  if (!targetUserId) return c.json({ error: "userId required" }, 400);

  const had = await mfa.hasVerifiedFactor(targetUserId);
  await mfa.deleteAllForUser(targetUserId);

  // Revoke all refresh tokens so the user must re-authenticate fresh.
  try {
    await sql`DELETE FROM refresh_tokens WHERE user_id = ${targetUserId}`;
  } catch { /* non-fatal */ }

  await recordAdminAction(c, {
    action: "mfa.reset",
    resourceType: "user",
    resourceId: targetUserId,
    targetUserId,
    details: { previouslyEnabled: had },
  });

  return c.json({ ok: true, hadFactor: had });
});
