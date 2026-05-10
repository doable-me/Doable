import type { AiProviderType } from "@doable/shared";

/**
 * Whether an AI account/provider is shared with the whole workspace
 * (managed by admins, visible to every member) or owned privately by a
 * single user (visible/usable only by that user). Migration 072.
 */
export type AiAccountScope = "workspace" | "user";

export interface GitHubCopilotAccountRow {
  id: string;
  workspace_id: string;
  label: string;
  github_login: string;
  github_id: string | null;
  encrypted_token: string;
  is_valid: boolean;
  added_by: string;
  scope: AiAccountScope;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiProviderRow {
  id: string;
  workspace_id: string;
  label: string;
  provider_type: AiProviderType;
  base_url: string;
  encrypted_api_key: string | null;
  encrypted_bearer_token: string | null;
  azure_api_version: string | null;
  wire_api: "completions" | "responses" | null;
  preset_id: string | null;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_mcp: boolean;
  last_health_check: string | null;  // timestamptz comes as string
  health_status: "healthy" | "degraded" | "down" | "unknown";
  health_latency_ms: number | null;
  display_order: number;
  models_cache: unknown | null;  // JSONB
  default_timeout_ms: number | null;
  is_valid: boolean;
  added_by: string;
  scope: AiAccountScope;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export type AiSource = "copilot" | "custom";

export interface WorkspaceAiSettingsRow {
  workspace_id: string;
  default_source: AiSource;
  default_copilot_account_id: string | null;
  default_copilot_model: string | null;
  default_provider_id: string | null;
  default_provider_model: string | null;
  /** @deprecated kept for back-compat; use default_copilot_model / default_provider_model */
  default_model: string | null;
  suggestion_source: AiSource;
  suggestion_copilot_account_id: string | null;
  suggestion_copilot_model: string | null;
  suggestion_provider_id: string | null;
  suggestion_provider_model: string | null;
  /** @deprecated kept for back-compat; use suggestion_copilot_model / suggestion_provider_model */
  suggestion_model: string | null;
  enforce_ai: boolean;
  enforced_copilot_account_id: string | null;
  enforced_provider_id: string | null;
  enforced_model: string | null;
  show_model_selector: boolean;
  /**
   * Workspace-wide default framework_id used when project create omits
   * frameworkId AND prompt detection returned null. NULL → fall back to
   * vite-react. Migration 065.
   */
  default_framework_id: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserAiPreferencesRow {
  workspace_id: string;
  user_id: string;
  source: AiSource;
  copilot_account_id: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_model: string | null;
  /** @deprecated kept for back-compat; use copilot_model / provider_model */
  model: string | null;
  suggestion_source: AiSource;
  suggestion_copilot_account_id: string | null;
  suggestion_copilot_model: string | null;
  suggestion_provider_id: string | null;
  suggestion_provider_model: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeploymentRow {
  id: string;
  project_id: string;
  environment: string;
  status: string;
  url: string | null;
  build_log: string | null;
  error_message: string | null;
  version_number: number | null;
  adapter: string;
  deployed_by: string;
  build_time_ms: number | null;
  deploy_time_ms: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeploymentArtifactRow {
  id: string;
  deployment_id: string;
  file_path: string;
  file_size: number;
  content_hash: string | null;
  created_at: Date;
}

export type CustomDomainStatus =
  | "pending"
  | "verifying"
  | "ssl_pending"
  | "active"
  | "failed"
  | "removing";

export interface CustomDomainRow {
  id: string;
  project_id: string;
  domain: string;
  status: CustomDomainStatus;
  cloudflare_hostname_id: string | null;
  ssl_status: string | null;
  verification_txt_name: string | null;
  verification_txt_value: string | null;
  cname_target: string;
  verification_errors: string | null;
  last_checked_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface FeatureFlagRow {
  feature_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  min_plan: string | null;
  min_role: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserFeatureOverrideRow {
  user_id: string;
  feature_key: string;
  enabled: boolean;
}

export interface GitHubUserTokenRow {
  user_id: string;
  github_username: string;
  github_id: string | null;
  access_token: string;
  scopes: string;
  connected_at: Date;
  updated_at: Date;
}

export interface SecurityScanRow {
  id: string;
  project_id: string;
  scan_type: string;
  status: string;
  findings_count: number;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface SecurityFindingRow {
  id: string;
  scan_id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string | null;
  file_path: string | null;
  line_number: number | null;
  code_snippet: string | null;
  fix_suggestion: string | null;
  dismissed: boolean;
  dismissed_by: string | null;
  created_at: Date;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface EffectiveAiConfigRow {
  enforce_ai: boolean;
  enforced_copilot_account_id: string | null;
  enforced_provider_id: string | null;
  enforced_model: string | null;
  show_model_selector: boolean;
  // Workspace defaults
  default_source: AiSource;
  default_copilot_account_id: string | null;
  default_copilot_model: string | null;
  default_provider_id: string | null;
  default_provider_model: string | null;
  // Workspace suggestion defaults
  suggestion_source: AiSource;
  suggestion_copilot_account_id: string | null;
  suggestion_copilot_model: string | null;
  suggestion_provider_id: string | null;
  suggestion_provider_model: string | null;
  // Per-user override
  user_source: AiSource | null;
  user_copilot_account_id: string | null;
  user_copilot_model: string | null;
  user_provider_id: string | null;
  user_provider_model: string | null;
  // Per-user suggestion override
  user_suggestion_source: AiSource | null;
  user_suggestion_copilot_account_id: string | null;
  user_suggestion_copilot_model: string | null;
  user_suggestion_provider_id: string | null;
  user_suggestion_provider_model: string | null;
}

export interface PublicProjectRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  remix_count: number;
  view_count: number;
  featured: boolean;
  published_at: Date;
  shared_by?: string | null;
  featured_at?: Date | null;
  updated_at?: Date | null;
}

export interface ProjectRemixRow {
  id: string;
  source_project_id: string;
  forked_project_id: string;
  forked_by: string;
  created_at: Date;
}

export interface ShareLinkVisitRow {
  id: string;
  project_id: string;
  visitor_user_id: string;
  visit_count: number;
  first_visited_at: Date;
  last_visited_at: Date;
}
