/**
 * First-user bootstrap logic.
 *
 * After a new user is created, this function determines whether that user
 * should be automatically promoted to platform owner (admin). The check runs
 * three layers of safety in order:
 *
 *   1. If bootstrap_completed_at is already set → hard NO, forever.
 *   2. If the new user is the only non-deleted user in the table → promote.
 *   3. If INSTALL_BOOTSTRAP_TOKEN is set in env AND matches the presented token
 *      AND the token has not passed its TTL → promote.
 *
 * On promotion the function:
 *   - Sets is_platform_admin=true, platform_role='owner', is_verified_publisher=true
 *   - Creates a default workspace (via ensureWorkspace) — skipped if caller already did it
 *   - Bumps credit_balances to enterprise tier
 *   - Writes a row to admin_audit_log
 *   - Sets platform_config.bootstrap_completed_at = NOW()
 *
 * SECURITY INVARIANTS:
 *   - Server-side only. Client cannot trigger promotion.
 *   - Once bootstrap_completed_at is set, path is permanently closed.
 *   - Bootstrap token is NEVER logged.
 *   - IP + user agent must be passed in for the audit log row.
 */

import { timingSafeEqual } from "node:crypto";

import { sql } from "../db/index.js";
import { getConfig, setConfig } from "../lib/platformConfig.js";

function constantTimeStringEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers. Different lengths are not
  // equal — but we still want the comparison itself to be constant-time, so we
  // pad to a fixed length and then compare. Length mismatch is returned as
  // false unconditionally.
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface BootstrapResult {
  promoted: boolean;
  reason: string;
}

export interface BootstrapContext {
  /** IP address of the request, for audit log */
  clientIp?: string | null;
  /** User-Agent header, for audit log */
  userAgent?: string | null;
}

/**
 * Check whether the newly-created user should be promoted to platform owner.
 * Call AFTER the user row exists in DB, BEFORE returning the auth response.
 *
 * @param newUserId  UUID of the freshly-created user
 * @param presentedToken  Optional token from ?bootstrap= query or request body
 * @param ctx  Request context for audit logging
 */
export async function firstUserBootstrap(
  newUserId: string,
  presentedToken?: string | null,
  ctx?: BootstrapContext,
): Promise<BootstrapResult> {
  // ── Layer 1: Bootstrap permanently closed once completed ─────────────────
  // Treat ANY non-empty string in bootstrap_completed_at as "sealed". Only
  // literal SQL NULL or the JSON literal `null` means unsealed. This makes
  // the seal robust to operators poking the JSONB column manually.
  const completedAt = await getConfig("bootstrap_completed_at");
  const isSealed =
    typeof completedAt === "string"
      ? completedAt.length > 0 && completedAt !== "null"
      : completedAt !== null && completedAt !== undefined && completedAt !== false;
  if (isSealed) {
    return { promoted: false, reason: "bootstrap_already_completed" };
  }

  // ── Layer 2: Is this the first user? ─────────────────────────────────────
  // The seal in Layer 1 (bootstrap_completed_at) is what makes this safe — once
  // the first signup promotes, the path is permanently closed even if rows are
  // later deleted/recreated. The users table has no deleted_at column today,
  // so we count all rows. If soft-delete is added later, switch to
  // `WHERE deleted_at IS NULL` — but the seal already protects the invariant.
  const [countRow] = await sql<{ cnt: string }[]>`
    SELECT COUNT(*) AS cnt FROM users
  `;
  const userCount = parseInt(countRow?.cnt ?? "0", 10);

  let shouldPromote = userCount <= 1;
  let promoteReason = "first_user";

  // ── Layer 3: Valid bootstrap token presented ──────────────────────────────
  // Constant-time compare to prevent timing side-channel; TTL read from env
  // (INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT) because that's where setup-server.sh
  // and docker/setup.sh write it. Falls back to platform_config row if env
  // unset (lets operators rotate via /admin/regenerate without restart).
  if (!shouldPromote && presentedToken) {
    const envToken = process.env.INSTALL_BOOTSTRAP_TOKEN;
    if (envToken && constantTimeStringEqual(envToken, presentedToken)) {
      let tokenValid = true;
      const envExpiry = process.env.INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT;
      const dbExpiry = await getConfig("bootstrap_token_expires_at");
      const expiresRaw =
        envExpiry ||
        (dbExpiry && dbExpiry !== "null" ? (dbExpiry as string) : null);
      if (expiresRaw) {
        const expiresAt = new Date(expiresRaw);
        if (!isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
          tokenValid = false;
        }
      } else {
        // No TTL configured anywhere — refuse the token. Operator must set
        // INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT (setup scripts already do this).
        // This is fail-closed: a missing TTL never means "valid forever".
        tokenValid = false;
      }
      if (tokenValid) {
        shouldPromote = true;
        promoteReason = "bootstrap_token";
      }
    }
  }

  if (!shouldPromote) {
    return { promoted: false, reason: "not_eligible" };
  }

  // ── Promote ───────────────────────────────────────────────────────────────
  await sql`
    UPDATE users
    SET is_platform_admin     = true,
        platform_role         = 'owner',
        is_verified_publisher = true,
        updated_at            = now()
    WHERE id = ${newUserId}::uuid
  `;

  // Bump credit balance to enterprise tier for all the user's workspaces (upsert)
  await sql`
    UPDATE credit_balances
    SET daily_credits    = 999999,
        monthly_credits  = 999999,
        plan_type        = 'enterprise',
        updated_at       = now()
    WHERE user_id = ${newUserId}::uuid
  `;

  // BUG-R27-004: the project-cap check at routes/projects/list-routes.ts:292
  // reads workspaces.plan (default 'free' = 3-project cap) — NOT
  // credit_balances.plan_type. Without this bump, the freshly-promoted owner
  // hits a Free Plan banner and 403s out at the 4th project, even though
  // their credit balance is enterprise-tier. Promote every workspace the
  // user owns so the limits, dashboard chip, and plan-defaults all agree.
  await sql`
    UPDATE workspaces w
    SET plan       = 'enterprise',
        updated_at = now()
    FROM workspace_members wm
    WHERE wm.workspace_id = w.id
      AND wm.user_id      = ${newUserId}::uuid
      AND wm.role         = 'owner'
  `;

  // Audit BEFORE sealing so a crash between the two doesn't leave a sealed
  // promotion with no audit row. The audit helper swallows its own errors
  // (audit failure must not break signup), but the await guarantees ordering.
  await writeBootstrapAuditLog(newUserId, promoteReason, ctx);

  // Seal the bootstrap path permanently
  await setConfig("bootstrap_completed_at", new Date().toISOString());

  return { promoted: true, reason: promoteReason };
}

async function writeBootstrapAuditLog(
  userId: string,
  reason: string,
  ctx?: BootstrapContext,
): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_audit_log
        (actor_id, actor_email, actor_role, action,
         resource_type, resource_id, details, client_ip, user_agent)
      SELECT
        u.id,
        u.email,
        'platform_admin',
        'bootstrap_promote_owner',
        'user',
        u.id::text,
        ${sql.json({ reason } as never)},
        ${ctx?.clientIp ?? null}::inet,
        ${ctx?.userAgent ?? null}
      FROM users u WHERE u.id = ${userId}::uuid
    `;
  } catch (err) {
    // Surface but don't rethrow — audit failure must not break signup.
    console.warn("[firstUserBootstrap] audit INSERT failed:", err);
  }
}
