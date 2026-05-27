import { apiFetch } from "./api-core";

// ─── AI Settings Types ────────────────────────────────────

/**
 * Whether an AI account/provider is shared with the whole workspace
 * (admin-managed) or owned privately by a single user. Migration 072.
 */
export type ApiAiAccountScope = "workspace" | "user";

export interface ApiGitHubCopilotAccount {
  id: string;
  workspace_id: string;
  label: string;
  github_login: string;
  github_id: string | null;
  is_valid: boolean;
  added_by: string;
  scope: ApiAiAccountScope;
  owner_user_id: string | null;
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
  scope: ApiAiAccountScope;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  /** Provider preset ID (e.g. "openai", "ollama") */
  preset_id?: string | null;
  /** Health status from last check */
  health_status?: "healthy" | "degraded" | "down" | "unknown" | null;
  /** Latency from last health check (ms) */
  health_latency_ms?: number | null;
  /** Timestamp of last health check */
  last_health_check?: string | null;
  /** Whether provider supports tool calling */
  supports_tools?: boolean | null;
  /** Whether provider supports vision */
  supports_vision?: boolean | null;
  /** Cached model list from discovery */
  models_cache?: Array<{
    id: string;
    name: string;
    supports_tools?: boolean;
    supports_vision?: boolean;
  }> | null;
  /** Display order */
  display_order?: number | null;
}

export type ApiAiSource = "copilot" | "custom";

export interface ApiWorkspaceAiDefaults {
  workspace_id: string;
  default_source: ApiAiSource;
  default_copilot_account_id: string | null;
  default_copilot_model: string | null;
  default_provider_id: string | null;
  default_provider_model: string | null;
  /** @deprecated kept for back-compat; use default_copilot_model / default_provider_model */
  default_model: string | null;
  suggestion_source: ApiAiSource;
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
}

export interface ApiUserAiPreferences {
  workspace_id: string;
  user_id: string;
  source: ApiAiSource;
  copilot_account_id: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_model: string | null;
  /** @deprecated kept for back-compat; use copilot_model / provider_model */
  model: string | null;
  suggestion_source: ApiAiSource;
  suggestion_copilot_account_id: string | null;
  suggestion_copilot_model: string | null;
  suggestion_provider_id: string | null;
  suggestion_provider_model: string | null;
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
  default_source: ApiAiSource;
  default_copilot_account_id: string | null;
  default_copilot_model: string | null;
  default_provider_id: string | null;
  default_provider_model: string | null;
  suggestion_source: ApiAiSource;
  suggestion_copilot_account_id: string | null;
  suggestion_copilot_model: string | null;
  suggestion_provider_id: string | null;
  suggestion_provider_model: string | null;
  user_source: ApiAiSource | null;
  user_copilot_account_id: string | null;
  user_copilot_model: string | null;
  user_provider_id: string | null;
  user_provider_model: string | null;
  user_suggestion_source: ApiAiSource | null;
  user_suggestion_copilot_account_id: string | null;
  user_suggestion_copilot_model: string | null;
  user_suggestion_provider_id: string | null;
  user_suggestion_provider_model: string | null;
}

export interface ApiUserAiAllocation {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  source: ApiAiSource | null;
  copilot_account_id: string | null;
  copilot_account_label: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_label: string | null;
  provider_type: string | null;
  provider_model: string | null;
  /** @deprecated use copilot_model / provider_model */
  model: string | null;
  preference_updated_at: string | null;
}

// ─── AI Settings API Methods ────────────────────────────────

export async function apiListCopilotAccounts(workspaceId: string): Promise<{ data: ApiGitHubCopilotAccount[] }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts`);
}

export async function apiAddCopilotAccount(
  workspaceId: string,
  data: { label: string; githubToken: string; scope?: ApiAiAccountScope }
): Promise<{ data: ApiGitHubCopilotAccount }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiUpdateCopilotAccount(
  workspaceId: string,
  id: string,
  data: { label?: string; githubToken?: string }
): Promise<{ data: ApiGitHubCopilotAccount }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/copilot-accounts/${id}`, {
    method: "PATCH",
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

export async function apiListAiProviders(
  workspaceId: string,
  projectId?: string
): Promise<{ data: ApiAiProvider[] }> {
  // When called from a project context (editor), pass ?projectId so a project
  // collaborator (not a workspace member) is authorized via project access.
  // Workspace members work either way — projectId is optional/ignored for them.
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/providers${query}`);
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
    scope?: ApiAiAccountScope;
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
  data: { label?: string; baseUrl?: string; apiKey?: string; scope?: ApiAiAccountScope }
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
    defaultSource?: ApiAiSource;
    defaultCopilotAccountId?: string | null;
    defaultCopilotModel?: string | null;
    defaultProviderId?: string | null;
    defaultProviderModel?: string | null;
    suggestionSource?: ApiAiSource;
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
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
    source?: ApiAiSource;
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
    suggestionSource?: ApiAiSource;
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
  }
) {
  return apiFetch<{ data: ApiUserAiPreferences }>(
    `/workspaces/${workspaceId}/ai-settings/user-preferences`,
    { method: "PUT", body: JSON.stringify(data) }
  );
}

export async function apiListUserAllocations(workspaceId: string): Promise<{ data: ApiUserAiAllocation[] }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/user-allocations`);
}

export async function apiUpdateUserAllocation(
  workspaceId: string,
  targetUserId: string,
  data: {
    source?: ApiAiSource;
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
    suggestionSource?: ApiAiSource;
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
  }
): Promise<{ data: ApiUserAiPreferences }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/user-allocations/${targetUserId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function apiCopyMySettings(
  workspaceId: string,
  targetUserIds: string[]
): Promise<{ data: { updated: number } }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/user-allocations/copy-my-settings`, {
    method: "POST",
    body: JSON.stringify({ targetUserIds }),
  });
}

export async function apiResetUserAllocation(
  workspaceId: string,
  targetUserId: string
): Promise<{ data: { userId: string; reset: true } }> {
  return apiFetch(`/workspaces/${workspaceId}/ai-settings/user-allocations/${targetUserId}`, {
    method: "DELETE",
  });
}

export async function apiGetEffectiveAiConfig(
  workspaceId: string,
  projectId?: string
): Promise<{ data: ApiEffectiveAiConfig }> {
  // When called from a project context (editor), pass ?projectId so a project
  // collaborator (not a workspace member) is authorized via project access.
  // Workspace members work either way — projectId is optional/ignored for them.
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return apiFetch<{ data: ApiEffectiveAiConfig }>(
    `/workspaces/${workspaceId}/ai-settings/effective${query}`
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
