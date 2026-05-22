/**
 * SMTP Email Provider (nodemailer)
 *
 * Works with any SMTP server. Supports 30+ well-known services out of the box:
 *   Gmail, Outlook/Hotmail, Yahoo, iCloud, SendGrid, Mailgun, Postmark,
 *   AWS SES, Zoho, FastMail, ProtonMail, AOL, Godaddy, and more.
 *
 * Configuration:
 *   Option A — Well-known service (easiest):
 *     EMAIL_SERVICE=gmail        (or sendgrid, mailgun, outlook365, yahoo, etc.)
 *     SMTP_USER=you@gmail.com
 *     SMTP_PASS=your-app-password
 *
 *   Option B — Manual SMTP:
 *     SMTP_HOST=smtp.example.com
 *     SMTP_PORT=587
 *     SMTP_USER=apikey
 *     SMTP_PASS=SG.xxxxx
 *
 * Full list of supported services:
 *   https://nodemailer.com/smtp/well-known/
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { EmailProvider, EmailMessage, EmailSendResult } from "./provider.js";

const EMAIL_SERVICE = process.env.EMAIL_SERVICE; // e.g. "gmail", "sendgrid", "mailgun"
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Doable <noreply@doable.me>";

export function createSmtpProvider(): EmailProvider | null {
  // Need either a well-known service or manual SMTP host, plus credentials
  if (!(EMAIL_SERVICE || SMTP_HOST) || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  let transporter: Transporter | null = null;

  function getTransporter(): Transporter {
    if (transporter) return transporter;

    const transportOptions: SMTPTransport.Options = {
      auth: {
        user: SMTP_USER!,
        pass: SMTP_PASS!,
      },
    };

    if (EMAIL_SERVICE) {
      // Use nodemailer's built-in service presets (Gmail, SendGrid, Mailgun, etc.)
      transportOptions.service = EMAIL_SERVICE;
    } else {
      // Manual SMTP configuration
      transportOptions.host = SMTP_HOST;
      transportOptions.port = SMTP_PORT;
      transportOptions.secure = SMTP_PORT === 465;
    }

    transporter = nodemailer.createTransport(transportOptions);
    return transporter;
  }

  const label = EMAIL_SERVICE ?? SMTP_HOST ?? "smtp";

  return {
    name: `smtp (${label})`,

    async send(message: EmailMessage): Promise<EmailSendResult> {
      try {
        const info = await getTransporter().sendMail({
          from: message.from ?? EMAIL_FROM,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        return { success: true, messageId: info.messageId };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    },

    async verify(): Promise<boolean> {
      try {
        await getTransporter().verify();
        return true;
      } catch {
        return false;
      }
    },
  };
}
