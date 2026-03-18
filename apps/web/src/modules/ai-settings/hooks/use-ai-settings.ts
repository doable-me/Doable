"use client";

import { useState, useEffect, useCallback } from "react";
import {
  apiListCopilotAccounts,
  apiAddCopilotAccount,
  apiDeleteCopilotAccount,
  apiValidateCopilotAccount,
  apiListAiProviders,
  apiAddAiProvider,
  apiDeleteAiProvider,
  apiValidateAiProvider,
  apiGetAiDefaults,
  apiUpdateAiDefaults,
  apiListAiModels,
  apiGetUserAiPreferences,
  apiUpdateUserAiPreferences,
  type ApiGitHubCopilotAccount,
  type ApiAiProvider,
  type ApiWorkspaceAiDefaults,
  type ApiUserAiPreferences,
  type ApiEnforcementStatus,
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

  const add = async (label: string, githubToken: string) => {
    if (!workspaceId) return;
    await apiAddCopilotAccount(workspaceId, { label, githubToken });
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
  }) => {
    if (!workspaceId) return;
    await apiAddAiProvider(workspaceId, data);
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

  return { providers, loading, refresh, add, remove, validate };
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
    copilotAccountId?: string | null;
    providerId?: string | null;
    model?: string | null;
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
