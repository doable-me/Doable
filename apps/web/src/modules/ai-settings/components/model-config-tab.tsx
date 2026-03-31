"use client";

import { useState, useEffect, useRef } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider, ApiWorkspaceAiDefaults, ApiUserAiPreferences, ApiEnforcementStatus } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { Bot, Sparkles, Loader2, Check, Lock, User, HelpCircle } from "lucide-react";

function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-xs text-zinc-300 leading-relaxed shadow-xl">
          <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 h-3 w-3 rotate-45 border-l border-t border-zinc-700 bg-zinc-800" />
          {text}
        </div>
      )}
    </div>
  );
}

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
  userPreferences?: ApiUserAiPreferences | null;
  enforcement?: ApiEnforcementStatus | null;
  onUserPreferenceUpdate?: (data: {
    copilotAccountId?: string | null;
    providerId?: string | null;
    model?: string | null;
  }) => Promise<void>;
}

const FALLBACK_MODELS = [
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

function useCopilotModels(copilotAccountId?: string) {
  const [models, setModels] = useState<{ id: string; label: string }[]>(FALLBACK_MODELS);
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    (async () => {
      try {
        const qs = copilotAccountId ? `?copilotAccountId=${copilotAccountId}` : "";
        const json = await apiFetch<{ data: { id: string; name: string }[] }>(`/ai/models${qs}`);
        if (cancelled) return;
        const fetched = json.data ?? [];
        if (fetched.length > 0) {
          setModels([
            { id: "", label: "Auto (recommended)" },
            ...fetched.map((m) => ({ id: m.id, label: m.name })),
          ]);
        } else {
          setModels(FALLBACK_MODELS);
        }
      } catch {
        setModels(FALLBACK_MODELS);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => { cancelled = true; };
  }, [copilotAccountId]);

  return { models, loadingModels };
}

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
  copilotModels,
  helpText,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  state: ModelSectionState;
  onChange: (state: ModelSectionState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  copilotModels: { id: string; label: string }[];
  helpText?: string;
}) {
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
          <Icon className="h-4 w-4 text-brand-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
            {helpText && <HelpTooltip text={helpText} />}
          </div>
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
                ? "bg-brand-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            GitHub Copilot
          </button>
          <button
            onClick={() => onChange({ ...state, source: "custom", copilotAccountId: "" })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              state.source === "custom"
                ? "bg-brand-600 text-white"
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
              >
                {copilotModels.map((m) => (
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
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

export function ModelConfigTab({ workspaceId, defaults, loading, accounts, providers, onUpdate, userPreferences, enforcement, onUserPreferenceUpdate }: Props) {
  const [primary, setPrimary] = useState<ModelSectionState>(() => deriveSource(defaults, "default"));
  const [suggestions, setSuggestions] = useState<ModelSectionState>(() => deriveSource(defaults, "suggestion"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch models dynamically based on selected copilot account (per-section)
  const activePrimaryCopilotId = primary.source === "copilot" ? primary.copilotAccountId : "";
  const activeSuggestionCopilotId = suggestions.source === "copilot" ? suggestions.copilotAccountId : "";
  const { models: primaryCopilotModels } = useCopilotModels(activePrimaryCopilotId || undefined);
  const { models: suggestionCopilotModels } = useCopilotModels(activeSuggestionCopilotId || undefined);
  // Unified alias — primary models used for general dropdown, suggestion models for suggestion dropdown
  const copilotModels = primaryCopilotModels;

  // User preferences local state
  const [userSource, setUserSource] = useState<Source>("copilot");
  const [userCopilotAccountId, setUserCopilotAccountId] = useState("");
  const [userProviderId, setUserProviderId] = useState("");
  const [userModel, setUserModel] = useState("");
  const activeUserCopilotId = userSource === "copilot" ? userCopilotAccountId : "";
  const { models: userCopilotModels } = useCopilotModels(activeUserCopilotId || undefined);
  const [userSaving, setUserSaving] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  // Sync state when defaults load
  useEffect(() => {
    if (defaults) {
      setPrimary(deriveSource(defaults, "default"));
      setSuggestions(deriveSource(defaults, "suggestion"));
    }
  }, [defaults]);

  // Sync user preferences state
  useEffect(() => {
    if (userPreferences) {
      const hasProvider = !!userPreferences.provider_id;
      setUserSource(hasProvider ? "custom" : "copilot");
      setUserCopilotAccountId(userPreferences.copilot_account_id ?? "");
      setUserProviderId(userPreferences.provider_id ?? "");
      setUserModel(userPreferences.model ?? "");
    }
  }, [userPreferences]);

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

  const handleUserPrefSave = async () => {
    if (!onUserPreferenceUpdate) return;
    setUserSaving(true);
    try {
      await onUserPreferenceUpdate({
        copilotAccountId: userSource === "copilot" ? (userCopilotAccountId || null) : null,
        providerId: userSource === "custom" ? (userProviderId || null) : null,
        model: userModel || null,
      });
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 2000);
    } finally {
      setUserSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  }

  const isEnforced = enforcement?.enforce_ai === true;
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

  return (
    <div className="space-y-5">
      {/* My AI Preferences */}
      {onUserPreferenceUpdate && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
              <User className="h-4 w-4 text-brand-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-zinc-200">My Personal Override</h3>
                <HelpTooltip text="This only changes the AI model for you — the admin currently logged in. It overrides the workspace defaults below. Other workspace members will still use the workspace defaults unless they set their own override. If you don't set anything here, you'll also use the workspace defaults." />
              </div>
              <p className="text-xs text-zinc-500">Override the workspace defaults below for yourself only — other members are not affected</p>
            </div>
          </div>

          {isEnforced ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-3">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm text-amber-300">
                An enforcement policy is active (see Access Control tab). Personal overrides are locked for all members.
              </p>
            </div>
          ) : (
            <>
              {/* Source toggle */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Provider Source</label>
                <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
                  <button
                    onClick={() => { setUserSource("copilot"); setUserProviderId(""); }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      userSource === "copilot"
                        ? "bg-brand-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    GitHub Copilot
                  </button>
                  <button
                    onClick={() => { setUserSource("custom"); setUserCopilotAccountId(""); }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      userSource === "custom"
                        ? "bg-brand-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Custom Provider
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {userSource === "copilot" ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account</label>
                      <select
                        value={userCopilotAccountId}
                        onChange={(e) => setUserCopilotAccountId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
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
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                      <select
                        value={userModel}
                        onChange={(e) => setUserModel(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                      >
                        {userCopilotModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
                      <select
                        value={userProviderId}
                        onChange={(e) => setUserProviderId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
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
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                      <input
                        type="text"
                        value={userModel}
                        onChange={(e) => setUserModel(e.target.value)}
                        placeholder="e.g. gpt-4o"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleUserPrefSave}
                disabled={userSaving}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {userSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : userSaved ? <Check className="h-4 w-4" /> : <User className="h-4 w-4" />}
                {userSaved ? "Saved!" : "Save My Override"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Workspace defaults separator */}
      {onUserPreferenceUpdate && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workspace Defaults — applies to all members</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
      )}

      <ModelSection
        title="Primary Model — All Workspace Members"
        description="Default model for code generation, editing, and agent tasks for everyone you've invited to this workspace"
        icon={Bot}
        state={primary}
        onChange={setPrimary}
        accounts={accounts}
        providers={providers}
        copilotModels={copilotModels}
        helpText="This is the main AI model used for chat, code generation, and editing. It applies to every member you've invited to this workspace — not all users on the platform. If a member has set a personal override (above), their override takes priority over this default."
      />

      <ModelSection
        title="Suggestions Model — All Workspace Members"
        description="Lighter model for suggestion chips, used by everyone you've invited to this workspace (saves cost vs primary model)"
        icon={Sparkles}
        state={suggestions}
        onChange={setSuggestions}
        accounts={accounts}
        providers={providers}
        copilotModels={copilotModels}
        helpText="Suggestion chips are the quick-action buttons shown after each AI response. This model handles only those suggestions — a lighter, cheaper model works well here. Like the primary model, this applies to every member you've invited to this workspace, not all users on the platform."
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        {saved ? "Saved!" : "Save Configuration"}
      </button>
    </div>
  );
}
