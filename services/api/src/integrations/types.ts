// ─── Integration Registry Types ──────────────────────────

export type IntegrationCategory =
  | "communication"
  | "productivity"
  | "developer_tools"
  | "crm_sales"
  | "marketing"
  | "finance_payments"
  | "ai_ml"
  | "data_storage"
  | "social_media"
  | "ecommerce"
  | "project_management"
  | "customer_support"
  | "hr"
  | "analytics"
  | "content"
  | "automation"
  | "other";

export type AuthType = "oauth2" | "secret_text" | "custom_auth" | "basic_auth" | "none";

export interface OAuth2Config {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  pkceMethod?: "plain" | "S256";
  authorizationMethod?: "HEADER" | "BODY";
  prompt?: "consent" | "login" | "none" | "omit";
  extraParams?: Record<string, string>;
}

export interface CustomAuthField {
  name: string;
  displayName: string;
  description?: string;
  type: "text" | "secret" | "dropdown";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface IntegrationDefinition {
  id: string;
  piecePackage: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: IntegrationCategory;
  tags: string[];
  authType: AuthType;
  oauth2Config?: OAuth2Config;
  customAuthFields?: CustomAuthField[];
  actions: string[];
  actionOverrides?: Record<string, {
    description?: string;
    hidden?: boolean;
  }>;
  triggers?: string[];
  tier: "built_in" | "community";
  requiresOAuthApp: boolean;
  supportsUserProvidedCredentials: boolean;
  /** Optional enhanced auth — offers OAuth-based "easy connect" alongside manual form */
  enhancedAuth?: EnhancedAuthConfig;
  /** Optional env-var mapping — declares which credential fields the vault-bridge
   *  exposes to the user's project runtime, split by browser-safe vs server-only.
   *  Used by `services/api/src/env/vault-bridge.ts` to construct the env map and the
   *  AI's `<connected-integrations>` system prompt manifest. */
  envKeyMap?: EnvKeyMapping;
}

// ─── Env Key Mapping (Phase 1A) ──────────────────────────
//
// Per-integration declaration mapping credential fields to env var names.
// `client.*` values get bundled into the browser via Vite's `import.meta.env.VITE_*`
// allowlist and MUST therefore start with `VITE_`. `server.*` values are server-only
// — they MUST NOT start with `VITE_` (the vault-bridge enforces both rules at runtime
// and refuses to expose any field that violates them).
//
// `runtimeHint` is a one-line description shown in the system prompt manifest
// (e.g. "Postgres database + auth + storage") so the AI knows what the integration
// is for without ever seeing decrypted credential values.

export interface EnvKeyMapping {
  /** Browser-safe credential fields. Each value MUST start with `VITE_`. */
  client?: Record<string, string>;
  /** Server-only credential fields. Each value MUST NOT start with `VITE_`. */
  server?: Record<string, string>;
  /** One-line description shown in the AI system-prompt manifest. */
  runtimeHint?: string;
}

// ─── Enhanced Auth Types ────────────────────────────────

/**
 * A resource the user can select after OAuth (e.g., a Supabase project,
 * a Vercel team, a Stripe account).
 */
export interface EnhancedAuthResource {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  meta?: Record<string, unknown>;
}

/**
 * Configuration for an enhanced auth connector module.
 * When present on an IntegrationDefinition, the connect dialog offers
 * an "easy connect" button alongside the manual form.
 */
export interface EnhancedAuthConfig {
  /** Unique key matching the module filename, e.g. "supabase" */
  providerKey: string;
  /** Human-readable label for the button, e.g. "Sign in with Supabase" */
  connectLabel: string;
  /** OAuth integration ID for the management OAuth flow (e.g., "supabase-mgmt") */
  oauthIntegrationKey: string;
  /** OAuth2 config for the management/admin OAuth flow */
  oauth2Config: OAuth2Config;
  /** Whether the user must pick a resource (project/account) after OAuth */
  requiresResourceSelection: boolean;
  /** Label for the resource picker, e.g. "Select a project" */
  resourceLabel?: string;
  /**
   * Optional platform-managed provisioner (Phase 2A).
   * When `enabled`, the integration definition advertises support for the
   * "create a brand-new resource under the user's own account" flow — e.g.
   * Lovable-style one-click Supabase project creation. The OAuth grant must
   * include every entry in `requiredScopes` for the provisioner to succeed.
   */
  provisioner?: {
    enabled: boolean;
    requiredScopes: string[];
  };
}

// ─── Connection Types ────────────────────────────────────

export interface IntegrationConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  integration_id: string;
  scope: "workspace" | "project" | "user";
  project_id?: string;
  auth_type: AuthType;
  credentials_encrypted: Buffer;
  /** 'pgp_sym' (legacy ENCRYPTION_KEY) | 'envelope_v1' (per-workspace DEK). */
  credentials_format?: "pgp_sym" | "envelope_v1";
  display_name?: string;
  status: "active" | "error" | "expired" | "revoked";
  error_message?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface DecryptedConnection extends Omit<IntegrationConnection, "credentials_encrypted"> {
  credentials: unknown;
}

// ─── OAuth Types ─────────────────────────────────────────

export interface OAuthApp {
  id: string;
  workspace_id?: string;
  integration_id: string;
  client_id: string;
  client_secret_encrypted: Buffer;
  extra_config: Record<string, unknown>;
  is_global: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DecryptedOAuthApp extends Omit<OAuthApp, "client_secret_encrypted"> {
  clientSecret: string;
}

export interface OAuth2TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  claimed_at: number;
  token_url: string;
  client_id: string;
  client_secret: string;
  data: Record<string, unknown>;
}

// ─── Runner Types ────────────────────────────────────────

export interface RunActionParams {
  integrationId: string;
  actionName: string;
  props: Record<string, unknown>;
  userId: string;
  workspaceId: string;
  projectId?: string;
}

export interface RunActionResult {
  success: boolean;
  output: unknown;
  error?: string;
  /** HTTP calls made during piece execution (when tracing is active) */
  httpTraces?: Array<{
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    statusCode: number | null;
    durationMs: number;
    responseBody: string | null;
    error?: string;
  }>;
}

// ─── Store Types ─────────────────────────────────────────

export interface StoreEntry {
  scope_key: string;
  value: unknown;
  workspace_id: string;
  user_id: string;
  updated_at: Date;
}

// ─── Catalog API Types ───────────────────────────────────

export interface CatalogItem {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: IntegrationCategory;
  authType: AuthType;
  tier: "built_in" | "community";
  connected: boolean;
  actionCount: number;
}
