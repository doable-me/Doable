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

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const STATE_KEY = process.env.ENCRYPTION_KEY ?? process.env.CREDENTIALS_ENCRYPTION_KEY ?? "doable-dev-key";
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

export const MCP_OAUTH_REDIRECT_URI =
  process.env.MCP_OAUTH_REDIRECT_URI ?? `${API_URL}/connectors/mcp-oauth/callback`;

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
  /** Doable context */
  userId: string;
  workspaceId: string;
  /** If we're updating an existing connector */
  connectorId?: string;
  /** Connector name (for creating a new one) */
  connectorName?: string;
}

export function buildMcpOAuthUrl(params: McpOAuthAuthorizeParams): string {
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
    clientId: params.clientId,
    ts: Date.now(),
  });

  // Store PKCE code verifier keyed by state
  storeCodeVerifier(state, codeVerifier);

  // Build the authorization URL
  const authUrl = new URL(params.authorizationEndpoint);
  authUrl.searchParams.set("response_type", "code");
  if (params.clientId) {
    authUrl.searchParams.set("client_id", params.clientId);
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
