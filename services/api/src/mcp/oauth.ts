/**
 * MCP OAuth 2.1 Authorization Flow
 *
 * Implements the MCP spec's OAuth flow for MCP servers that require authentication:
 * 1. Client discovers OAuth metadata via 401 + Protected Resource Metadata (RFC 9728)
 * 2. Client builds authorization URL with PKCE (mandatory per MCP spec)
 * 3. User authorizes in a popup
 * 4. Callback exchanges code for access token
 * 5. Token is stored in the connector's encrypted credentials
 *
 * This is separate from the integration OAuth flow because MCP OAuth
 * uses runtime-discovered endpoints (from the MCP server's metadata)
 * rather than pre-configured OAuth app credentials.
 */

import * as crypto from "node:crypto";
import { getKVStore } from "@doable/shared/kv-store.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const STATE_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY ?? ENCRYPTION_KEY;
const CODE_VERIFIER_TTL_MS = 10 * 60 * 1000; // 10 minutes (longer than integrations since user may take time)

// ─── State Encryption (same pattern as integrations/oauth2.ts) ─────────

function encryptState(data: Record<string, unknown>): string {
  const json = JSON.stringify(data);
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(STATE_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(json, "utf8", "base64url");
  encrypted += cipher.final("base64url");
  return `${iv.toString("base64url")}.${encrypted}`;
}

export function decryptState(state: string): Record<string, unknown> {
  const [ivB64, encryptedB64] = state.split(".");
  if (!ivB64 || !encryptedB64) throw new Error("Invalid MCP OAuth state");
  const iv = Buffer.from(ivB64, "base64url");
  const key = crypto.createHash("sha256").update(STATE_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedB64, "base64url", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

// ─── PKCE ──────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function storeCodeVerifier(stateKey: string, verifier: string): void {
  getKVStore().set(`mcp-oauth:cv:${stateKey}`, verifier, CODE_VERIFIER_TTL_MS);
}

export async function getCodeVerifier(stateKey: string): Promise<string | undefined> {
  const kv = getKVStore();
  const verifier = await kv.get<string>(`mcp-oauth:cv:${stateKey}`);
  if (verifier) await kv.delete(`mcp-oauth:cv:${stateKey}`);
  return verifier;
}

// ─── MCP OAuth Redirect URI ──────────────────────────────

// The browser is redirected to this callback by the MCP server's authorization
// server after the user authenticates, so it MUST be the PUBLIC, browser-
// reachable URL — never the internal service address (e.g. http://api:4000 in
// Docker, which the browser cannot reach: the user lands on a dead host). Prefer
// an explicit override, then the public API base (NEXT_PUBLIC_API_URL — set to
// the proxy-fronted public /api URL by every proxied install, incl.
// deployment/docker/setup.sh), and only fall back to the internal API_URL for
// direct/non-proxied (dev) runs where NEXT_PUBLIC_API_URL already points at the
// api directly.
const PUBLIC_API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? API_URL).replace(/\/+$/, "");
export const MCP_OAUTH_REDIRECT_URI =
  process.env.MCP_OAUTH_REDIRECT_URI ?? `${PUBLIC_API_BASE}/connectors/mcp-oauth/callback`;

// ─── Build Authorization URL ─────────────────────────────

export interface McpOAuthAuthorizeParams {
  /** The authorization endpoint URL (discovered from AS metadata) */
  authorizationEndpoint: string;
  /** The token endpoint URL (discovered from AS metadata) */
  tokenEndpoint: string;
  /** The MCP server URL (resource identifier for RFC 8707) */
  mcpServerUrl: string;
  /** Scopes to request (discovered or defaults) */
  scopes?: string[];
  /** OAuth client ID (if the user provides one, or from dynamic registration) */
  clientId?: string;
  /** Dynamic Client Registration endpoint (RFC 7591) */
  registrationEndpoint?: string;
  /** Doable context */
  userId: string;
  workspaceId: string;
  /** If we're updating an existing connector */
  connectorId?: string;
  /** Connector name (for creating a new one) */
  connectorName?: string;
}

// ─── Dynamic Client Registration (RFC 7591) ──────────────

/** Cached client registrations: registrationEndpoint → { clientId, clientSecret } */
const registrationCache = new Map<string, { clientId: string; clientSecret?: string; expiresAt?: number }>();

interface ClientRegistrationResult {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

/**
 * Register Doable as an OAuth client with the MCP server's authorization server.
 * Per MCP spec, servers SHOULD support RFC 7591 Dynamic Client Registration.
 *
 * Results are cached per registration endpoint to avoid re-registering.
 */
async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
): Promise<{ clientId: string; clientSecret?: string }> {
  // Check cache first
  const cached = registrationCache.get(registrationEndpoint);
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
    console.log(`[MCP:OAuth] Using cached client registration for ${registrationEndpoint}`);
    return { clientId: cached.clientId, clientSecret: cached.clientSecret };
  }

  console.log(`[MCP:OAuth] Registering client at ${registrationEndpoint}`);

  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_name: "Doable",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // Public client (PKCE only)
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Dynamic client registration failed (${response.status}): ${errText}`);
  }

  const data = await response.json() as ClientRegistrationResult;
  if (!data.client_id) {
    throw new Error("Client registration response missing client_id");
  }

  console.log(`[MCP:OAuth] Registered client: ${data.client_id}`);

  // Cache the registration
  registrationCache.set(registrationEndpoint, {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    expiresAt: data.client_secret_expires_at
      ? data.client_secret_expires_at * 1000 // Convert to ms
      : undefined,
  });

  return { clientId: data.client_id, clientSecret: data.client_secret };
}

// ─── Build Authorization URL (with auto-registration) ────

export async function buildMcpOAuthUrl(params: McpOAuthAuthorizeParams): Promise<string> {
  let clientId = params.clientId;

  // If no client ID provided and registration endpoint is available, register dynamically
  if (!clientId && params.registrationEndpoint) {
    const reg = await registerClient(params.registrationEndpoint, MCP_OAUTH_REDIRECT_URI);
    clientId = reg.clientId;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Build state — encrypted to prevent tampering
  const state = encryptState({
    type: "mcp-oauth",
    userId: params.userId,
    workspaceId: params.workspaceId,
    connectorId: params.connectorId,
    connectorName: params.connectorName,
    mcpServerUrl: params.mcpServerUrl,
    tokenEndpoint: params.tokenEndpoint,
    clientId,
    ts: Date.now(),
  });

  // Store PKCE code verifier keyed by state
  storeCodeVerifier(state, codeVerifier);

  // Build the authorization URL
  const authUrl = new URL(params.authorizationEndpoint);
  authUrl.searchParams.set("response_type", "code");
  if (clientId) {
    authUrl.searchParams.set("client_id", clientId);
  }
  authUrl.searchParams.set("redirect_uri", MCP_OAUTH_REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Add scopes if available
  if (params.scopes && params.scopes.length > 0) {
    authUrl.searchParams.set("scope", params.scopes.join(" "));
  }

  // RFC 8707 resource parameter — tells the AS which resource we want access to
  authUrl.searchParams.set("resource", params.mcpServerUrl);

  return authUrl.toString();
}

// ─── Exchange Code for Token ─────────────────────────────

export interface McpOAuthTokenResult {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export async function exchangeCodeForToken(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  clientId?: string,
): Promise<McpOAuthTokenResult> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", MCP_OAUTH_REDIRECT_URI);
  body.set("code_verifier", codeVerifier);
  if (clientId) {
    body.set("client_id", clientId);
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${errText}`);
  }

  const data = await response.json() as McpOAuthTokenResult;
  if (!data.access_token) {
    throw new Error("Token response missing access_token");
  }

  return data;
}
