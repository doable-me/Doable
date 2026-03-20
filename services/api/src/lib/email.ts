/**
 * Email Service
 *
 * Sends transactional emails via SMTP (SendGrid, Resend, Mailgun, or generic SMTP).
 * Falls back to console.log in development when SMTP is not configured.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import {
  passwordResetEmail,
  welcomeEmail,
  inviteEmail,
} from "./email-templates.js";

// ─── Configuration ──────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Doable <noreply@doable.app>";

const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

// ─── Transport ──────────────────────────────────────────────

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  if (!isSmtpConfigured) {
    console.warn("[Email] SMTP not configured — emails will be logged to console");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

// ─── Send Functions ─────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email. Falls back to console.log when SMTP is not configured.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, html, text } = options;

  const transport = getTransporter();

  if (!transport) {
    // Development fallback: log to console
    console.log("\n" + "=".repeat(60));
    console.log("[Email] Development mode — email not actually sent");
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  From:    ${EMAIL_FROM}`);
    console.log("  Body (text):", text ?? "(HTML only)");
    console.log("=".repeat(60) + "\n");
    return true;
  }

  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text: text ?? stripHtml(html),
    });
    console.log(`[Email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err);
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
 * Send an email using a named template with data.
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

  return sendEmail({ to, subject, html });
}

// ─── Utilities ──────────────────────────────────────────────

/**
 * Strip HTML tags for plain-text fallback.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
