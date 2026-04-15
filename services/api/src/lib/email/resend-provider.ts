/**
 * Resend Email Provider
 *
 * Uses Resend's HTTP API directly (no SDK dependency needed).
 * https://resend.com/docs/api-reference/emails/send-email
 */

import type { EmailProvider, EmailMessage, EmailSendResult } from "./provider.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Doable <noreply@doable.me>";
const RESEND_API_URL = "https://api.resend.com/emails";

export function createResendProvider(): EmailProvider | null {
  if (!RESEND_API_KEY) {
    return null;
  }

  return {
    name: "resend",

    async send(message: EmailMessage): Promise<EmailSendResult> {
      try {
        const res = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: message.from ?? EMAIL_FROM,
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
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    },

    async verify(): Promise<boolean> {
      // Verify API key by checking domains (lightweight call)
      try {
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
