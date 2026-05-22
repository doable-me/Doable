/**
 * Admin Email Settings API Routes
 *
 * Platform admin only. CRUD for email provider configuration.
 * All credentials are encrypted at rest via pgp_sym_encrypt.
 *
 * Routes:
 *   GET    /admin/email/config         — get current config (credentials masked)
 *   POST   /admin/email/config         — create/update email config
 *   DELETE /admin/email/config         — delete email config (revert to env vars)
 *   POST   /admin/email/test           — send a test email
 *   GET    /admin/email/queue-stats    — email queue statistics
 *   GET    /admin/email/google/auth-url — get Gmail OAuth URL
 *   GET    /admin/email/google/callback — handle Gmail OAuth callback
 */

import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { featureFlagQueries } from "@doable/db";
import {
  getEmailQueueStats,
  reloadEmailProvider,
} from "../lib/email/index.js";

const featureFlags = featureFlagQueries(sql);

export const adminEmailRoutes = new Hono<AuthEnv>({ strict: false });

adminEmailRoutes.use("*", authMiddleware);

// ─── Platform admin guard ──────────────────────────────────
adminEmailRoutes.use("*", async (c, next) => {
  const userId = c.get("userId");
  const isAdmin = await featureFlags.isPlatformAdmin(userId);
  if (!isAdmin) {
    return c.json({ error: "Platform admin access required" }, 403);
  }
  await next();
});

// ─── Types ─────────────────────────────────────────────────

interface EmailConfigRow {
  id: string;
  provider: string;
  label: string;
  from_address: string;
  is_active: boolean;
  verified: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
  credentials_decrypted?: string;
}

// ─── GET /admin/email/config ───────────────────────────────
// Returns the active config with credentials MASKED
adminEmailRoutes.get("/config", async (c) => {
  const [row] = await sql<EmailConfigRow[]>`
    SELECT id, provider, label, from_address, is_active, verified,
           last_verified_at, last_error, configured_by, created_at, updated_at,
           pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY})::text as credentials_decrypted
    FROM email_config
    WHERE is_active = true
    LIMIT 1
  `;

  if (!row) {
    return c.json({ data: null });
  }

  // Parse credentials and mask sensitive values
  const creds = JSON.parse(row.credentials_decrypted!) as Record<string, unknown>;
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(creds)) {
    if (typeof value === "string" && value.length > 0) {
      // Show first 4 chars and last 2 for identification, mask the rest
      if (value.length <= 8) {
        masked[key] = "●".repeat(value.length);
      } else {
        masked[key] = value.slice(0, 4) + "●".repeat(Math.min(value.length - 6, 20)) + value.slice(-2);
      }
    } else {
      masked[key] = value;
    }
  }

  const { credentials_decrypted: _, ...config } = row;
  return c.json({ data: { ...config, credentials: masked } });
});

// ─── POST /admin/email/config ──────────────────────────────
// Create or update email provider configuration

const smtpSchema = z.object({
  provider: z.literal("smtp"),
  label: z.string().min(1).max(100),
  fromAddress: z.string().email().or(z.string().regex(/^.+<.+@.+>$/)), // "Name <email>" format
  credentials: z.object({
    service: z.string().optional(), // e.g. "gmail", "sendgrid"
    host: z.string().optional(),
    port: z.number().optional(),
    user: z.string().min(1),
    pass: z.string().min(1),
  }),
});

const resendSchema = z.object({
  provider: z.literal("resend"),
  label: z.string().min(1).max(100),
  fromAddress: z.string().email().or(z.string().regex(/^.+<.+@.+>$/)),
  credentials: z.object({
    apiKey: z.string().min(1),
  }),
});

const googleSchema = z.object({
  provider: z.literal("google"),
  label: z.string().min(1).max(100),
  fromAddress: z.string().email().or(z.string().regex(/^.+<.+@.+>$/)),
  credentials: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    refreshToken: z.string().min(1),
    emailUser: z.string().email().optional(),
  }),
});

const configSchema = z.discriminatedUnion("provider", [
  smtpSchema,
  resendSchema,
  googleSchema,
]);

adminEmailRoutes.post("/config", async (c) => {
  const body = await c.req.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { provider, label, fromAddress, credentials } = parsed.data;
  const userId = c.get("userId");
  const credJson = JSON.stringify(credentials);

  // Deactivate any existing config
  await sql`UPDATE email_config SET is_active = false, updated_at = now() WHERE is_active = true`;

  // Insert new config
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO email_config (provider, label, from_address, credentials_encrypted, configured_by)
    VALUES (
      ${provider},
      ${label},
      ${fromAddress},
      pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
      ${userId}
    )
    RETURNING id
  `;

  // Reload the email provider with new DB config
  await reloadEmailProvider(sql);

  return c.json({ data: { id: row!.id, provider, label, fromAddress } }, 201);
});

// ─── DELETE /admin/email/config ────────────────────────────
// Deactivate DB config — falls back to env vars
adminEmailRoutes.delete("/config", async (c) => {
  await sql`UPDATE email_config SET is_active = false, updated_at = now() WHERE is_active = true`;

  // Reload to fall back to env vars
  await reloadEmailProvider(sql);

  return c.json({ success: true });
});

// ─── POST /admin/email/test ────────────────────────────────
// Send a test email to the admin's address
adminEmailRoutes.post("/test", async (c) => {
  const userEmail = c.get("userEmail");
  const { sendEmail } = await import("../lib/email/index.js");

  const success = await sendEmail({
    to: userEmail,
    subject: "Doable — Test Email",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1; margin-bottom: 16px;">Email is working!</h2>
        <p style="color: #374151; line-height: 1.6;">
          This test email confirms that your email provider is correctly configured.
        </p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
          Sent at ${new Date().toISOString()} from Doable.
        </p>
      </div>
    `,
  });

  return c.json({ success });
});

// ─── GET /admin/email/queue-stats ──────────────────────────
adminEmailRoutes.get("/queue-stats", async (c) => {
  const stats = await getEmailQueueStats();
  return c.json({ data: stats });
});

// ─── GET /admin/email/queue ────────────────────────────────
// List queue items with pagination and status filter
adminEmailRoutes.get("/queue", async (c) => {
  const status = c.req.query("status"); // pending, processing, sent, failed, dead
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "25", 10)));
  const offset = (page - 1) * limit;

  const validStatuses = ["pending", "processing", "sent", "failed", "dead"];
  const statusFilter = status && validStatuses.includes(status) ? status : null;

  const items = statusFilter
    ? await sql`
        SELECT id, to_address, subject, status, attempts, max_attempts,
               last_error, from_address, template, created_at, sent_at,
               next_retry_at, updated_at
        FROM email_queue
        WHERE status = ${statusFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT id, to_address, subject, status, attempts, max_attempts,
               last_error, from_address, template, created_at, sent_at,
               next_retry_at, updated_at
        FROM email_queue
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const [countRow] = statusFilter
    ? await sql`SELECT COUNT(*)::int as total FROM email_queue WHERE status = ${statusFilter}`
    : await sql`SELECT COUNT(*)::int as total FROM email_queue`;

  return c.json({
    data: items,
    pagination: { page, limit, total: countRow?.total ?? 0 },
  });
});

// ─── GET /admin/email/queue/:id ────────────────────────────
// Get a single queue item with full HTML content
adminEmailRoutes.get("/queue/:id", async (c) => {
  const id = c.req.param("id");
  const [item] = await sql`
    SELECT id, to_address, subject, html, text_body, status, attempts, max_attempts,
           last_error, from_address, template, template_data, created_at, sent_at,
           next_retry_at, updated_at
    FROM email_queue WHERE id = ${id}
  `;
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json({ data: item });
});

// ─── POST /admin/email/queue/:id/retry ─────────────────────
// Reset a failed/dead email to pending for immediate retry
adminEmailRoutes.post("/queue/:id/retry", async (c) => {
  const id = c.req.param("id");
  const result = await sql`
    UPDATE email_queue
    SET status = 'pending', next_retry_at = now(), updated_at = now()
    WHERE id = ${id} AND status IN ('failed', 'dead')
    RETURNING id
  `;
  if (result.length === 0) return c.json({ error: "Not found or not retryable" }, 404);
  return c.json({ success: true });
});

// ─── POST /admin/email/queue/retry-all ─────────────────────
// Retry all failed/dead emails
adminEmailRoutes.post("/queue/retry-all", async (c) => {
  const status = c.req.query("status") ?? "failed";
  if (!["failed", "dead"].includes(status)) {
    return c.json({ error: "Can only retry 'failed' or 'dead' emails" }, 400);
  }
  const result = await sql`
    UPDATE email_queue
    SET status = 'pending', next_retry_at = now(), attempts = 0, updated_at = now()
    WHERE status = ${status}
  `;
  return c.json({ success: true, count: result.count });
});

// ─── DELETE /admin/email/queue/:id ─────────────────────────
// Delete a single queue item
adminEmailRoutes.delete("/queue/:id", async (c) => {
  const id = c.req.param("id");
  const result = await sql`DELETE FROM email_queue WHERE id = ${id} RETURNING id`;
  if (result.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// ─── DELETE /admin/email/queue ──────────────────────────────
// Purge queue items by status (e.g., clear all sent or dead letters)
adminEmailRoutes.delete("/queue", async (c) => {
  const status = c.req.query("status");
  if (!status || !["sent", "dead", "failed"].includes(status)) {
    return c.json({ error: "Specify ?status=sent|dead|failed" }, 400);
  }
  const result = await sql`DELETE FROM email_queue WHERE status = ${status}`;
  return c.json({ success: true, count: result.count });
});

// ─── Gmail OAuth Connect Flow ──────────────────────────────
// Step 1: Generate Google OAuth URL
adminEmailRoutes.get("/google/auth-url", async (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "GOOGLE_CLIENT_ID not configured in environment" }, 400);
  }

  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const redirectUri = `${apiUrl}/admin/email/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh_token
    state: c.get("userId"), // Pass userId for the callback
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return c.json({ url });
});

// Step 2: Handle Google OAuth callback — exchange code for tokens
adminEmailRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const userId = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.json({ error: `Google OAuth denied: ${error}` }, 400);
  }
  if (!code || !userId) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ error: "Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)" }, 500);
  }

  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const redirectUri = `${apiUrl}/admin/email/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return c.json({ error: `Token exchange failed: ${body}` }, 500);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokenData.refresh_token) {
    return c.json({ error: "No refresh token received — try revoking app access at https://myaccount.google.com/permissions and reconnecting" }, 400);
  }

  // Get the user's email address
  const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = profileRes.ok
    ? ((await profileRes.json()) as { emailAddress?: string })
    : { emailAddress: undefined };

  const emailUser = profile.emailAddress ?? "";

  // Store encrypted in DB
  const credJson = JSON.stringify({
    clientId,
    clientSecret,
    refreshToken: tokenData.refresh_token,
    emailUser,
  });

  // Deactivate existing
  await sql`UPDATE email_config SET is_active = false, updated_at = now() WHERE is_active = true`;

  await sql`
    INSERT INTO email_config (provider, label, from_address, credentials_encrypted, configured_by, verified)
    VALUES (
      'google',
      ${`Gmail (${emailUser})`},
      ${`Doable <${emailUser}>`},
      pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
      ${userId},
      true
    )
  `;

  // Reload provider
  await reloadEmailProvider(sql);

  // Redirect back to the admin page
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return c.redirect(`${appUrl}/admin?tab=email&gmail=connected`);
});

// ─── POST /admin/email/verify ──────────────────────────────
// Verify the current provider configuration
adminEmailRoutes.post("/verify", async (c) => {
  const { getActiveProvider } = await import("../lib/email/index.js");
  const provider = getActiveProvider();

  if (!provider || provider.name === "console") {
    return c.json({ verified: false, error: "No email provider configured" });
  }

  if (!provider.verify) {
    return c.json({ verified: true, message: "Provider does not support verification" });
  }

  const ok = await provider.verify();

  // Update verification status in DB
  await sql`
    UPDATE email_config
    SET verified = ${ok},
        last_verified_at = now(),
        last_error = ${ok ? null : "Verification failed"},
        updated_at = now()
    WHERE is_active = true
  `;

  return c.json({ verified: ok });
});
