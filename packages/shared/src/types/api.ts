import type {
  User,
  Workspace,
  WorkspaceMember,
  Project,
  ProjectVersion,
  AiSession,
  AiMessage,
  Template,
  Credits,
  AiSessionMode,
} from "./index";

// ─── Generic Response Wrappers ──────────────────────────────
export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ─── Auth ───────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: Omit<User, "githubId" | "googleId">;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ─── Workspaces ─────────────────────────────────────────────
export interface CreateWorkspaceRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  avatarUrl?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: WorkspaceMember["role"];
}

// ─── Projects ───────────────────────────────────────────────
export interface CreateProjectRequest {
  name: string;
  slug: string;
  description?: string;
  templateId?: string;
  folderId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: Project["status"];
  visibility?: Project["visibility"];
  folderId?: string | null;
}

// ─── AI ─────────────────────────────────────────────────────
export interface CreateAiSessionRequest {
  projectId: string;
  mode: AiSessionMode;
}

export interface SendMessageRequest {
  content: string;
}

export interface AiStreamEvent {
  type: "text_delta" | "tool_use" | "tool_result" | "done" | "error";
  data: string | Record<string, unknown>;
}

// ─── Templates ──────────────────────────────────────────────
export interface ListTemplatesQuery {
  category?: string;
  page?: number;
  pageSize?: number;
}

// ─── Credits ────────────────────────────────────────────────
export type CreditsResponse = ApiResponse<Credits>;

// ─── Versions ──────────────────────────────────────────────
export interface CreateVersionRequest {
  description?: string;
  createdBy: string;
  projectPath: string;
}

export interface RestoreVersionRequest {
  restoredBy: string;
  projectPath: string;
}

export interface BookmarkVersionRequest {
  bookmarked: boolean;
}

// ─── GitHub ────────────────────────────────────────────────
export interface ConnectGitHubRequest {
  token: string;
  repoOwner: string;
  repoName: string;
  branch?: string;
  userId: string;
  projectPath: string;
  createNew?: boolean;
  isPrivate?: boolean;
  description?: string;
}

export interface PushToGitHubRequest {
  message: string;
  userId: string;
  projectPath: string;
}

export interface PullFromGitHubRequest {
  userId: string;
  projectPath: string;
}

export interface GitHubSyncStatusResponse {
  connected: boolean;
  status: string;
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
}

export interface GitHubRepoResponse {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
}

// ─── Re-exports for convenience ─────────────────────────────
export type {
  User,
  Workspace,
  WorkspaceMember,
  Project,
  ProjectVersion,
  AiSession,
  AiMessage,
  Template,
  Credits,
};
