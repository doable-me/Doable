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
