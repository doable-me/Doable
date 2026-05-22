/**
 * Optional Multi-Factor Authentication routes (TOTP + recovery codes).
 *
 * Flow summary:
 *   1. POST /auth/mfa/enroll/start  → (authed) → returns secret + otpauth URL
 *   2. POST /auth/mfa/enroll/verify → (authed, code) → enables MFA + returns one-time recovery codes
 *   3. POST /auth/login             → if user has MFA → returns { mfaRequired, mfaToken }
 *   4. POST /auth/mfa/verify        → (mfaToken, code|recovery) → returns real session tokens
 *   5. POST /auth/mfa/disable       → (authed, password, code) → removes all factors + codes
 *   6. POST /auth/mfa/recovery-codes/regenerate → (authed, password, code) → fresh recovery codes
 *   7. GET  /auth/mfa/status        → (authed) → factor info, unused recovery count
 *
 * Security notes:
 *   - TOTP secrets are encrypted at rest via lib/envelope-crypto encryptWithKek.
 *   - Recovery codes are stored as SHA-256 hex; plaintext is shown ONCE.
 *   - The MFA challenge JWT is short-lived (5 min) and purpose-locked.
 *   - All write paths are rate-limited; /verify also requires the existing
 *     loginRateLimiter window since the mfaToken's IP context isn't
 *     trusted.
 */
import { Hono } from "hono";
import { z } from "zod";
import * as argon2 from "argon2";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { mfaQueries } from "@doable/db/queries/mfa.js";
import { authMiddleware } from "../../middleware/auth.js";
import { rateLimiter } from "../../middleware/rate-limit.js";
import {
  signMfaChallengeToken,
  verifyMfaChallengeToken,
} from "../../lib/jwt.js";
import {
  encryptWithKek,
  decryptWithKek,
} from "../../lib/envelope-crypto.js";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
} from "../../lib/mfa.js";
import {
  hashToken,
  sanitizeUser,
  issueTokens,
  loginRateLimiter,
} from "./helpers.js";

const auth = authQueries(sql);
const mfa = mfaQueries(sql);

export const mfaRoutes = new Hono({ strict: false });

const TOTP_ISSUER = process.env.MFA_ISSUER_NAME ?? "Doable";

const RECOVERY_CODE_COUNT = 10;

// ─── Validation schemas ─────────────────────────────────────────────

const enrollVerifySchema = z.object({
  code: z.string().min(6).max(6),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().min(6).max(32),
});

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(32),
});

const regenerateSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(32),
});

// ─── Rate limiters ──────────────────────────────────────────────────

const enrollRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  prefix: "rl:mfa:enroll",
});
const verifyRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: "rl:mfa:verify",
});
const sensitiveRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: "rl:mfa:sensitive",
});

// ─── Helper: validate a code (TOTP or recovery) ──────────────────────

async function consumeMfaCode(
  userId: string,
  code: string,
): Promise<{ ok: true; via: "totp" | "recovery" } | { ok: false; error: string }> {
  const factor = await mfa.getVerifiedFactor(userId);
  if (!factor) return { ok: false, error: "MFA is not enabled" };

  // Recovery codes have a distinct shape; try them first when the input
  // doesn't look like a 6-digit TOTP code.
  if (looksLikeRecoveryCode(code)) {
    const codeHash = hashRecoveryCode(code);
    const rc = await mfa.findUnusedRecoveryCode({ userId, codeHash });
    if (rc) {
      await mfa.markRecoveryCodeUsed(rc.id);
      await mfa.markFactorUsed(factor.id);
      return { ok: true, via: "recovery" };
    }
    return { ok: false, error: "Invalid recovery code" };
  }

  // TOTP path.
  let secret: string;
  try {
    secret = decryptWithKek(factor.secret_ciphertext).toString("utf8");
  } catch {
    return { ok: false, error: "MFA secret could not be decrypted" };
  }
  if (verifyTotp(secret, code.trim())) {
    await mfa.markFactorUsed(factor.id);
    return { ok: true, via: "totp" };
  }
  return { ok: false, error: "Invalid code" };
}

// ─── GET /auth/mfa/status ───────────────────────────────────────────

mfaRoutes.get("/mfa/status", authMiddleware, async (c) => {
  const userId = c.get("userId" as never) as string;
  const factor = await mfa.getVerifiedFactor(userId);
  if (!factor) {
    return c.json({ enabled: false });
  }
  const unused = await mfa.countUnusedRecoveryCodes(userId);
  return c.json({
    enabled: true,
    label: factor.label,
    verifiedAt: factor.verified_at?.toISOString() ?? null,
    lastUsedAt: factor.last_used_at?.toISOString() ?? null,
    unusedRecoveryCodes: unused,
  });
});

// ─── POST /auth/mfa/enroll/start ────────────────────────────────────

mfaRoutes.post("/mfa/enroll/start", authMiddleware, enrollRateLimiter, async (c) => {
  const userId = c.get("userId" as never) as string;
  const userEmail = c.get("userEmail" as never) as string;

  const secret = generateTotpSecret();
  const ciphertext = encryptWithKek(secret);

  await mfa.upsertPendingFactor({
    userId,
    secretCiphertext: ciphertext,
  });

  const otpauthUrl = buildOtpauthUrl({
    issuer: TOTP_ISSUER,
    accountName: userEmail,
    secretBase32: secret,
  });

  return c.json({
    secret,         // shown once for manual entry fallback
    otpauthUrl,     // for QR rendering
    issuer: TOTP_ISSUER,
    accountName: userEmail,
  });
});

// ─── POST /auth/mfa/enroll/verify ───────────────────────────────────

mfaRoutes.post("/mfa/enroll/verify", authMiddleware, verifyRateLimiter, async (c) => {
  const userId = c.get("userId" as never) as string;

  const parsed = enrollVerifySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const pending = await mfa.getPendingFactor(userId);
  if (!pending) {
    return c.json({ error: "No pending enrollment. Start enrollment first." }, 400);
  }

  let secret: string;
  try {
    secret = decryptWithKek(pending.secret_ciphertext).toString("utf8");
  } catch {
    return c.json({ error: "Failed to read pending secret" }, 500);
  }

  if (!verifyTotp(secret, parsed.data.code)) {
    return c.json({ error: "Invalid code. Try again." }, 400);
  }

  const verified = await mfa.verifyPendingFactor({
    userId,
    pendingFactorId: pending.id,
  });
  if (!verified) {
    return c.json({ error: "Could not verify enrollment. Try again." }, 500);
  }

  // Generate fresh recovery codes; persist hashes, return plaintext once.
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(c));
  await mfa.replaceRecoveryCodes({ userId, codeHashes: hashes });

  return c.json({
    enabled: true,
    recoveryCodes,
    label: verified.label,
  });
});

// ─── POST /auth/mfa/verify (login challenge exchange) ───────────────

mfaRoutes.post("/mfa/verify", loginRateLimiter, async (c) => {
  const parsed = mfaVerifySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  let userId: string;
  let email: string;
  try {
    const payload = await verifyMfaChallengeToken(parsed.data.mfaToken);
    userId = payload.sub;
    email = payload.email;
  } catch {
    return c.json({ error: "MFA session expired. Please sign in again." }, 401);
  }

  const result = await consumeMfaCode(userId, parsed.data.code);
  if (!result.ok) {
    return c.json({ error: result.error }, 401);
  }

  const user = await auth.findUserByEmail(email);
  if (!user || user.id !== userId) {
    return c.json({ error: "User not found" }, 401);
  }

  const tokens = await issueTokens(user.id, user.email);
  const unused = await mfa.countUnusedRecoveryCodes(user.id);
  return c.json({
    user: sanitizeUser(user),
    tokens,
    usedRecovery: result.via === "recovery",
    unusedRecoveryCodes: unused,
  });
});

// ─── POST /auth/mfa/disable ─────────────────────────────────────────

mfaRoutes.post("/mfa/disable", authMiddleware, sensitiveRateLimiter, async (c) => {
  const userId = c.get("userId" as never) as string;

  const parsed = disableSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userEmail = c.get("userEmail" as never) as string;
  const user = await auth.findUserByEmail(userEmail);
  if (!user || !user.password_hash) {
    return c.json({ error: "Password verification required to disable MFA" }, 401);
  }
  const passwordOk = await argon2.verify(user.password_hash, parsed.data.password);
  if (!passwordOk) {
    return c.json({ error: "Invalid password" }, 401);
  }

  const codeResult = await consumeMfaCode(userId, parsed.data.code);
  if (!codeResult.ok) {
    return c.json({ error: codeResult.error }, 401);
  }

  await mfa.deleteAllForUser(userId);

  // Revoke all refresh tokens so any other sessions must re-authenticate.
  try {
    await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`;
  } catch { /* non-fatal */ }

  return c.json({ enabled: false });
});

// ─── POST /auth/mfa/recovery-codes/regenerate ───────────────────────

mfaRoutes.post("/mfa/recovery-codes/regenerate", authMiddleware, sensitiveRateLimiter, async (c) => {
  const userId = c.get("userId" as never) as string;

  const parsed = regenerateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const userEmail = c.get("userEmail" as never) as string;
  const user = await auth.findUserByEmail(userEmail);
  if (!user || !user.password_hash) {
    return c.json({ error: "Password verification required" }, 401);
  }
  const passwordOk = await argon2.verify(user.password_hash, parsed.data.password);
  if (!passwordOk) {
    return c.json({ error: "Invalid password" }, 401);
  }

  const codeResult = await consumeMfaCode(userId, parsed.data.code);
  if (!codeResult.ok) {
    return c.json({ error: codeResult.error }, 401);
  }

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(c));
  await mfa.replaceRecoveryCodes({ userId, codeHashes: hashes });

  return c.json({ recoveryCodes });
});

// ─── Helper for callers (core.ts / oauth.ts) ────────────────────────

/**
 * Issue a short-lived MFA challenge token instead of real session tokens.
 * Used by /auth/login and OAuth callbacks when the user has a verified
 * MFA factor.
 */
export async function issueMfaChallenge(userId: string, email: string): Promise<{
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}> {
  const mfaToken = await signMfaChallengeToken(userId, email);
  return { mfaRequired: true, mfaToken, expiresIn: 300 };
}

export { hashToken };
