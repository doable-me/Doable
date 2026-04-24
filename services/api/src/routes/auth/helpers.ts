import { z } from "zod";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { workspaceQueries } from "@doable/db/queries/workspaces.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { rateLimiter } from "../../middleware/rate-limit.js";
import { ensureBuiltinConnectorsForWorkspace } from "../../mcp/builtin-connectors.js";

const auth = authQueries(sql);
const workspaces = workspaceQueries(sql);

export const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ─── Validation Schemas ─────────────────────────────────────
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Must contain uppercase, lowercase, and a number"),
  displayName: z.string().min(1).max(100).optional(),
});
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8).max(128),
});

// ─── Helpers ────────────────────────────────────────────────
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sanitizeUser(user: {
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

export const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 } as const;

/** Strip HTML tags from a string to prevent XSS via displayName fields. */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

// ─── Auth-specific rate limiters ──────────────────────────────
export const loginRateLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });   // 10 per 15 min
export const registerRateLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }); // 5 per hour
export const forgotPasswordRateLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }); // 3 per hour
export const resetPasswordRateLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }); // 5 per hour

export async function issueTokens(userId: string, email: string) {
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
export async function ensureWorkspace(userId: string, displayName: string | null, email: string): Promise<void> {
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

    const ws = await workspaces.create({
      name: `${baseName}'s workspace`,
      slug: finalSlug,
      ownerId: userId,
      plan: "free",
    });
    console.log(`[Auth] Auto-created workspace for user ${userId} (slug: ${finalSlug})`);
    await ensureBuiltinConnectorsForWorkspace(ws.id, userId);
  } catch (err) {
    console.error("[Auth] Failed to auto-create workspace:", err);
    // Non-fatal — user can still log in
  }
}
