import type {
  WorkspacePlan,
  WorkspaceRole,
  ProjectStatus,
  ProjectVisibility,
  AiSessionMode,
  AiMessageRole,
  ApiKeyEnvironment,
  ConnectorType,
  ConnectorStatus,
  AiProviderType,
} from "@doable/shared";

// ─── Database Row Types ─────────────────────────────────────
// These mirror the exact column types from PostgreSQL.

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_url: string | null;
  github_id: string | null;
  google_id: string | null;
  is_platform_admin: boolean;
  platform_role: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  plan: WorkspacePlan;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  joined_at: Date;
}

export interface WorkspaceMemberWithUserRow extends WorkspaceMemberRow {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface WorkspaceInviteRow {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
}

export interface ProjectCollaboratorRow {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  added_at: Date;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  github_repo_url: string | null;
  published_url: string | null;
  subdomain: string | null;
  thumbnail_url: string | null;
  template_id: string | null;
  folder_id: string | null;
  deleted_at: Date | null;
  git_initialized: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectVersionRow {
  id: string;
  project_id: string;
  version_number: number;
  description: string | null;
  snapshot_data: Record<string, unknown> | null;
  commit_sha: string | null;
  bookmarked: boolean;
  created_by: string;
  created_at: Date;
}

export interface AiSessionRow {
  id: string;
  project_id: string;
  user_id: string;
  mode: AiSessionMode;
  copilot_session_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiMessageRow {
  id: string;
  session_id: string;
  role: AiMessageRole;
  content: string | null;
  tool_calls: Record<string, unknown>[] | null;
  suggestions: string[] | null;
  tool_actions: Record<string, unknown>[] | null;
  created_at: Date;
}

/** Computed workspace-level credit summary (aggregated from credit_balances) */
export interface CreditsRow {
  id: string;
  workspace_id: string;
  daily_remaining: number;
  daily_total: number;
  monthly_remaining: number;
  rollover_credits: number;
  last_daily_reset: Date | null;
  last_monthly_reset: Date | null;
}

export interface ApiKeyRow {
  id: string;
  project_id: string;
  name: string;
  encrypted_value: string;
  environment: ApiKeyEnvironment;
  created_at: Date;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  code_files: Record<string, unknown> | null;
  doable_context: Record<string, unknown> | null;
  preview_image_url: string | null;
  is_official: boolean;
  usage_count: number;
  created_by: string | null;
  created_at: Date;
}

export interface ConnectorRow {
  id: string;
  workspace_id: string;
  type: ConnectorType;
  provider: string;
  config: Record<string, unknown> | null;
  status: ConnectorStatus;
  created_by: string;
  created_at: Date;
}

export interface FolderRow {
  id: string;
  workspace_id: string;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: Date;
}

export interface ProjectStarRow {
  user_id: string;
  project_id: string;
  created_at: Date;
}

export interface GitHubConnectionRow {
  id: string;
  project_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  access_token: string;
  webhook_secret: string | null;
  last_synced_at: Date | null;
  sync_status: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface GitHubCommitRow {
  id: string;
  connection_id: string;
  sha: string;
  message: string;
  author: string;
  branch: string;
  direction: "push" | "pull";
  version_id: string | null;
  created_at: Date;
}

export interface GitHubCopilotAccountRow {
  id: string;
  workspace_id: string;
  label: string;
  github_login: string;
  github_id: string | null;
  encrypted_token: string;
  is_valid: boolean;
  added_by: string;
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
