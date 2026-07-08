/**
 * NotebookLM connector — per-user link token (Design T).
 *
 * The token is a deterministic, unguessable secret derived from the user id with
 * the server's INTERNAL_SECRET. It is used as the cookie-store key on the
 * standalone NotebookLM MCP service: the Chrome extension syncs the user's
 * Google cookies under this token, and the connector-proxy injects the SAME
 * value as `user_token` on every MCP tool call — so each user's NotebookLM
 * session is keyed by a secret (not their raw user id) with no extra storage.
 */
import { createHmac } from "node:crypto";
import { INTERNAL_SECRET } from "../lib/secrets.js";

export function notebooklmLinkToken(userId: string): string {
  return createHmac("sha256", INTERNAL_SECRET)
    .update(`notebooklm:${userId}`)
    .digest("base64url");
}

/** Public base URL the Chrome extension posts cookies to (rides the staging-api tunnel). */
export const NOTEBOOKLM_SYNC_BASE =
  process.env.NOTEBOOKLM_SYNC_BASE ?? "https://staging-api.doable.me";

/** Internal URL of the standalone NotebookLM MCP service (cookie sink + tools). */
export const NOTEBOOKLM_SERVICE_URL =
  process.env.NOTEBOOKLM_SERVICE_URL ?? "http://127.0.0.1:3001";
