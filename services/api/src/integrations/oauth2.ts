import * as crypto from "node:crypto";
import { getIntegration } from "./registry/index.js";
import { credentialVault, oauthApps } from "./credential-vault.js";
import type { IntegrationConnection, OAuth2TokenData } from "./types.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_URL ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

// Public-facing API origin used to build redirect_uri values. Many OAuth
// providers (Supabase, Google for non-localhost flows) require HTTPS, so the
// loopback API_URL above is unsuitable as a redirect target on production
// installs. Prefer the explicit public URL when present.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? (API_URL.startsWith("http://127.") || API_URL.startsWith("http://localhost") ? null : API_URL) ?? API_URL;

// The redirect URI for integration OAuth flows. This MUST be registered as an
// "Authorized redirect URI" in each OAuth provider's developer console.
//
// For Google Cloud Console specifically:
//   1. Go to APIs & Services > Credentials > your OAuth 2.0 Client ID
//   2. Add this URI under "Authorized redirect URIs"
//   3. Go to APIs & Services > OAuth consent screen > Scopes
//   4. Add any API scopes your integrations need (e.g. gmail.send,
//      gmail.readonly, spreadsheets, calendar, drive, etc.)
//   5. If the app is in "Testing" mode, add test user emails under
//      "Test users" — otherwise only listed users can authorize.
//
// Override with INTEGRATIONS_OAUTH_REDIRECT_URI env var if the API is behind
// a reverse proxy / tunnel and the public URL differs from API_URL.
const OAUTH_REDIRECT_URI =
  process.env.INTEGRATIONS_OAUTH_REDIRECT_URI ?? `${PUBLIC_API_URL}/integrations/oauth/callback`;

// ─── State Encryption ────────────────────────────────────
// OAuth state parameter carries the integration context through the flow.
// Encrypted so users can't tamper with it.

const STATE_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY ?? ENCRYPTION_KEY;

function encryptState(data: Record<string, unknown>): string {
  const json = JSON.stringify(data);
  const iv = crypto.randomBytes(16);
  // Derive a 32-byte key from the state key
  const key = crypto.createHash("sha256").update(STATE_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(json, "utf8", "base64url");
  encrypted += cipher.final("base64url");
  return `${iv.toString("base64url")}.${encrypted}`;
}

function decryptState(state: string): Record<string, unknown> {
  const [ivB64, encryptedB64] = state.split(".");
  if (!ivB64 || !encryptedB64) throw new Error("Invalid OAuth state");
  const iv = Buffer.from(ivB64, "base64url");
  const key = crypto.createHash("sha256").update(STATE_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedB64, "base64url", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

// ─── PKCE Code Verifier Store ────────────────────────────
// PKCE code verifiers — backed by shared KV store (in-memory or Redis)
import { getKVStore } from "@doable/shared/kv-store.js";

const CODE_VERIFIER_TTL_MS = 5 * 60 * 1000; // 5 minutes

function storeCodeVerifier(state: string, verifier: string): void {
  getKVStore().set(`oauth:cv:${state}`, verifier, CODE_VERIFIER_TTL_MS);
}

async function getCodeVerifier(state: string): Promise<string | undefined> {
  const kv = getKVStore();
  const verifier = await kv.get<string>(`oauth:cv:${state}`);
  if (verifier) await kv.delete(`oauth:cv:${state}`);
  return verifier;
}

// ─── Authorization URL ──────────────────────────────────

export async function buildAuthorizationUrl(integrationId: string, params: {
  userId: string;
  workspaceId: string;
  scope?: string;
  projectId?: string;
}): Promise<string> {
  const def = getIntegration(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);
  if (!def.oauth2Config) throw new Error(`${integrationId} does not support OAuth2`);

  const oauth = def.oauth2Config;

  // Resolve OAuth app credentials with fallback chain:
  // 1. Database (admin-registered oauth_apps table)
  // 2. Environment variables: OAUTH_{INTEGRATION_ID}_CLIENT_ID / _CLIENT_SECRET
  // 3. For Google services: fall back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
  // 4. For GitHub: fall back to GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
  let oauthApp = await oauthApps.get(integrationId, params.workspaceId);

  if (!oauthApp) {
    // Try environment variable fallback
    const envKey = integrationId.toUpperCase().replace(/-/g, "_");
    const envClientId = process.env[`OAUTH_${envKey}_CLIENT_ID`];
    const envClientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`];

    // Google services share the same OAuth app — prefer dedicated integrations
    // client over the login client to keep scopes/consent screens separate
    const isGoogle = oauth.authUrl.includes("accounts.google.com");
    const googleIntClientId = process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
    const googleIntClientSecret = process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET;
    const googleClientId = googleIntClientId || process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = googleIntClientSecret || process.env.GOOGLE_CLIENT_SECRET;

    // GitHub shares its OAuth app
    const isGitHub = oauth.authUrl.includes("github.com");
    const githubClientId = process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

    const clientId = envClientId || (isGoogle ? googleClientId : undefined) || (isGitHub ? githubClientId : undefined);
    const clientSecret = envClientSecret || (isGoogle ? googleClientSecret : undefined) || (isGitHub ? githubClientSecret : undefined);

    if (clientId && clientSecret) {
      oauthApp = { client_id: clientId, client_secret: clientSecret } as any;
    }
  }

  if (!oauthApp) {
    throw new Error(
      `OAuth not configured for ${def.displayName}. ` +
      `Set OAUTH_${integrationId.toUpperCase().replace(/-/g, "_")}_CLIENT_ID and _CLIENT_SECRET in .env, ` +
      `or ask an admin to register the OAuth app. ` +
      `The redirect URI that must be registered with the provider is: ${OAUTH_REDIRECT_URI}`
    );
  }

  const state = encryptState({
    integrationId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    scope: params.scope ?? "user",
    projectId: params.projectId,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  });

  const query: Record<string, string> = {
    response_type: "code",
    client_id: oauthApp.client_id,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: oauth.scopes.join(" "),
    state,
    ...(oauth.prompt !== "omit" ? { prompt: oauth.prompt ?? "consent" } : {}),
    ...oauth.extraParams,
  };

  // PKCE support
  if (oauth.pkce) {
    const verifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    storeCodeVerifier(state, verifier);
    query.code_challenge = oauth.pkceMethod === "S256"
      ? crypto.createHash("sha256").update(verifier).digest("base64url")
      : verifier;
    query.code_challenge_method = oauth.pkceMethod ?? "S256";
  }

  return `${oauth.authUrl}?${new URLSearchParams(query)}`;
}

// ─── OAuth Callback Handler ─────────────────────────────

export async function handleOAuthCallback(code: string, state: string): Promise<{
  connection: IntegrationConnection;
  redirectUrl: string;
}> {
  const decoded = decryptState(state);
  const {
    integrationId, userId, workspaceId, scope, projectId,
  } = decoded as {
    integrationId: string;
    userId: string;
    workspaceId: string;
    scope: string;
    projectId?: string;
  };

  // Verify state is not too old (10 minute max)
  const createdAt = (decoded.createdAt as number) ?? 0;
  if (Date.now() - createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth session expired. Please try again.");
  }

  const def = getIntegration(integrationId);
  if (!def?.oauth2Config) throw new Error(`Invalid integration for OAuth: ${integrationId}`);

  const oauth = def.oauth2Config;

  // Resolve OAuth app (same fallback chain as buildAuthorizationUrl)
  let oauthApp = await oauthApps.get(integrationId, workspaceId);
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  if (oauthApp) {
    clientId = oauthApp.client_id;
    clientSecret = oauthApp.clientSecret;
  } else {
    const envKey = integrationId.toUpperCase().replace(/-/g, "_");
    const isGoogle = oauth.authUrl.includes("accounts.google.com");
    const isGitHub = oauth.authUrl.includes("github.com");

    clientId = process.env[`OAUTH_${envKey}_CLIENT_ID`]
      || (isGoogle ? (process.env.GOOGLE_INTEGRATIONS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) : undefined)
      || (isGitHub ? process.env.GITHUB_CLIENT_ID : undefined);
    clientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`]
      || (isGoogle ? (process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET) : undefined)
      || (isGitHub ? process.env.GITHUB_CLIENT_SECRET : undefined);
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      `OAuth app not configured for ${integrationId}. ` +
      `Ensure the redirect URI ${OAUTH_REDIRECT_URI} is registered with your OAuth provider.`
    );
  }

  // Build token exchange request
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  };

  // PKCE
  const verifier = await getCodeVerifier(state);
  if (verifier) body.code_verifier = verifier;

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  // Some providers want credentials in Authorization header
  if (oauth.authorizationMethod === "HEADER") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    delete body.client_id;
    delete body.client_secret;
  }

  const tokenRes = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });
  const tokenData = await tokenRes.json() as Record<string, unknown>;

  if (tokenData.error) {
    const baseMsg = (tokenData.error_description ?? tokenData.error) as string;
    // Provide actionable guidance for the most common OAuth error
    const hint = String(tokenData.error).includes("redirect_uri_mismatch")
      || String(tokenData.error_description ?? "").includes("redirect_uri_mismatch")
      ? ` — Add this redirect URI to your OAuth provider's allowed list: ${OAUTH_REDIRECT_URI}`
      : "";
    throw new Error(baseMsg + hint);
  }

  // Build credential value
  const connectionValue: OAuth2TokenData = {
    access_token: tokenData.access_token as string,
    refresh_token: tokenData.refresh_token as string | undefined,
    expires_in: tokenData.expires_in as number | undefined,
    claimed_at: Math.floor(Date.now() / 1000),
    token_url: oauth.tokenUrl,
    client_id: clientId,
    client_secret: clientSecret,
    data: tokenData as Record<string, unknown>,
  };

  // Store encrypted connection
  const connection = await credentialVault.store({
    workspaceId,
    userId,
    integrationId,
    scope: (scope as "workspace" | "project" | "user") ?? "user",
    projectId,
    authType: "oauth2",
    credentials: connectionValue,
    displayName: `${def.displayName} connection`,
    metadata: {
      connected_at: new Date().toISOString(),
    },
  });

  // Redirect back to the app — this runs in a popup, so redirect to a page
  // that signals success. The popup opener polls for closure.
  const redirectUrl = `${APP_URL}/integrations/oauth/success?connected=${integrationId}`;

  return { connection, redirectUrl };
}

// ─── Token Refresh ──────────────────────────────────────

export async function refreshOAuth2Token(connectionId: string): Promise<void> {
  const creds = await credentialVault.decrypt(connectionId) as OAuth2TokenData | null;
  if (!creds) throw new Error("Connection not found");
  if (!creds.refresh_token) throw new Error("No refresh token available");

  // Check if actually expired (15-minute buffer)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (creds.claimed_at ?? 0) + (creds.expires_in ?? 3600);
  if (now + 900 < expiresAt) return; // Not expired yet

  // Find the integration to get OAuth config
  // We need to query the connection to get the integration_id
  const { sql } = await import("../db/index.js");
  const [connRow] = await sql`SELECT integration_id FROM integration_connections WHERE id = ${connectionId}`;
  if (!connRow) throw new Error("Connection not found");

  const def = getIntegration(connRow.integration_id);
  if (!def?.oauth2Config) throw new Error("Not an OAuth2 integration");
  const oauth = def.oauth2Config;

  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (oauth.authorizationMethod === "HEADER") {
    headers.Authorization = `Basic ${Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64")}`;
    delete body.client_id;
    delete body.client_secret;
  }

  const res = await fetch(creds.token_url ?? oauth.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });
  const data = await res.json() as Record<string, unknown>;

  if (data.error === "invalid_grant") {
    await credentialVault.updateStatus(connectionId, "revoked", "Token revoked. Please reconnect.");
    throw new Error("Integration token revoked. Please reconnect.");
  }

  if (data.error) {
    throw new Error((data.error_description ?? data.error) as string);
  }

  // Merge: only overwrite non-null values (preserve refresh_token if not returned)
  const updated = { ...creds };
  if (data.access_token) updated.access_token = data.access_token as string;
  if (data.refresh_token) updated.refresh_token = data.refresh_token as string;
  if (data.expires_in) updated.expires_in = data.expires_in as number;
  updated.claimed_at = Math.floor(Date.now() / 1000);
  if (data.scope) updated.data.scope = data.scope;

  await credentialVault.update(connectionId, updated);
}

/** Get the OAuth redirect URI (for display in admin UI) */
export function getOAuthRedirectUri(): string {
  return OAUTH_REDIRECT_URI;
}
