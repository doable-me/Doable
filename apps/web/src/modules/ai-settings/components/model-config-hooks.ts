"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { PROVIDER_BY_ID } from "@doable/shared";

// ─── Constants ──────────────────────────────────────────────

export type WorkspaceDefaultsUpdateData = {
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
};

export type UserPreferencesUpdateData = {
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
};

export const FALLBACK_MODELS = [
  { id: "", label: "Auto (recommended)" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "o4-mini", label: "o4-mini" },
  { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
];

export const CUSTOM_MODEL_SENTINEL = "__type_custom_id__";

// ─── Types ──────────────────────────────────────────────────

export type Source = "copilot" | "custom";

export interface ModelSectionState {
  source: Source;
  copilotAccountId: string;
  copilotModel: string;
  providerId: string;
  providerModel: string;
}

export const EMPTY_MODEL_STATE: ModelSectionState = {
  source: "copilot",
  copilotAccountId: "",
  copilotModel: "",
  providerId: "",
  providerModel: "",
};

export interface ProviderModelInfo {
  id: string;
  name: string | null;
  contextWindow: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetches Copilot models dynamically. Exported for reuse (e.g. access-control-tab). */
// Module-level cache + in-flight dedup. The AI Settings page renders
// `useCopilotModels` 4 times (primary/suggestion × workspace/user) and
// strict-mode double-mount can fire each twice. Without dedup that's 8
// parallel /ai/models calls per visit, each ~1.8s. With dedup all callers
// share a single fetch, and subsequent visits within MODELS_TTL_MS are
// served instantly from cache.
const MODELS_TTL_MS = 5 * 60_000;
const _modelsCache = new Map<string, { data: { id: string; label: string }[]; expires: number }>();
const _modelsInflight = new Map<string, Promise<{ id: string; label: string }[]>>();

async function fetchCopilotModels(copilotAccountId?: string): Promise<{ id: string; label: string }[]> {
  const key = copilotAccountId ?? "__default__";
  const cached = _modelsCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  let pending = _modelsInflight.get(key);
  if (!pending) {
    pending = (async () => {
      const qs = copilotAccountId ? `?copilotAccountId=${copilotAccountId}` : "";
      const json = await apiFetch<{ data: { id: string; name: string }[] }>(`/ai/models${qs}`);
      const fetched = json.data ?? [];
      const models = fetched.length > 0
        ? [
            { id: "", label: "Auto (recommended)" },
            ...fetched.map((m) => ({ id: m.id, label: m.name })),
          ]
        : FALLBACK_MODELS;
      _modelsCache.set(key, { data: models, expires: Date.now() + MODELS_TTL_MS });
      return models;
    })().finally(() => {
      _modelsInflight.delete(key);
    });
    _modelsInflight.set(key, pending);
  }
  return pending;
}

export function useCopilotModels(copilotAccountId?: string) {
  const [models, setModels] = useState<{ id: string; label: string }[]>(() => {
    const cached = _modelsCache.get(copilotAccountId ?? "__default__");
    return cached && cached.expires > Date.now() ? cached.data : FALLBACK_MODELS;
  });
  const [loadingModels, setLoadingModels] = useState(() => {
    const cached = _modelsCache.get(copilotAccountId ?? "__default__");
    return !(cached && cached.expires > Date.now());
  });

  useEffect(() => {
    let cancelled = false;
    const cached = _modelsCache.get(copilotAccountId ?? "__default__");
    if (cached && cached.expires > Date.now()) {
      setModels(cached.data);
      setLoadingModels(false);
      return;
    }
    setLoadingModels(true);
    fetchCopilotModels(copilotAccountId)
      .then((m) => { if (!cancelled) setModels(m); })
      .catch(() => { if (!cancelled) setModels(FALLBACK_MODELS); })
      .finally(() => { if (!cancelled) setLoadingModels(false); });
    return () => { cancelled = true; };
  }, [copilotAccountId]);

  return { models, loadingModels };
}

/** Maps a catalog preset's defaultModels to ProviderModelInfo rows. */
function catalogFallbackModels(presetId: string | null | undefined): ProviderModelInfo[] {
  if (!presetId) return [];
  const preset = PROVIDER_BY_ID[presetId as keyof typeof PROVIDER_BY_ID];
  if (!preset || preset.defaultModels.length === 0) return [];
  return preset.defaultModels.map((m) => ({
    id: m.id,
    name: m.name ?? null,
    contextWindow: m.contextWindow ?? null,
    supportsTools: m.supportsTools ?? true,
    supportsVision: m.supportsVision ?? false,
  }));
}

/**
 * Fetches discovered models for a custom provider from the provider-bridge cache.
 *
 * `presetId` (when known) provides a catalog fallback so providers added
 * before catalog-seeding existed — or whose SDK exposes no /models discovery
 * (e.g. DeepSeek) — still populate the dropdown.
 */
export function useProviderModels(
  workspaceId: string | null,
  providerId: string,
  presetId?: string | null,
) {
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!workspaceId || !providerId) {
      setModels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch<{
          data: { models: ProviderModelInfo[]; cachedAt: string | null };
        }>(`/workspaces/${workspaceId}/ai-settings/providers/${providerId}/models`);
        const cached = res.data?.models ?? [];

        if (cached.length > 0) {
          if (!cancelled) setModels(cached);
        } else {
          try {
            const disc = await apiFetch<{ data: ProviderModelInfo[] }>(
              `/workspaces/${workspaceId}/ai-settings/providers/${providerId}/discover-models`,
              { method: "POST" },
            );
            const discovered = (disc.data ?? []).map((m: ProviderModelInfo) => ({
              id: m.id,
              name: m.name ?? null,
              contextWindow: m.contextWindow ?? null,
              supportsTools: m.supportsTools ?? true,
              supportsVision: m.supportsVision ?? false,
            }));
            if (!cancelled) {
              setModels(discovered.length > 0 ? discovered : catalogFallbackModels(presetId));
            }
          } catch {
            if (!cancelled) setModels(catalogFallbackModels(presetId));
          }
        }
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, providerId, presetId, refreshKey]);

  return { models, loading, refresh };
}

// ─── Helpers ────────────────────────────────────────────────

import type { ApiWorkspaceAiDefaults } from "@/lib/api";

export function deriveSource(
  defaults: ApiWorkspaceAiDefaults | null,
  prefix: "default" | "suggestion",
): ModelSectionState {
  if (!defaults) return EMPTY_MODEL_STATE;
  if (prefix === "default") {
    return {
      source: defaults.default_source ?? "copilot",
      copilotAccountId: defaults.default_copilot_account_id ?? "",
      copilotModel: defaults.default_copilot_model ?? "",
      providerId: defaults.default_provider_id ?? "",
      providerModel: defaults.default_provider_model ?? "",
    };
  }
  return {
    source: defaults.suggestion_source ?? "copilot",
    copilotAccountId: defaults.suggestion_copilot_account_id ?? "",
    copilotModel: defaults.suggestion_copilot_model ?? "",
    providerId: defaults.suggestion_provider_id ?? "",
    providerModel: defaults.suggestion_provider_model ?? "",
  };
}
