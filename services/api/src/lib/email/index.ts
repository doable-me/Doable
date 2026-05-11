/**
 * Email Service — Main Entry Point
 *
 * Provider-abstracted email with database-backed queue.
 *
 * Configuration priority:
 *   1. Database (email_config table — set via Admin UI, encrypted at rest)
 *   2. Environment variables (EMAIL_PROVIDER, SMTP_HOST, RESEND_API_KEY, etc.)
 *   3. Console fallback (development only)
 *
 * Usage:
 *   import { initEmailService, sendEmail, sendTemplatedEmail } from "./email/index.js";
 *
 *   // At startup:
 *   await initEmailService(sql);
 *
 *   // To send:
 *   await sendTemplatedEmail("user@example.com", "welcome", { userName: "Alice" });
 *   await sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" });
 */

import type postgres from "postgres";
import type { EmailProvider, EmailMessage } from "./provider.js";
import { EmailQueue } from "./queue.js";
import { createSmtpProvider } from "./smtp-provider.js";
import { createResendProvider } from "./resend-provider.js";
import { createGoogleMailProvider } from "./google-provider.js";
import {
  passwordResetEmail,
  welcomeEmail,
  inviteEmail,
} from "../email-templates.js";

// ─── Singleton State ────────────────────────────────────────

let queue: EmailQueue | null = null;
let activeProvider: EmailProvider | null = null;
let initialized = false;
let dbSql: postgres.Sql | null = null;

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Doable <noreply@doable.me>";

// ─── DB Config Loader ───────────────────────────────────────

interface DbEmailConfig {
  provider: string;
  from_address: string;
  credentials_decrypted: string;
}

/**
 * Try loading email provider config from the database (admin-configured).
 * Returns null if no active config exists or DB is unavailable.
 */
async function loadProviderFromDb(sql: postgres.Sql): Promise<EmailProvider | null> {
  try {
    const { ENCRYPTION_KEY: encKey } = await import("../secrets.js");
    const [row] = await sql<DbEmailConfig[]>`
      SELECT provider, from_address,
             pgp_sym_decrypt(credentials_encrypted, ${encKey})::text as credentials_decrypted
      FROM email_config
      WHERE is_active = true
      LIMIT 1
    `;
    if (!row) return null;

    const creds = JSON.parse(row.credentials_decrypted) as Record<string, string>;
    const from = row.from_address;

    switch (row.provider) {
      case "smtp": {
        // Dynamically create SMTP provider from DB credentials
        const nodemailer = await import("nodemailer");
        const transportOpts: Record<string, unknown> = {
          auth: { user: creds.user, pass: creds.pass },
        };
        if (creds.service) {
          transportOpts.service = creds.service;
        } else {
          transportOpts.host = creds.host;
          transportOpts.port = parseInt(creds.port ?? "587", 10);
          transportOpts.secure = parseInt(creds.port ?? "587", 10) === 465;
        }
        const transporter = nodemailer.default.createTransport(transportOpts);
        const label = creds.service ?? creds.host ?? "smtp";
        return {
          name: `smtp (${label}) [DB]`,
          async send(message: EmailMessage) {
            try {
              const info = await transporter.sendMail({
                from: message.from ?? from,
                to: message.to,
                subject: message.subject,
                html: message.html,
                text: message.text,
              });
              return { success: true, messageId: info.messageId };
            } catch (err) {
              return { success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
          async verify() {
            try { await transporter.verify(); return true; } catch { return false; }
          },
        };
      }

      case "resend": {
        const apiKey = creds.apiKey;
        return {
          name: "resend [DB]",
          async send(message: EmailMessage) {
            try {
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: message.from ?? from,
                  to: [message.to],
                  subject: message.subject,
                  html: message.html,
                  text: message.text,
                }),
              });
              if (!res.ok) {
                const body = await res.text();
                return { success: false, error: `Resend API ${res.status}: ${body}` };
              }
              const data = (await res.json()) as { id?: string };
              return { success: true, messageId: data.id };
            } catch (err) {
              return { success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
          async verify() {
            try {
              const res = await fetch("https://api.resend.com/api-keys", {
                headers: { Authorization: `Bearer ${apiKey}` },
              });
              return res.ok;
            } catch { return false; }
          },
        };
      }

      case "google": {
        let accessToken: string | null = null;
        let tokenExpiresAt = 0;

        async function getAccessToken(): Promise<string> {
          if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: creds.clientId!,
              client_secret: creds.clientSecret!,
              refresh_token: creds.refreshToken!,
              grant_type: "refresh_token",
            }),
          });
          if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
          const data = (await res.json()) as { access_token: string; expires_in: number };
          accessToken = data.access_token;
          tokenExpiresAt = Date.now() + data.expires_in * 1000;
          return accessToken;
        }

        return {
          name: `google (${creds.emailUser ?? "Gmail"}) [DB]`,
          async send(message: EmailMessage) {
            try {
              const token = await getAccessToken();
              const boundary = `b_${Date.now().toString(36)}`;
              const text = message.text ?? message.html.replace(/<[^>]*>/g, "").trim();
              const raw = [
                `From: ${message.from ?? from}`, `To: ${message.to}`,
                `Subject: ${message.subject}`, "MIME-Version: 1.0",
                `Content-Type: multipart/alternative; boundary="${boundary}"`,
                "", `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "", text,
                "", `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', "", message.html,
                "", `--${boundary}--`,
              ].join("\r\n");
              const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
              const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ raw: encoded }),
              });
              if (!res.ok) {
                const body = await res.text();
                return { success: false, error: `Gmail API ${res.status}: ${body}` };
              }
              const data = (await res.json()) as { id?: string };
              return { success: true, messageId: data.id };
            } catch (err) {
              return { success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
          async verify() {
            try { await getAccessToken(); return true; } catch { return false; }
          },
        };
      }

      default:
        console.warn(`[Email] Unknown DB provider type: ${row.provider}`);
        return null;
    }
  } catch (err) {
    // DB not ready or table doesn't exist yet — silently fall back to env vars
    console.debug("[Email] Could not load DB config, falling back to env vars:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Env-Var Provider Selection ─────────────────────────────

function resolveProviderFromEnv(): EmailProvider | null {
  const explicit = process.env.EMAIL_PROVIDER?.toLowerCase();

  if (explicit === "smtp") return createSmtpProvider();
  if (explicit === "resend") return createResendProvider();
  if (explicit === "google") return createGoogleMailProvider();

  if (explicit && explicit !== "auto") {
    console.warn(`[Email] Unknown EMAIL_PROVIDER="${explicit}", falling back to auto-detect`);
  }

  return createResendProvider() ?? createSmtpProvider() ?? createGoogleMailProvider() ?? null;
}

// ─── Console-Only Provider (dev fallback) ───────────────────

const consoleProvider: EmailProvider = {
  name: "console",
  async send(message: EmailMessage) {
    console.log("\n" + "=".repeat(60));
    console.log("[Email] Development mode — email not actually sent");
    console.log(`  To:      ${message.to}`);
    console.log(`  Subject: ${message.subject}`);
    console.log(`  From:    ${message.from ?? EMAIL_FROM}`);
    console.log("=".repeat(60) + "\n");
    return { success: true, messageId: `dev-${Date.now()}` };
  },
};

// ─── Initialization ─────────────────────────────────────────

async function resolveProvider(sql: postgres.Sql): Promise<EmailProvider> {
  // Priority 1: DB config (admin UI)
  const dbProvider = await loadProviderFromDb(sql);
  if (dbProvider) return dbProvider;

  // Priority 2: Env vars
  const envProvider = resolveProviderFromEnv();
  if (envProvider) return envProvider;

  // Priority 3: Console fallback
  console.warn("[Email] No provider configured — emails will be logged to console only");
  return consoleProvider;
}

/**
 * Initialize the email service. Call once at server startup.
 * Checks DB config first, then env vars, then falls back to console.
 */
export async function initEmailService(sql: postgres.Sql): Promise<void> {
  if (initialized) return;
  dbSql = sql;

  activeProvider = await resolveProvider(sql);
  console.log(`[Email] Provider ready: ${activeProvider.name}`);

  // Log verification status (non-blocking — admin can verify via UI)
  if (activeProvider.verify && activeProvider.name !== "console") {
    const ok = await activeProvider.verify();
    if (!ok) {
      console.warn(`[Email] Provider "${activeProvider.name}" loaded but verify check failed — use admin UI to verify`);
    }
  }

  queue = new EmailQueue(sql, activeProvider);
  await queue.recoverStuck();
  queue.start();
  initialized = true;
}

/**
 * Reload the email provider (called after admin changes config in DB).
 * Swaps the active provider without restarting the queue.
 * Does NOT verify — admins should use the "Verify Connection" button explicitly.
 */
export async function reloadEmailProvider(sql: postgres.Sql): Promise<void> {
  const newProvider = await resolveProvider(sql);

  activeProvider = newProvider;
  if (queue) {
    queue.setProvider(newProvider);
  }
  console.log(`[Email] Provider reloaded: ${activeProvider.name}`);
}

/**
 * Get the currently active provider (for admin verification endpoint).
 */
export function getActiveProvider(): EmailProvider | null {
  return activeProvider;
}

/**
 * Graceful shutdown. Call before process exit.
 */
export async function stopEmailService(): Promise<void> {
  if (queue) {
    await queue.stop();
  }
}

// ─── Public API ─────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/**
 * Enqueue an email for delivery. Returns immediately.
 * The queue worker handles retries and delivery in the background.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!queue || !initialized) {
    // Fallback: send directly (queue not yet initialized)
    console.warn("[Email] Queue not initialized — sending directly");
    const provider = activeProvider ?? consoleProvider;
    const result = await provider.send({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      from: options.from,
    });
    return result.success;
  }

  try {
    await queue.enqueue({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      from: options.from,
    });
    return true;
  } catch (err) {
    console.error("[Email] Failed to enqueue email:", err);
    return false;
  }
}

// ─── Template Helpers ───────────────────────────────────────

type TemplateType = "password-reset" | "welcome" | "invite";

interface PasswordResetData {
  resetUrl: string;
  userName: string;
}

interface WelcomeData {
  userName: string;
}

interface InviteData {
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}

type TemplateDataMap = {
  "password-reset": PasswordResetData;
  welcome: WelcomeData;
  invite: InviteData;
};

/**
 * Enqueue a templated email for delivery.
 */
export async function sendTemplatedEmail<T extends TemplateType>(
  to: string,
  template: T,
  data: TemplateDataMap[T],
): Promise<boolean> {
  let subject: string;
  let html: string;

  switch (template) {
    case "password-reset": {
      const d = data as PasswordResetData;
      subject = "Reset your Doable password";
      html = passwordResetEmail(d.resetUrl, d.userName);
      break;
    }
    case "welcome": {
      const d = data as WelcomeData;
      subject = "Welcome to Doable!";
      html = welcomeEmail(d.userName);
      break;
    }
    case "invite": {
      const d = data as InviteData;
      subject = `You're invited to join ${d.workspaceName} on Doable`;
      html = inviteEmail(d.workspaceName, d.inviterName, d.acceptUrl);
      break;
    }
    default:
      throw new Error(`Unknown email template: ${template}`);
  }

  if (!queue || !initialized) {
    console.warn("[Email] Queue not initialized — sending directly");
    const provider = activeProvider ?? consoleProvider;
    const result = await provider.send({ to, subject, html });
    return result.success;
  }

  try {
    await queue.enqueue({
      to,
      subject,
      html,
      template,
      templateData: data as unknown as Record<string, unknown>,
    });
    return true;
  } catch (err) {
    console.error("[Email] Failed to enqueue templated email:", err);
    return false;
  }
}

/**
 * Get queue stats for monitoring / admin endpoints.
 */
export async function getEmailQueueStats() {
  if (!queue) return null;
  return queue.stats();
}

// ─── Re-exports ─────────────────────────────────────────────

export type { EmailProvider, EmailMessage, EmailSendResult } from "./provider.js";
