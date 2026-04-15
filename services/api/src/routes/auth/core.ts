import { Hono } from "hono";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { userQueries } from "@doable/db/queries/users.js";
import { securityQueries } from "@doable/db/queries/security.js";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import {
  registerSchema, loginSchema, refreshSchema, resetPasswordSchema,
  hashToken, sanitizeUser, ARGON2_OPTS, stripHtmlTags,
  loginRateLimiter, registerRateLimiter, forgotPasswordRateLimiter, resetPasswordRateLimiter,
  issueTokens, ensureWorkspace, FRONTEND_URL,
} from "./helpers.js";

const auth = authQueries(sql);
const users = userQueries(sql);
const securityDb = securityQueries(sql);

export const coreAuthRoutes = new Hono();

// ─── POST /auth/register ───────────────────────────────────
coreAuthRoutes.post("/register", registerRateLimiter, async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, password, displayName } = parsed.data;

  // Sanitize displayName to prevent XSS
  const sanitizedName = displayName ? stripHtmlTags(displayName) : undefined;
  if (displayName && !sanitizedName) {
    return c.json({ error: "Validation failed", details: { displayName: ["Display name must contain visible text"] } }, 400);
  }

  const existing = await auth.findUserByEmail(email);
  if (existing) return c.json({ error: "An account with this email already exists" }, 409);

  const passwordHash = await argon2.hash(password, ARGON2_OPTS);
  const user = await auth.createUser({ email, passwordHash, displayName: sanitizedName });

  // Auto-create personal workspace so the user isn't blocked on first login
  await ensureWorkspace(user.id, user.display_name, user.email);

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
      tokens: { accessToken, refreshToken: newRefreshToken, expiresIn: 900 },
    });
  } catch {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
});

// ─── POST /auth/logout ─────────────────────────────────────
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

// ─── POST /auth/forgot-password ────────────────────────────
coreAuthRoutes.post("/forgot-password", forgotPasswordRateLimiter, async (c) => {
  const { email } = (await c.req.json()) as { email?: string };
  if (!email) return c.json({ error: "Email is required" }, 400);

  // Always return success to prevent email enumeration
  const successMessage = "If an account with that email exists, a reset link has been sent.";

  try {
    const user = await auth.findUserByEmail(email);
    if (!user) {
      // Don't reveal whether the email exists
      return c.json({ message: successMessage });
    }

    // Generate a secure random reset token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await securityDb.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // Build the reset URL with the raw token (not the hash)
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`;
    const displayName = user.display_name ?? user.email.split("@")[0] ?? "there";

    await sendTemplatedEmail(user.email, "password-reset", {
      resetUrl,
      userName: displayName,
    });
  } catch (err) {
    console.error("[Auth] Forgot password error:", err);
    // Don't reveal errors to the client
  }

  return c.json({ message: successMessage });
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
