// ─── Plans & Roles (single source of truth) ─────────────────
// To add a new plan or role:
//   1. Add the value to the array below
//   2. Add a row to PLAN_META / ROLE_META in constants.ts
//   3. Run a Postgres migration: ALTER TYPE workspace_plan ADD VALUE 'new_plan';
//   Everything else (types, labels, dropdowns, Zod schemas, hierarchies) derives automatically.

/** Plans ordered from lowest → highest tier */
export const WORKSPACE_PLANS = ["free", "pro", "business", "enterprise"] as const;
export type WorkspacePlan = (typeof WORKSPACE_PLANS)[number];

/** Roles ordered from lowest → highest privilege */
export const WORKSPACE_ROLES = ["viewer", "member", "admin", "owner"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Roles that grant platform admin access */
export const PLATFORM_ADMIN_ROLES: readonly WorkspaceRole[] = ["admin", "owner"] as const;

export type ProjectStatus = "creating" | "draft" | "published" | "error";
export type ProjectVisibility = "public" | "private";
export type AiSessionMode = "agent" | "plan" | "chat";
export type AiMessageRole = "user" | "assistant" | "system" | "tool";
export type ApiKeyEnvironment = "test" | "live";
export type ConnectorType = "shared" | "personal" | "custom";
export type ConnectorStatus = "active" | "inactive" | "error";
export type AiProviderType = "openai" | "azure" | "anthropic";

// ─── Core Entities ──────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  githubId: string | null;
  googleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  plan: WorkspacePlan;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy: string | null;
  joinedAt: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface ProjectCollaborator {
  id: string;
  projectId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  addedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  githubRepoUrl: string | null;
  publishedUrl: string | null;
  thumbnailUrl: string | null;
  templateId: string | null;
  folderId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  description: string | null;
  snapshotData: Record<string, unknown> | null;
  bookmarked: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AiSession {
  id: string;
  projectId: string;
  userId: string;
  mode: AiSessionMode;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  sessionId: string;
  role: AiMessageRole;
  content: string | null;
  toolCalls: Record<string, unknown>[] | null;
  createdAt: string;
}

export interface Credits {
  id: string;
  workspaceId: string;
  dailyRemaining: number;
  monthlyRemaining: number;
  rolloverCredits: number;
  lastDailyReset: string | null;
  lastMonthlyReset: string | null;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  codeFiles: Record<string, unknown> | null;
  doableContext: Record<string, unknown> | null;
  previewImageUrl: string | null;
  isOfficial: boolean;
  usageCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface Connector {
  id: string;
  workspaceId: string;
  type: ConnectorType;
  provider: string;
  config: Record<string, unknown> | null;
  status: ConnectorStatus;
  createdBy: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  parentId: string | null;
  position: number;
  createdAt: string;
}

export interface ProjectStar {
  userId: string;
  projectId: string;
  createdAt: string;
}

// ─── Version Control ───────────────────────────────────────
export type FileChangeType = "added" | "modified" | "deleted";

export interface FileChange {
  path: string;
  type: FileChangeType;
  oldContent?: string;
  newContent?: string;
  oldSize?: number;
  newSize?: number;
}

export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
  totalChanges: number;
}

// ─── GitHub ─────────────────────────────────────────────────
export type GitHubSyncStatus = "synced" | "ahead" | "behind" | "diverged" | "disconnected";

export interface GitHubConnection {
  id: string;
  projectId: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  lastSyncedAt: string | null;
  syncStatus: GitHubSyncStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubCommit {
  id: string;
  connectionId: string;
  sha: string;
  message: string;
  author: string;
  branch: string;
  direction: "push" | "pull";
  versionId: string | null;
  createdAt: string;
}

// ─── Feature Flags ────────────────────────────────────────
export interface FeatureFlag {
  featureKey: string;
  label: string;
  description: string | null;
  enabled: boolean;
  minPlan: WorkspacePlan | null;
  minRole: WorkspaceRole | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserFeatureOverride {
  userId: string;
  featureKey: string;
  enabled: boolean;
}

// ─── AI Settings ──────────────────────────────────────────
export interface GitHubCopilotAccount {
  id: string;
  workspaceId: string;
  label: string;
  githubLogin: string;
  githubId: string | null;
  isValid: boolean;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiProvider {
  id: string;
  workspaceId: string;
  label: string;
  providerType: AiProviderType;
  baseUrl: string;
  azureApiVersion: string | null;
  isValid: boolean;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceAiSettings {
  workspaceId: string;
  defaultCopilotAccountId: string | null;
  defaultProviderId: string | null;
  defaultModel: string | null;
  suggestionCopilotAccountId: string | null;
  suggestionProviderId: string | null;
  suggestionModel: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
