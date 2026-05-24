"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { apiFetch } from "@/lib/api";
import {
  useCustomProviders,
  useGitHubAccounts,
} from "@/modules/ai-settings/hooks/use-ai-settings";
import {
  useCopilotModels,
  useProviderModels,
  type ModelSectionState,
  EMPTY_MODEL_STATE,
} from "@/modules/ai-settings/components/model-config-hooks";
import { ModelCapabilityBadges } from "@/modules/ai-settings/components/model-config-fields";

interface Props {
  workspaceId: string;
  /** Current override model id, or null/empty to inherit workspace default. */
  value: string | null;
  /** Workspace-resolved default shown in the inherit option label. */
  defaultModel: string | null;
  onChange: (modelId: string | null) => void;
}

function modelFromState(state: ModelSectionState): string | null {
  if (state.source === "copilot") {
    const id = state.copilotModel.trim();
    return id.length > 0 ? id : null;
  }
  const id = state.providerModel.trim();
  return id.length > 0 ? id : null;
}

export function ProjectChatModelPicker({
  workspaceId,
  value,
  defaultModel,
  onChange,
}: Props) {
  const { accounts, loading: accountsLoading } = useGitHubAccounts(workspaceId);
  const { providers, loading: providersLoading } = useCustomProviders(workspaceId);

  const [inherit, setInherit] = useState(() => !value);
  const [state, setState] = useState<ModelSectionState>(EMPTY_MODEL_STATE);
  const [initialized, setInitialized] = useState(false);

  const activeCopilotId = state.source === "copilot" ? state.copilotAccountId : "";
  const activeProviderId = state.source === "custom" ? state.providerId : "";

  const { models: copilotModels, loadingModels: copilotModelsLoading } =
    useCopilotModels(activeCopilotId || undefined);
  const {
    models: providerModels,
    loading: providerModelsLoading,
    refresh: refreshProviderModels,
  } = useProviderModels(workspaceId, activeProviderId);

  const validAccounts = useMemo(
    () => accounts.filter((a) => a.is_valid && a.scope === "workspace"),
    [accounts],
  );
  const validProviders = useMemo(
    () => providers.filter((p) => p.is_valid && p.scope === "workspace"),
    [providers],
  );

  const providersReady = !accountsLoading && !providersLoading;

  // Best-effort: when loading an existing override, pick the source/provider
  // that actually lists that model id.
  useEffect(() => {
    if (initialized || !providersReady || !value) return;

    const copilotMatch = copilotModels.some((m) => m.id === value);
    if (copilotMatch) {
      setState({
        source: "copilot",
        copilotAccountId: activeCopilotId,
        copilotModel: value,
        providerId: "",
        providerModel: "",
      });
      setInitialized(true);
      return;
    }

    if (state.source === "custom" && state.providerId && providerModels.some((m) => m.id === value)) {
      setState((s) => ({ ...s, providerModel: value }));
      setInitialized(true);
      return;
    }

    // Try each workspace provider until we find the model id.
    let cancelled = false;
    (async () => {
      for (const p of validProviders) {
        try {
          const json = await apiFetch<{ data?: { models?: { id: string }[] } }>(
            `/workspaces/${workspaceId}/ai-settings/providers/${p.id}/models`,
          );
          const models = json.data?.models ?? [];
          if (models.some((m) => m.id === value)) {
            if (!cancelled) {
              setState({
                source: "custom",
                copilotAccountId: "",
                copilotModel: "",
                providerId: p.id,
                providerModel: value,
              });
              setInitialized(true);
            }
            return;
          }
        } catch {
          // try next provider
        }
      }
      if (!cancelled) {
        // Override exists but we couldn't map it — show custom source with model id
        // pre-selected once user picks a provider.
        setState((s) => ({
          ...s,
          source: "custom",
          providerModel: value,
        }));
        setInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    initialized,
    providersReady,
    value,
    copilotModels,
    validProviders,
    workspaceId,
    activeCopilotId,
    state.source,
    state.providerId,
    providerModels,
  ]);

  const applyState = (next: ModelSectionState) => {
    setState(next);
    onChange(modelFromState(next));
  };

  const handleInheritChange = (nextInherit: boolean) => {
    setInherit(nextInherit);
    onChange(nextInherit ? null : modelFromState(state) ?? value);
  };

  const inheritLabel = defaultModel
    ? `Inherit workspace default (${defaultModel})`
    : "Inherit workspace default";

  const showModelDropdown =
    state.source === "custom" &&
    !!state.providerId &&
    providerModels.length > 0 &&
    !providerModelsLoading;

  return (
    <div className="space-y-4" data-testid="chat-model-override">
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            inherit
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/30"
          }`}
        >
          <input
            type="radio"
            name="chat-model-mode"
            checked={inherit}
            onChange={() => handleInheritChange(true)}
            className="sr-only"
            data-testid="chat-model-inherit"
          />
          <p className="text-sm font-medium">{inheritLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the model configured in AI Settings for this workspace.
          </p>
        </label>
        <label
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            !inherit
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/30"
          }`}
        >
          <input
            type="radio"
            name="chat-model-mode"
            checked={!inherit}
            onChange={() => handleInheritChange(false)}
            className="sr-only"
            data-testid="chat-model-override-mode"
          />
          <p className="text-sm font-medium">Override for this project</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a provider and model from your workspace catalog.
          </p>
        </label>
      </div>

      {!inherit && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          {(accountsLoading || providersLoading) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading providers…
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Provider source
            </label>
            <div className="flex w-fit overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() =>
                  applyState({ ...state, source: "copilot", providerId: "", providerModel: "" })
                }
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  state.source === "copilot"
                    ? "bg-brand-600 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                GitHub Copilot
              </button>
              <button
                type="button"
                onClick={() =>
                  applyState({ ...state, source: "custom", copilotAccountId: "", copilotModel: "" })
                }
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  state.source === "custom"
                    ? "bg-brand-600 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom provider
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {state.source === "copilot" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Account
                  </label>
                  <select
                    value={state.copilotAccountId}
                    onChange={(e) =>
                      applyState({ ...state, copilotAccountId: e.target.value, copilotModel: "" })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand-500"
                    data-testid="chat-model-copilot-account"
                  >
                    <option value="">Server default</option>
                    {validAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} (@{a.github_login})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Model
                  </label>
                  {copilotModelsLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading models…
                    </div>
                  ) : (
                    <select
                      value={state.copilotModel}
                      onChange={(e) => applyState({ ...state, copilotModel: e.target.value })}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand-500"
                      data-testid="chat-model-copilot-model"
                    >
                      <option value="">Select a model…</option>
                      {copilotModels
                        .filter((m) => m.id !== "")
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Provider
                  </label>
                  <select
                    value={state.providerId}
                    onChange={(e) =>
                      applyState({ ...state, providerId: e.target.value, providerModel: "" })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand-500"
                    data-testid="chat-model-provider"
                  >
                    <option value="">Select a provider…</option>
                    {validProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({p.provider_type})
                      </option>
                    ))}
                  </select>
                  {validProviders.length === 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      No workspace providers configured. Add one in{" "}
                      <a href="/ai-settings" className="text-brand-400 underline">
                        AI Settings
                      </a>
                      .
                    </p>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Model</label>
                    {state.providerId && (
                      <button
                        type="button"
                        onClick={refreshProviderModels}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        title="Refresh model list"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </button>
                    )}
                  </div>
                  {providerModelsLoading && state.providerId ? (
                    <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading models…
                    </div>
                  ) : showModelDropdown ? (
                    <>
                      <select
                        value={state.providerModel}
                        onChange={(e) => applyState({ ...state, providerModel: e.target.value })}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand-500"
                        data-testid="chat-model-provider-model"
                      >
                        <option value="">Select a model…</option>
                        {providerModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                            {m.supportsVision ? " [vision]" : ""}
                            {m.supportsTools ? " [tools]" : ""}
                          </option>
                        ))}
                      </select>
                      {state.providerModel && (
                        <ModelCapabilityBadges
                          model={providerModels.find((m) => m.id === state.providerModel)}
                        />
                      )}
                    </>
                  ) : (
                    <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      {state.providerId
                        ? "No models discovered yet. Click Refresh or check the provider in AI Settings."
                        : "Select a provider first."}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {value && !modelFromState(state) && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Current saved override: <span className="font-mono">{value}</span> — pick a model above
              to update it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
