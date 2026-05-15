import { Hono } from "hono";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { userQueries } from "@doable/db/queries/users.js";
import { securityQueries } from "@doable/db/queries/security.js";
import { mfaQueries } from "@doable/db/queries/mfa.js";
import { signupApprovalQueries } from "@doable/db/queries/signup-approval.js";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import {
  registerSchema, loginSchema, refreshSchema, resetPasswordSchema,
  hashToken, sanitizeUser, ARGON2_OPTS, stripHtmlTags,
  loginRateLimiter, registerRateLimiter, forgotPasswordRateLimiter, resetPasswordRateLimiter,
  issueTokens, ensureWorkspace, FRONTEND_URL, ACCESS_TOKEN_TTL_SECONDS,
} from "./helpers.js";
import { firstUserBootstrap } from "../../auth/firstUserBootstrap.js";
import { issueMfaChallenge } from "./mfa.js";

const auth = authQueries(sql);
const users = userQueries(sql);
const securityDb = securityQueries(sql);
const mfa = mfaQueries(sql);
const signupApproval = signupApprovalQueries(sql);

export const coreAuthRoutes = new Hono({ strict: false });

// ─── POST /auth/register ───────────────────────────────────
coreAuthRoutes.post("/register", registerRateLimiter, async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, password, displayName } = parsed.data;
  // Accept bootstrap token from request body or ?bootstrap= query param
  const bootstrapToken: string | undefined =
    (body as Record<string, unknown>).bootstrap_token as string | undefined ??
    c.req.query("bootstrap") ?? undefined;

  // Sanitize displayName to prevent XSS
  const sanitizedName = displayName ? stripHtmlTags(displayName) : undefined;
  if (displayName && !sanitizedName) {
    return c.json({ error: "Validation failed", details: { displayName: ["Display name must contain visible text"] } }, 400);
  }

  const existing = await auth.findUserByEmail(email);
  if (existing) return c.json({ error: "An account with this email already exists" }, 409);

  // Blocklist takes precedence over the approval toggle — a blocked email
  // can never sign up again, even if approvals are currently off.
  if (await signupApproval.isEmailBlocked(email)) {
    return c.json({ error: "This email address cannot be registered." }, 403);
  }

  const approvalConfig = await signupApproval.getConfig();
  const approvalStatus = approvalConfig.enabled ? "pending" : "approved";

  const passwordHash = await argon2.hash(password, ARGON2_OPTS);
  let user;
  try {
    user = await auth.createUser({ email, passwordHash, displayName: sanitizedName, approvalStatus });
  } catch (err) {
    // Belt-and-suspenders: the line-43 pre-check races with concurrent
    // inserts (and with case-folding inside createUser's .toLowerCase()).
    // Postgres surfaces the unique-violation as code 23505; map it to a
    // friendly 409 instead of bubbling the raw constraint name to the
    // client (which would otherwise leak `users_email_key` via the global
    // onError handler in dev mode).
    if ((err as { code?: string } | null)?.code === "23505") {
      return c.json({ error: "An account with this email already exists" }, 409);
    }
    throw err;
  }

  if (approvalStatus === "pending") {
    // Don't auto-create the workspace yet and don't issue tokens. The user
    // sees the custom pending message; admin must approve before they can
    // log in. Skip the welcome email — they'll get one on approval (future).
    return c.json({
      pending: true,
      message: approvalConfig.pending_message,
    }, 201);
  }

  // Auto-create personal workspace so the user isn't blocked on first login
  await ensureWorkspace(user.id, user.display_name, user.email);

  // First-user bootstrap: promote to platform owner if eligible.
  // Runs after workspace creation so the audit log can reference it.
  // Errors are non-fatal — a failed promotion is logged but doesn't break signup.
  try {
    const cf = c.req.header("cf-connecting-ip");
    const fwd = c.req.header("x-forwarded-for");
    const clientIp = cf ?? (fwd ? fwd.split(",")[0]?.trim() : null) ?? null;
    await firstUserBootstrap(user.id, bootstrapToken ?? null, {
      clientIp,
      userAgent: c.req.header("user-agent") ?? null,
    });
  } catch (err) {
    console.warn("[register] firstUserBootstrap error (non-fatal):", err);
  }

  // Send welcome email (queued, non-blocking)
  sendTemplatedEmail(user.email, "welcome", {
    userName: sanitizedName ?? email.split("@")[0] ?? "there",
  }).catch(() => {}); // fire-and-forget: don't fail signup on email error

  const tokens = await issueTokens(user.id, user.email);
  return c.json({ user: sanitizeUser(user), tokens }, 201);
});

// ─── POST /auth/login ──────────────────────────────────────
coreAuthRoutes.post("/login", loginRateLimiter, async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, password } = parsed.data;

  const user = await auth.findUserByEmail(email);
  if (!user || !user.password_hash) return c.json({ error: "Invalid email or password" }, 401);

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) return c.json({ error: "Invalid email or password" }, 401);

  if (user.approval_status === "pending") {
    const cfg = await signupApproval.getConfig();
    return c.json({ error: "PENDING_APPROVAL", message: cfg.pending_message }, 403);
  }
  if (user.approval_status === "rejected") {
    return c.json({ error: "ACCOUNT_DENIED", message: "Your signup was not approved." }, 403);
  }

  // If the user opted into MFA, issue a short-lived challenge token
  // instead of real session tokens. The frontend exchanges it at
  // /auth/mfa/verify by submitting a TOTP code or recovery code.
  try {
    if (await mfa.hasVerifiedFactor(user.id)) {
      const challenge = await issueMfaChallenge(user.id, user.email);
      return c.json(challenge);
    }
  } catch (err) {
    console.warn("[Auth] MFA check failed, falling through to plain login:", err);
  }

  const tokens = await issueTokens(user.id, user.email);
  return c.json({ user: sanitizeUser(user), tokens });
});

// ─── POST /auth/refresh ────────────────────────────────────
coreAuthRoutes.post("/refresh", async (c) => {
  const parsed = refreshSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Refresh token is required" }, 400);

  const { refreshToken } = parsed.data;
  try {
    const payload = await verifyRefreshToken(refreshToken);
    const oldTokenHash = hashToken(refreshToken);
    const stored = await auth.findRefreshToken(oldTokenHash);
    if (!stored) return c.json({ error: "Refresh token has been revoked" }, 401);

    const user = await users.findById(payload.sub);
    if (!user) return c.json({ error: "User not found" }, 401);

    // Generate new token pair
    const accessToken = await signAccessToken(user.id, user.email);
    const newRefreshToken = await signRefreshToken(user.id);
    const newTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Atomically delete old token and insert new one in a transaction
    await sql.begin(async (tx: any) => {
      await tx`DELETE FROM refresh_tokens WHERE token_hash = ${oldTokenHash}`;
      await tx`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${newTokenHash}, ${expiresAt})`;
    });

    return c.json({
      user: sanitizeUser(user),
      // BUG-011: `expiresIn` must match the JWT's actual lifetime so clients
      // can refresh on time. Use the env-derived TTL, not a hardcoded 900.
      tokens: { accessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    });
  } catch {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
});

// ─── POST /auth/logout ─────────────────────────────────────
// BUG-R10-AUTH-LOGOUT-ANON-200-001: intentionally PUBLIC (no authMiddleware).
// Logout is idempotent: missing/expired tokens still return 200 so SDKs and
// browser sign-out paths that call logout as cleanup never see a confusing
// 401. Access tokens are stateless JWTs that expire on their own; the only
// destructive action is best-effort refresh-token revocation guarded by the
// `if (refreshToken)` below. Pinned as WONTFIX with this comment.
coreAuthRoutes.post("/logout", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body as { refreshToken?: string };
  if (refreshToken) {
    try { await auth.deleteRefreshToken(hashToken(refreshToken)); } catch { /* DB unavailable */ }
  }
  return c.json({ message: "Logged out successfully" });
});

// ─── GET /auth/me ──────────────────────────────────────────
coreAuthRoutes.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId" as never) as string;
  const userEmail = c.get("userEmail" as never) as string;

  // Try DB first, fall back to JWT payload if DB is unavailable
  try {
    const user = await users.findById(userId);
    if (user) {
      // Auto-create workspace on first login if needed
      await ensureWorkspace(userId, user.display_name, user.email);
      return c.json({ user: sanitizeUser(user) });
    }
  } catch {
    // DB unavailable
  }

  // Fallback: return user info from JWT claims
  return c.json({
    user: {
      id: userId,
      email: userEmail,
      displayName: userEmail.split("@")[0],
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
});

// ─── /auth/forgot-password and /auth/password-reset ──────────
// Inner logic for "I forgot my password, email me a link". Returns a
// generic envelope so callers cannot use timing or status codes to
// enumerate registered emails. MUST be reachable without any
// Authorization header — a user who has forgotten their password
// cannot mint a token to authenticate the request itself.
//
// Generic success message kept identical across success / not-found
// / mailer-failed paths to preserve the enumeration guard.
const FORGOT_PASSWORD_GENERIC_MESSAGE = "If an account with that email exists, a reset link has been sent.";

async function processForgotPassword(emailInput: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof emailInput !== "string" || emailInput.length === 0) {
    return { ok: false, error: "Email is required" };
  }
  try {
    const user = await auth.findUserByEmail(emailInput);
    if (!user) {
      // Don't reveal whether the email exists — silently succeed.
      return { ok: true };
    }

    // Generate a secure random reset token (raw goes to the user via
    // email; only the sha256 hash is persisted).
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await securityDb.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`;
    const displayName = user.display_name ?? user.email.split("@")[0] ?? "there";

    // Never let a missing SMTP config / transient mailer failure turn
    // the response into a 5xx — that would leak whether the address is
    // registered and break the enumeration guard. sendTemplatedEmail
    // already log-and-noops when no provider is configured.
    await sendTemplatedEmail(user.email, "password-reset", {
      resetUrl,
      userName: displayName,
    }).catch((err) => {
      console.warn("[Auth] password-reset email dispatch failed (non-fatal):", err);
    });
  } catch (err) {
    console.error("[Auth] Forgot password error:", err);
    // Swallow so we still return the generic success envelope.
  }
  return { ok: true };
}

// ─── POST /auth/forgot-password ────────────────────────────
coreAuthRoutes.post("/forgot-password", forgotPasswordRateLimiter, async (c) => {
  const { email } = (await c.req.json()) as { email?: unknown };
  const result = await processForgotPassword(email);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
});

// ─── POST /auth/password-reset ─────────────────────────────
// Alias for /auth/forgot-password using REST-style naming. Shares the
// SAME rate limiter so the alias can't be used to bypass the 3/hour
// cap on /forgot-password (limiter is keyed per-IP for unauthed
// requests — calls to either path count together). MUST be public for
// the same reason as /forgot-password.
coreAuthRoutes.post("/password-reset", forgotPasswordRateLimiter, async (c) => {
  const { email } = (await c.req.json()) as { email?: unknown };
  const result = await processForgotPassword(email);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
});

// ─── POST /auth/reset-password ─────────────────────────────
coreAuthRoutes.post("/reset-password", resetPasswordRateLimiter, async (c) => {
  const parsed = resetPasswordSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { token, password } = parsed.data;

  try {
    // Hash the raw token to look it up in DB
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const resetToken = await securityDb.findValidResetToken(tokenHash);

    if (!resetToken) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }

    // Update the user's password
    const passwordHash = await argon2.hash(password, ARGON2_OPTS);
    const user = await auth.updateUserPassword(resetToken.user_id, passwordHash);
    if (!user) return c.json({ error: "User not found" }, 404);

    // Mark token as used and revoke all refresh tokens
    await securityDb.markResetTokenUsed(tokenHash);
    await auth.deleteAllRefreshTokensForUser(resetToken.user_id);

    return c.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error("[Auth] Reset password error:", err);
    return c.json({ error: "Invalid or expired reset token" }, 400);
  }
});
