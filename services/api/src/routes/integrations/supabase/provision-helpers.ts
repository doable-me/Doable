import { sql } from "../../../db/index.js";
import { workspaceQueries } from "@doable/db";
import { credentialVault, oauthApps } from "../../../integrations/credential-vault.js";
import { getIntegration } from "../../../integrations/registry/index.js";

const workspaces = workspaceQueries(sql);

// ─── Concurrency lock ──────────────────────────────────────
//
// Rate-limit: at most one in-flight Supabase provision per user.
// In-memory is fine for the ~100 user scale per CLAUDE.md (no Redis).
export const activeProvisions = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────

export async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

/**
 * Get the user's stored `supabase-mgmt` OAuth access token (from the
 * enhanced auth flow). Returns null when the user has not yet signed in
 * with Supabase — the caller must surface `supabase_oauth_required`.
 *
 * If the token is expired or expiring within 2 minutes and a
 * refresh_token is available, attempts a token refresh before returning.
 */
export async function getMgmtAccessToken(
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const conn = await credentialVault.get(userId, "supabase-mgmt", workspaceId);
  if (!conn) return null;
  const creds = conn.credentials as Record<string, unknown> | null;
  if (!creds) return null;

  const token =
    (creds.access_token as string | undefined) ??
    (creds.accessToken as string | undefined);
  if (!token) return null;

  // Check if the token is expired or expiring within 2 minutes
  const expiresAt = creds.expires_at as string | undefined;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now() + 2 * 60 * 1000) {
    const refreshToken = creds.refresh_token as string | undefined;
    if (refreshToken) {
      const refreshed = await tryRefreshToken(conn.id, refreshToken, userId, workspaceId);
      if (refreshed) return refreshed;
    }
    // Token expired with no refresh token — caller will get 412
    return null;
  }

  return token;
}

/**
 * Attempt to refresh the Supabase management OAuth token using the
 * stored refresh_token. Returns the new access_token on success, null
 * on failure (caller falls back to re-auth).
 */
async function tryRefreshToken(
  connectionId: string,
  refreshToken: string,
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  try {
    const def = getIntegration("supabase");
    const oauth2 = def?.enhancedAuth?.oauth2Config;
    if (!oauth2) return null;

    // Get client credentials from oauth_apps table
    const app = await oauthApps.get("supabase-mgmt", workspaceId);
    if (!app) return null;

    const clientId = app.client_id;
    const clientSecret = app.clientSecret ?? (app as any).client_secret;

    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    };
    if (clientSecret) body.client_secret = clientSecret;

    const res = await fetch(oauth2.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body),
    });

    if (!res.ok) {
      console.warn(`[Supabase] Token refresh failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      console.warn(`[Supabase] Token refresh error: ${data.error}`);
      return null;
    }

    const newAccessToken = data.access_token as string;
    const newRefreshToken = (data.refresh_token as string | undefined) ?? refreshToken;
    const expiresIn = data.expires_in as number | undefined;
    const newExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined;

    // Update the stored credentials
    await credentialVault.update(connectionId, {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      ...(newExpiresAt ? { expires_at: newExpiresAt } : {}),
    });

    console.log(`[Supabase] Token refreshed successfully`);
    return newAccessToken;
  } catch (err) {
    console.warn(`[Supabase] Token refresh failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
