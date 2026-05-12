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
  approval_status: "approved" | "pending" | "rejected";
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
  max_projects_override: number | null;
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
