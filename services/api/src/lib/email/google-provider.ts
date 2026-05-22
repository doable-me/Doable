/**
 * Google Mail API Provider
 *
 * Sends emails via Gmail API using OAuth2 service account or user credentials.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *
 * Setup steps:
 * 1. Enable Gmail API in Google Cloud Console
 * 2. Create OAuth2 credentials (Web application type)
 * 3. Obtain a refresh token via OAuth2 consent flow
 * 4. Set env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_EMAIL_USER
 */

import type { EmailProvider, EmailMessage, EmailSendResult } from "./provider.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_EMAIL_USER = process.env.GOOGLE_EMAIL_USER; // The Gmail address to send from
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Doable <noreply@doable.me>";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function createGoogleMailProvider(): EmailProvider | null {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return null;
  }

  let accessToken: string | null = null;
  let tokenExpiresAt = 0;

  async function getAccessToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
      return accessToken;
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: GOOGLE_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google OAuth token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return accessToken;
  }

  /**
   * Build a RFC 2822 MIME message and base64url-encode it for the Gmail API.
   */
  function buildRawMessage(message: EmailMessage): string {
    const from = message.from ?? EMAIL_FROM;
    const boundary = `boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    const lines = [
      `From: ${from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      message.text ?? stripHtml(message.html),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      message.html,
      ``,
      `--${boundary}--`,
    ];

    const raw = lines.join("\r\n");
    return Buffer.from(raw)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  return {
    name: "google",

    async send(message: EmailMessage): Promise<EmailSendResult> {
      try {
        const token = await getAccessToken();
        const raw = buildRawMessage(message);

        const res = await fetch(GMAIL_SEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        if (!res.ok) {
          const body = await res.text();
          return { success: false, error: `Gmail API ${res.status}: ${body}` };
        }

        const data = (await res.json()) as { id?: string };
        return { success: true, messageId: data.id };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, error };
      }
    },

    async verify(): Promise<boolean> {
      try {
        await getAccessToken();
        return true;
      } catch {
        return false;
      }
    },
  };
}

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
