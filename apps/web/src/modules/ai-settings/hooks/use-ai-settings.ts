"use client";

import { useState, useEffect, useCallback } from "react";
import {
  apiListCopilotAccounts,
  apiAddCopilotAccount,
  apiDeleteCopilotAccount,
  apiValidateCopilotAccount,
  apiListAiProviders,
  apiAddAiProvider,
  apiUpdateAiProvider,
  apiDeleteAiProvider,
  apiValidateAiProvider,
  apiGetAiDefaults,
  apiUpdateAiDefaults,
  apiListAiModels,
  apiGetUserAiPreferences,
  apiUpdateUserAiPreferences,
  apiListUserAllocations,
  apiUpdateUserAllocation,
  apiCopyMySettings,
  apiResetUserAllocation,
  type ApiGitHubCopilotAccount,
  type ApiAiProvider,
  type ApiWorkspaceAiDefaults,
  type ApiUserAiPreferences,
  type ApiEnforcementStatus,
  type ApiUserAiAllocation,
} from "@/lib/api";

export function useGitHubAccounts(workspaceId: string | null) {
  const [accounts, setAccounts] = useState<ApiGitHubCopilotAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiListCopilotAccounts(workspaceId);
      setAccounts(res.data);
    } catch (err) {
      console.error("Failed to load GitHub accounts:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Add a Copilot account.
   * @param scope - "user" (default) creates a personal account only the
   *   caller can see/use. "workspace" shares it across the workspace and
   *   requires owner/admin role.
   */
  const add = async (
    label: string,
    githubToken: string,
    scope: "user" | "workspace" = "user",
  ) => {
    if (!workspaceId) return;
    await apiAddCopilotAccount(workspaceId, { label, githubToken, scope });
    await refresh();
  };

  const remove = async (id: string) => {
    if (!workspaceId) return;
    await apiDeleteCopilotAccount(workspaceId, id);
    await refresh();
  };

  const validate = async (id: string) => {
    if (!workspaceId) return false;
    const res = await apiValidateCopilotAccount(workspaceId, id);
    await refresh();
    return res.data.valid;
  };

  return { accounts, loading, refresh, add, remove, validate };
}

export function useCustomProviders(workspaceId: string | null) {
  const [providers, setProviders] = useState<ApiAiProvider[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiListAiProviders(workspaceId);
      setProviders(res.data);
    } catch (err) {
      console.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
    /**
     * "user" (default) creates a personal provider only the caller can
     * see/use. "workspace" shares it across the workspace and requires
     * owner/admin role.
     */
    scope?: "user" | "workspace";
  }) => {
    if (!workspaceId) return;
    await apiAddAiProvider(workspaceId, { scope: "user", ...data });
    await refresh();
  };

  const remove = async (id: string) => {
    if (!workspaceId) return;
    await apiDeleteAiProvider(workspaceId, id);
    await refresh();
  };

  const validate = async (id: string) => {
    if (!workspaceId) return { valid: false };
    const res = await apiValidateAiProvider(workspaceId, id);
    await refresh();
    return res.data;
  };

  /**
   * Promote a personal provider to workspace-shared (admin-only). The API
   * clears owner_user_id to satisfy the scope/owner CHECK. Migration 072.
   */
  const promoteToWorkspace = async (id: string) => {
    if (!workspaceId) return;
    await apiUpdateAiProvider(workspaceId, id, { scope: "workspace" });
    await refresh();
  };

  return { providers, loading, refresh, add, remove, validate, promoteToWorkspace };
}

export function useWorkspaceAISettings(workspaceId: string | null) {
  const [defaults, setDefaults] = useState<ApiWorkspaceAiDefaults | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiGetAiDefaults(workspaceId);
      setDefaults(res.data);
    } catch (err) {
      console.error("Failed to load AI defaults:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = async (data: {
    defaultSource?: "copilot" | "custom";
    defaultCopilotAccountId?: string | null;
    defaultCopilotModel?: string | null;
    defaultProviderId?: string | null;
    defaultProviderModel?: string | null;
    suggestionSource?: "copilot" | "custom";
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
    enforceAi?: boolean;
    enforcedCopilotAccountId?: string | null;
    enforcedProviderId?: string | null;
    enforcedModel?: string | null;
    showModelSelector?: boolean;
  }) => {
    if (!workspaceId) return;
    const res = await apiUpdateAiDefaults(workspaceId, data);
    setDefaults(res.data);
  };

  return { defaults, loading, refresh, update };
}

export function useUserAiPreferences(workspaceId: string | undefined) {
  const [preferences, setPreferences] = useState<ApiUserAiPreferences | null>(null);
  const [enforcement, setEnforcement] = useState<ApiEnforcementStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiGetUserAiPreferences(workspaceId);
      setPreferences(res.data.preferences);
      setEnforcement(res.data.enforcement);
    } catch (err) {
      console.error("Failed to load user AI preferences:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
    suggestionSource?: "copilot" | "custom";
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
  }) => {
    if (!workspaceId) return;
    const res = await apiUpdateUserAiPreferences(workspaceId, data);
    setPreferences(res.data);
  }, [workspaceId]);

  return { preferences, enforcement, loading, update, refresh };
}

export function useAvailableModels(workspaceId: string | null) {
  const [data, setData] = useState<{
    copilotAccounts: { id: string; label: string; githubLogin: string; isValid: boolean }[];
    providers: { id: string; label: string; providerType: string; isValid: boolean }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiListAiModels(workspaceId);
      setData(res.data);
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}

export function useUserAllocations(workspaceId: string | null) {
  const [allocations, setAllocations] = useState<ApiUserAiAllocation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiListUserAllocations(workspaceId);
      setAllocations(res.data);
    } catch (err) {
      console.error("Failed to load user allocations:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateOne = async (targetUserId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
    suggestionSource?: "copilot" | "custom";
    suggestionCopilotAccountId?: string | null;
    suggestionCopilotModel?: string | null;
    suggestionProviderId?: string | null;
    suggestionProviderModel?: string | null;
  }) => {
    if (!workspaceId) return;
    await apiUpdateUserAllocation(workspaceId, targetUserId, data);
    await refresh();
  };

  const copyMySettings = async (targetUserIds: string[]) => {
    if (!workspaceId) return 0;
    const res = await apiCopyMySettings(workspaceId, targetUserIds);
    await refresh();
    return res.data.updated;
  };

  const resetOne = async (targetUserId: string) => {
    if (!workspaceId) return;
    await apiResetUserAllocation(workspaceId, targetUserId);
    await refresh();
  };

  return { allocations, loading, refresh, updateOne, copyMySettings, resetOne };
}
