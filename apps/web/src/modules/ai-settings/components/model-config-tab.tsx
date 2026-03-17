"use client";

import { useState, useEffect } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider, ApiWorkspaceAiDefaults } from "@/lib/api";
import { Bot, Sparkles, Loader2, Check } from "lucide-react";

interface Props {
  workspaceId: string | null;
  defaults: ApiWorkspaceAiDefaults | null;
  loading: boolean;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onUpdate: (data: {
    defaultCopilotAccountId?: string | null;
    defaultProviderId?: string | null;
    defaultModel?: string | null;
    suggestionCopilotAccountId?: string | null;
    suggestionProviderId?: string | null;
    suggestionModel?: string | null;
  }) => Promise<void>;
}

const COPILOT_MODELS = [
  { id: "", label: "Auto (recommended)" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "o4-mini", label: "o4-mini" },
];

type Source = "copilot" | "custom";

interface ModelSectionState {
  source: Source;
  copilotAccountId: string;
  providerId: string;
  model: string;
}

function deriveSource(defaults: ApiWorkspaceAiDefaults | null, prefix: "default" | "suggestion"): ModelSectionState {
  const copilotKey = prefix === "default" ? "default_copilot_account_id" : "suggestion_copilot_account_id";
  const providerKey = prefix === "default" ? "default_provider_id" : "suggestion_provider_id";
  const modelKey = prefix === "default" ? "default_model" : "suggestion_model";

  const providerId = defaults?.[providerKey] ?? "";
  const copilotAccountId = defaults?.[copilotKey] ?? "";
  const model = defaults?.[modelKey] ?? "";
  const source: Source = providerId ? "custom" : "copilot";

  return { source, copilotAccountId, providerId, model };
}

function ModelSection({
  title,
  description,
  icon: Icon,
  state,
  onChange,
  accounts,
  providers,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  state: ModelSectionState;
  onChange: (state: ModelSectionState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
}) {
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15">
          <Icon className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>

      {/* Step 1: Source toggle */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Provider Source</label>
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
          <button
            onClick={() => onChange({ ...state, source: "copilot", providerId: "" })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              state.source === "copilot"
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            GitHub Copilot
          </button>
          <button
            onClick={() => onChange({ ...state, source: "custom", copilotAccountId: "" })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              state.source === "custom"
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Custom Provider
          </button>
        </div>
      </div>

      {/* Step 2: Source-specific config */}
      <div className="grid grid-cols-2 gap-3">
        {state.source === "copilot" ? (
          <>
            {/* Copilot Account */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account</label>
              <select
                value={state.copilotAccountId}
                onChange={(e) => onChange({ ...state, copilotAccountId: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
              >
                <option value="">Default (gh CLI)</option>
                {validAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>
                ))}
              </select>
              {validAccounts.length === 0 && (
                <p className="text-[10px] text-zinc-600 mt-1">No accounts connected. Add one in Connections tab.</p>
              )}
            </div>
            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
              <select
                value={state.model}
                onChange={(e) => onChange({ ...state, model: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
              >
                {COPILOT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            {/* Custom Provider */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
              <select
                value={state.providerId}
                onChange={(e) => onChange({ ...state, providerId: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
              >
                <option value="">Select a provider...</option>
                {validProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>
                ))}
              </select>
              {validProviders.length === 0 && (
                <p className="text-[10px] text-zinc-600 mt-1">No providers configured. Add one in Connections tab.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ModelConfigTab({ workspaceId, defaults, loading, accounts, providers, onUpdate }: Props) {
  const [primary, setPrimary] = useState<ModelSectionState>(() => deriveSource(defaults, "default"));
  const [suggestions, setSuggestions] = useState<ModelSectionState>(() => deriveSource(defaults, "suggestion"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync state when defaults load
  useEffect(() => {
    if (defaults) {
      setPrimary(deriveSource(defaults, "default"));
      setSuggestions(deriveSource(defaults, "suggestion"));
    }
  }, [defaults]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        defaultCopilotAccountId: primary.source === "copilot" ? (primary.copilotAccountId || null) : null,
        defaultProviderId: primary.source === "custom" ? (primary.providerId || null) : null,
        defaultModel: primary.model || null,
        suggestionCopilotAccountId: suggestions.source === "copilot" ? (suggestions.copilotAccountId || null) : null,
        suggestionProviderId: suggestions.source === "custom" ? (suggestions.providerId || null) : null,
        suggestionModel: suggestions.model || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  }

  return (
    <div className="space-y-5">
      <ModelSection
        title="Primary Model"
        description="Used for code generation, editing, and agent tasks"
        icon={Bot}
        state={primary}
        onChange={setPrimary}
        accounts={accounts}
        providers={providers}
      />

      <ModelSection
        title="Suggestions Model"
        description="Used for generating next-step suggestion chips (a lighter model saves cost)"
        icon={Sparkles}
        state={suggestions}
        onChange={setSuggestions}
        accounts={accounts}
        providers={providers}
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        {saved ? "Saved!" : "Save Configuration"}
      </button>
    </div>
  );
}
