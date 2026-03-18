import type {
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  ApiErrorResponse,
  User,
} from "@doable/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Token Storage ─────────────────────────────────────────

const TOKEN_KEY = "doable_access_token";
const REFRESH_KEY = "doable_refresh_token";

export function getStoredTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  };
}

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── API Error ─────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorResponse
  ) {
    super(body.error);
    this.name = "ApiError";
  }
}

// ─── Core Fetch Wrapper ────────────────────────────────────

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken } satisfies RefreshTokenRequest),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = (await res.json()) as AuthResponse;
    storeTokens(data.tokens);
    return data.tokens;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = getStoredTokens();

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // If 401, try to refresh and retry once
  if (res.status === 401 && accessToken) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => {
        refreshPromise = null;
      });
    }

    const newTokens = await refreshPromise;
    if (newTokens) {
      headers.set("Authorization", `Bearer ${newTokens.accessToken}`);
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: "Request failed",
    }))) as ApiErrorResponse;
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// ─── Auth API Methods ──────────────────────────────────────

export async function apiLogin(
  data: LoginRequest
): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  storeTokens(res.tokens);
  return res;
}

export async function apiRegister(
  data: RegisterRequest
): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  storeTokens(res.tokens);
  return res;
}

export async function apiLogout(): Promise<void> {
  const { refreshToken } = getStoredTokens();
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    clearTokens();
  }
}

export async function apiGetMe(): Promise<{
  user: Omit<User, "githubId" | "googleId">;
}> {
  return apiFetch("/auth/me");
}

export async function apiForgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(data: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  return apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getGitHubLoginUrl(): string {
  return `${API_URL}/auth/github`;
}

export function getGoogleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}

// ─── Project Types (frontend) ─────────────────────────────

export interface ApiProject {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  visibility: string;
  github_repo_url: string | null;
  published_url: string | null;
  thumbnail_url: string | null;
  template_id: string | null;
  folder_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  starred: boolean;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  plan: string;
  created_at: string;
  updated_at: string;
  memberCount: number;
  credits: {
    dailyRemaining: number;
    monthlyRemaining: number;
    rolloverCredits: number;
  } | null;
}

// ─── Project API Methods ──────────────────────────────────

export async function apiListProjects(opts?: {
  workspaceId?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: ApiProject[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
  const params = new URLSearchParams();
  if (opts?.workspaceId) params.set("workspaceId", opts.workspaceId);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch(`/projects${qs ? `?${qs}` : ""}`);
}

export async function apiCreateProject(data: {
  name: string;
  description?: string;
  workspaceId?: string;
  prompt?: string;
  templateId?: string;
}): Promise<{ data: ApiProject }> {
  return apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiGetProject(id: string): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}`);
}

export async function apiUpdateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
    visibility?: string;
    folderId?: string | null;
  }
): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDeleteProject(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  return apiFetch(`/projects/${id}`, {
    method: "DELETE",
  });
}

export async function apiDuplicateProject(id: string): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}/duplicate`, {
    method: "POST",
  });
}

export async function apiToggleStarProject(id: string): Promise<{ data: { projectId: string; starred: boolean } }> {
  return apiFetch(`/projects/${id}/star`, {
    method: "POST",
  });
}

export async function apiListStarredProjects(): Promise<{ data: ApiProject[] }> {
  return apiFetch("/projects/starred");
}

// ─── Workspace API Methods ────────────────────────────────

export async function apiListWorkspaces(): Promise<{ data: ApiWorkspace[] }> {
  return apiFetch("/workspaces");
}

export async function apiGetWorkspace(id: string): Promise<{ data: ApiWorkspace }> {
  return apiFetch(`/workspaces/${id}`);
}

// ─── Template API Methods ─────────────────────────────────

export interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  previewImageUrl: string | null;
  isOfficial: boolean;
  fileCount: number;
}

export async function apiListTemplates(category?: string): Promise<{ data: { templates: ApiTemplate[]; categories: string[] } }> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch(`/templates${qs}`);
}

// ─── AI Settings API Methods ────────────────────────────────

export interface ApiGitHubCopilotAccount {
  id: string;
  workspace_id: string;
  label: string;
  github_login: string;
  github_id: string | null;
  is_valid: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface ApiAiProvider {
  id: string;
  workspace_id: string;
  label: string;
  provider_type: "openai" | "azure" | "anthropic";
  base_url: string;
  azure_api_version: string | null;
  is_valid: boolean;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface ApiWorkspaceAiDefaults {
  workspace_id: string;
  default_copilot_account_id: string | null;
  default_provider_id: string | null;
  default_model: string | null;
  suggestion_copilot_account_id: string | null;
  suggestion_provider_id: string | null;
  suggestion_model: string | null;
  enforce_ai: boolean;
  enforced_copilot_account_id: string | null;
  enforced_provider_id: string | null;
  enforced_model: string | null;
  show_model_selector: boolean;
  updated_by: string | null;
}

export interface ApiUserAiPreferences {
  workspace_id: string;
  user_id: string;
  copilot_account_id: string | null;
  provider_id: string | null;
  model: string | null;
  updated_at: string;
}

export interface ApiEnforcementStatus {
  enforce_ai: boolean;
  enforced_copilot_account_id: string | null;
  enforced_provider_id: string | null;
  enforced_model: string | null;
}

export interface ApiEffectiveAiConfig {
  enforce_ai: boolean;
  enforced_copilot_account_id: string | null;
  enforced_provider_id: string | null;
  enforced_model: string | null;
  show_model_selector: boolean;
  default_copilot_account_id: string | null;
  default_provider_id: string | null;
  default_model: string | null;
  user_copilot_account_id: string | null;
  user_provider_id: string | null;
  user_model: string | null;
}

export async function apiListCopilotAccounts(workspaceId: string): Promise<{ data: ApiGitHubCopilotAccount[] }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts`);
}

export async function apiAddCopilotAccount(
  workspaceId: string,
  data: { label: string; githubToken: string }
): Promise<{ data: ApiGitHubCopilotAccount }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiDeleteCopilotAccount(workspaceId: string, id: string): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts/${id}`, {
    method: "DELETE",
  });
}

export async function apiValidateCopilotAccount(
  workspaceId: string,
  id: string
): Promise<{ data: { valid: boolean } }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts/${id}/validate`, {
    method: "POST",
  });
}

export async function apiListAiProviders(workspaceId: string): Promise<{ data: ApiAiProvider[] }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/providers`);
}

export async function apiAddAiProvider(
  workspaceId: string,
  data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
  }
): Promise<{ data: ApiAiProvider }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/providers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiUpdateAiProvider(
  workspaceId: string,
  id: string,
  data: { label?: string; baseUrl?: string; apiKey?: string }
): Promise<{ data: ApiAiProvider }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDeleteAiProvider(workspaceId: string, id: string): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}/ai-settings/providers/${id}`, {
    method: "DELETE",
  });
}

export async function apiValidateAiProvider(
  workspaceId: string,
  id: string
): Promise<{ data: { valid: boolean; error?: string } }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/providers/${id}/validate`, {
    method: "POST",
  });
}

export async function apiGetAiDefaults(workspaceId: string): Promise<{ data: ApiWorkspaceAiDefaults }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/defaults`);
}

export async function apiUpdateAiDefaults(
  workspaceId: string,
  data: {
    defaultCopilotAccountId?: string | null;
    defaultProviderId?: string | null;
    defaultModel?: string | null;
    suggestionCopilotAccountId?: string | null;
    suggestionProviderId?: string | null;
    suggestionModel?: string | null;
    enforceAi?: boolean;
    enforcedCopilotAccountId?: string | null;
    enforcedProviderId?: string | null;
    enforcedModel?: string | null;
    showModelSelector?: boolean;
  }
): Promise<{ data: ApiWorkspaceAiDefaults }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/defaults`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function apiGetUserAiPreferences(workspaceId: string) {
  return apiFetch<{ data: { preferences: ApiUserAiPreferences | null; enforcement: ApiEnforcementStatus } }>(
    `/workspaces/${workspaceId}/ai-settings/user-preferences`
  );
}

export async function apiUpdateUserAiPreferences(
  workspaceId: string,
  data: {
    copilotAccountId?: string | null;
    providerId?: string | null;
    model?: string | null;
  }
) {
  return apiFetch<{ data: ApiUserAiPreferences }>(
    `/workspaces/${workspaceId}/ai-settings/user-preferences`,
    { method: "PUT", body: JSON.stringify(data) }
  );
}

export async function apiGetEffectiveAiConfig(workspaceId: string): Promise<{ data: ApiEffectiveAiConfig }> {
  return apiFetch<{ data: ApiEffectiveAiConfig }>(
    `/workspaces/${workspaceId}/ai-settings/effective`
  );
}

export async function apiListAiModels(workspaceId: string): Promise<{
  data: {
    copilotAccounts: { id: string; label: string; githubLogin: string; isValid: boolean }[];
    providers: { id: string; label: string; providerType: string; isValid: boolean }[];
  };
}> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/models`);
}
