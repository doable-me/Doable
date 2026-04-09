import { Hono } from "hono";
import { z } from "zod";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { sql } from "../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { userQueries } from "@doable/db/queries/users.js";
import { workspaceQueries } from "@doable/db/queries/workspaces.js";
import { securityQueries } from "@doable/db/queries/security.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { getGitHubAuthUrl, exchangeGitHubCode, getGitHubCopilotAuthUrl, GITHUB_COPILOT_REDIRECT_URI, GITHUB_REPO_REDIRECT_URI, getGoogleAuthUrl, exchangeGoogleCode } from "../lib/oauth.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendTemplatedEmail } from "../lib/email.js";

const auth = authQueries(sql);
const users = userQueries(sql);
const workspaces = workspaceQueries(sql);
const securityDb = securityQueries(sql);
export const authRoutes = new Hono();
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ─── Validation Schemas ─────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Must contain uppercase, lowercase, and a number"),
  displayName: z.string().min(1).max(100).optional(),
});
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8).max(128),
});

// ─── Helpers ────────────────────────────────────────────────
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sanitizeUser(user: {
  id: string; email: string; display_name: string | null;
  avatar_url: string | null; is_platform_admin?: boolean; platform_role?: string; created_at: Date; updated_at: Date;
}) {
  return {
    id: user.id, email: user.email,
    displayName: user.display_name, avatarUrl: user.avatar_url,
    isPlatformAdmin: user.is_platform_admin ?? false,
    platformRole: user.platform_role ?? "member",
    createdAt: user.created_at.toISOString(), updatedAt: user.updated_at.toISOString(),
  };
}

const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 } as const;

async function issueTokens(userId: string, email: string) {
  const accessToken = await signAccessToken(userId, email);
  const refreshToken = await signRefreshToken(userId);
  try {
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await auth.storeRefreshToken({ userId, tokenHash, expiresAt });
  } catch {
    // DB unavailable — tokens still work for stateless JWT validation
  }
  return { accessToken, refreshToken, expiresIn: 900 };
}

/**
 * Ensure the user has at least one workspace. If not, auto-create a personal one.
 * This is called during /auth/me so the frontend always has a workspace to work with.
 */
async function ensureWorkspace(userId: string, displayName: string | null, email: string): Promise<void> {
  try {
    const existing = await workspaces.listByUser(userId);
    if (existing.length > 0) return;

    // Derive a workspace slug from the display name or email prefix
    const baseName = displayName ?? email.split("@")[0] ?? "user";
    const slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "workspace";

    // Ensure slug uniqueness by appending a random suffix if taken
    let finalSlug = slug;
    const existingWs = await workspaces.findBySlug(finalSlug);
    if (existingWs) {
      finalSlug = `${slug.slice(0, 40)}-${Date.now().toString(36)}`;
    }

    await workspaces.create({
      name: `${baseName}'s workspace`,
      slug: finalSlug,
      ownerId: userId,
      plan: "free",
    });
    console.log(`[Auth] Auto-created workspace for user ${userId} (slug: ${finalSlug})`);
  } catch (err) {
    console.error("[Auth] Failed to auto-create workspace:", err);
    // Non-fatal — user can still log in
  }
}

// ─── POST /auth/register ───────────────────────────────────
authRoutes.post("/register", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { email, password, displayName } = parsed.data;

  const existing = await auth.findUserByEmail(email);
  if (existing) return c.json({ error: "An account with this email already exists" }, 409);

  const passwordHash = await argon2.hash(password, ARGON2_OPTS);
  const user = await auth.createUser({ email, passwordHash, displayName });
  const tokens = await issueTokens(user.id, user.email);
  return c.json({ user: sanitizeUser(user), tokens }, 201);
});

// ─── POST /auth/login ──────────────────────────────────────
authRoutes.post("/login", async (c) => {
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
authRoutes.post("/refresh", async (c) => {
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
    await sql.begin(async (tx) => {
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
authRoutes.post("/logout", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body as { refreshToken?: string };
  if (refreshToken) {
    try { await auth.deleteRefreshToken(hashToken(refreshToken)); } catch { /* DB unavailable */ }
  }
  return c.json({ message: "Logged out successfully" });
});

// ─── GET /auth/me ──────────────────────────────────────────
authRoutes.get("/me", authMiddleware, async (c) => {
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
authRoutes.post("/forgot-password", async (c) => {
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
authRoutes.post("/reset-password", async (c) => {
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

// ─── GET /auth/github ──────────────────────────────────────
authRoutes.get("/github", (c) => {
  return c.redirect(getGitHubAuthUrl(crypto.randomUUID()));
});

// ─── GET /auth/github/callback ─────────────────────────────
authRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);
  try {
    const { user: ghUser } = await exchangeGitHubCode(code);
    if (!ghUser.email) return c.redirect(`${FRONTEND_URL}/login?error=no_email`);

    const user = await auth.createOrUpdateOAuthUser({
      email: ghUser.email, displayName: ghUser.name ?? ghUser.login,
      avatarUrl: ghUser.avatar_url, githubId: String(ghUser.id),
    });
    const tokens = await issueTokens(user.id, user.email);
    const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] GitHub callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─── GET /auth/google ──────────────────────────────────────
authRoutes.get("/google", (c) => {
  return c.redirect(getGoogleAuthUrl(crypto.randomUUID()));
});

// ─── GET /auth/google/callback ─────────────────────────────
authRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);
  try {
    const { user: googleUser } = await exchangeGoogleCode(code);

    // Try database first, fall back to direct JWT if DB is unavailable
    let userId: string;
    let email: string;
    try {
      const user = await auth.createOrUpdateOAuthUser({
        email: googleUser.email, displayName: googleUser.name,
        avatarUrl: googleUser.picture, googleId: googleUser.sub,
      });
      userId = user.id;
      email = user.email;
    } catch (dbErr) {
      console.warn("[OAuth] DB unavailable, issuing token from Google profile:", dbErr);
      userId = `google-${googleUser.sub}`;
      email = googleUser.email;
    }

    const tokens = await issueTokens(userId, email);
    const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] Google callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─── GET /auth/github/copilot ─ Initiate Copilot account connection ─
// No authMiddleware — this is a browser redirect, not an API call.
authRoutes.get("/github/copilot", (c) => {
  // Pass workspace info via state parameter
  const workspaceId = c.req.query("workspaceId");
  const state = JSON.stringify({ type: "copilot", workspaceId, nonce: crypto.randomUUID() });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(getGitHubCopilotAuthUrl(encodedState));
});

// ─── GET /auth/github/copilot/callback ─ Handle Copilot account OAuth ─
authRoutes.get("/github/copilot/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code) return c.redirect(`${FRONTEND_URL}/ai-settings?error=missing_code`);

  let workspaceId: string | undefined;
  try {
    const decoded = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    workspaceId = decoded.workspaceId;
  } catch {
    return c.redirect(`${FRONTEND_URL}/ai-settings?error=invalid_state`);
  }

  try {
    const { accessToken: githubToken, user: ghUser } = await exchangeGitHubCode(code, GITHUB_COPILOT_REDIRECT_URI);

    // Redirect back to frontend with the token info — the frontend will call
    // the API to store it (we can't call the DB here without the user's JWT).
    const params = new URLSearchParams({
      githubToken,
      githubLogin: ghUser.login,
      githubId: String(ghUser.id),
      ...(workspaceId ? { workspaceId } : {}),
    });
    return c.redirect(`${FRONTEND_URL}/ai-settings/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] GitHub Copilot callback error:", err);
    return c.redirect(`${FRONTEND_URL}/ai-settings?error=oauth_failed`);
  }
});

// ─── GET /auth/github/repo/callback ─ Handle GitHub repo OAuth ─
// This route handles the repo-scoped OAuth callback (needs "repo" scope)
// so users can push/pull code to GitHub from their Doable projects.
authRoutes.get("/github/repo/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code) {
    return c.redirect(`${FRONTEND_URL}?error=github_missing_code`);
  }

  let projectId = "";
  let returnUrl = "";
  let userId = "";
  try {
    const decoded = JSON.parse(
      Buffer.from(stateParam ?? "", "base64url").toString()
    );
    projectId = decoded.projectId ?? "";
    returnUrl = decoded.returnUrl ?? "";
    userId = decoded.userId ?? "";
  } catch {
    return c.redirect(`${FRONTEND_URL}?error=github_invalid_state`);
  }

  try {
    const { accessToken: githubToken, user: ghUser } =
      await exchangeGitHubCode(code, GITHUB_REPO_REDIRECT_URI);

    if (userId) {
      const ghDb = githubQueries(sql);
      await ghDb.upsertUserToken({
        userId,
        githubUsername: ghUser.login,
        githubId: String(ghUser.id),
        accessToken: githubToken,
        scopes: "repo,read:user",
      });
    }

    const params = new URLSearchParams({
      githubToken,
      githubUsername: ghUser.login,
      ...(projectId ? { projectId } : {}),
    });

    const redirectUrl = returnUrl
      ? `${returnUrl}?${params.toString()}`
      : `${FRONTEND_URL}/editor/${projectId}?githubConnected=true&${params.toString()}`;

    return c.redirect(redirectUrl);
  } catch (err) {
    console.error("[OAuth] GitHub repo callback error:", err);
    const redirectUrl = returnUrl || `${FRONTEND_URL}/editor/${projectId}`;
    return c.redirect(`${redirectUrl}?error=github_oauth_failed`);
  }
});
