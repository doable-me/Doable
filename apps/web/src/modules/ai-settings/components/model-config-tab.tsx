"use client";

import { useState, useEffect, useRef } from "react";
import type {
  ApiGitHubCopilotAccount,
  ApiAiProvider,
  ApiWorkspaceAiDefaults,
  ApiUserAiPreferences,
  ApiEnforcementStatus,
} from "@/lib/api";
import { apiFetch } from "@/lib/api";
import {
  Bot,
  Sparkles,
  Loader2,
  Check,
  Lock,
  User,
  HelpCircle,
  Github,
  Plus,
  Eye,
  Wrench,
  Info,
} from "lucide-react";
import { ProviderWizard } from "./provider-wizard";

// ─── HelpTooltip ────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────

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

const CUSTOM_MODEL_SENTINEL = "__type_custom_id__";

// ─── Hooks ──────────────────────────────────────────────────

/** Fetches Copilot models dynamically. Exported for reuse (e.g. access-control-tab). */
export function useCopilotModels(copilotAccountId?: string) {
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

interface ProviderModelInfo {
  id: string;
  name: string | null;
  contextWindow: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
}

/** Fetches discovered models for a custom provider from the provider-bridge cache. */
function useProviderModels(workspaceId: string | null, providerId: string) {
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

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
        if (!cancelled) setModels(res.data?.models ?? []);
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, providerId]);

  return { models, loading };
}

// ─── Types ──────────────────────────────────────────────────

type Source = "copilot" | "custom";

interface ModelSectionState {
  source: Source;
  copilotAccountId: string;
  providerId: string;
  model: string;
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
  onRefreshProviders?: () => void;
  isPlatformAdmin?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

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

// ─── Inline Config Fields ───────────────────────────────────
// Shared UI for source toggle + provider/model selection.
// Used by both ModelSection cards and the personal override area.

function InlineConfigFields({
  state,
  onChange,
  accounts,
  providers,
  copilotModels,
  workspaceId,
  providerModels,
  providerModelsLoading,
  onAddProviderClick,
}: {
  state: ModelSectionState;
  onChange: (state: ModelSectionState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  copilotModels: { id: string; label: string }[];
  workspaceId: string | null;
  providerModels: ProviderModelInfo[];
  providerModelsLoading: boolean;
  onAddProviderClick?: () => void;
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

  // Track if user is typing a custom model ID for custom providers
  const [customModelMode, setCustomModelMode] = useState(false);

  // Reset custom model mode when provider changes
  useEffect(() => {
    setCustomModelMode(false);
  }, [state.providerId]);

  const modelInList = providerModels.some((m) => m.id === state.model);
  const showModelDropdown =
    state.source === "custom" &&
    state.providerId &&
    providerModels.length > 0 &&
    !customModelMode;

  return (
    <>
      {/* Source toggle */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Provider Source
        </label>
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

      {/* Source-specific config */}
      <div className="grid grid-cols-2 gap-3">
        {state.source === "copilot" ? (
          <>
            {/* Copilot Account */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account</label>
              <div className="flex gap-2">
                <select
                  value={state.copilotAccountId}
                  onChange={(e) => onChange({ ...state, copilotAccountId: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                >
                  <option value="">Server Default</option>
                  {validAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} (@{a.github_login})
                    </option>
                  ))}
                </select>
                <a
                  href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
                  className="flex items-center gap-1 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                  title="Connect GitHub Account"
                >
                  <Plus className="h-3 w-3" />
                  <Github className="h-3.5 w-3.5" />
                </a>
              </div>
              {state.copilotAccountId === "" && (
                <p className="text-[10px] text-zinc-500 mt-1">
                  Uses the server&apos;s built-in GitHub authentication. Connect your own account for more control.
                </p>
              )}
              {validAccounts.length === 0 && (
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                  No accounts connected.{" "}
                  <a
                    href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    Connect one
                  </a>
                </p>
              )}
            </div>
            {/* Copilot Model */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
              <select
                value={state.model}
                onChange={(e) => onChange({ ...state, model: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
              >
                {copilotModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            {/* Custom Provider */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
              <div className="flex gap-2">
                <select
                  value={state.providerId}
                  onChange={(e) => onChange({ ...state, providerId: e.target.value, model: "" })}
                  className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                >
                  <option value="">Select a provider...</option>
                  {validProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.provider_type})
                    </option>
                  ))}
                </select>
                {onAddProviderClick && (
                  <button
                    onClick={onAddProviderClick}
                    className="flex items-center gap-1 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                    title="Add Provider"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )}
              </div>
              {validProviders.length === 0 && onAddProviderClick && (
                <p className="text-[10px] text-zinc-500 mt-1">
                  No providers configured.{" "}
                  <button
                    onClick={onAddProviderClick}
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    Add your first provider
                  </button>
                </p>
              )}
            </div>
            {/* Custom Provider Model */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
              {providerModelsLoading && state.providerId ? (
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading models...
                </div>
              ) : showModelDropdown ? (
                <>
                  <select
                    value={modelInList ? state.model : CUSTOM_MODEL_SENTINEL}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                        setCustomModelMode(true);
                        onChange({ ...state, model: "" });
                      } else {
                        onChange({ ...state, model: e.target.value });
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                  >
                    <option value="">Select a model...</option>
                    {providerModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                        {m.supportsVision ? " [vision]" : ""}
                        {m.supportsTools ? " [tools]" : ""}
                      </option>
                    ))}
                    <option value={CUSTOM_MODEL_SENTINEL}>Type custom model ID...</option>
                  </select>
                  {state.model && modelInList && (
                    <ModelCapabilityBadges model={providerModels.find((m) => m.id === state.model)} />
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={state.model}
                    onChange={(e) => onChange({ ...state, model: e.target.value })}
                    placeholder={state.providerId ? "e.g. gpt-4o" : "Select a provider first"}
                    disabled={!state.providerId}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500 disabled:opacity-50"
                  />
                  {customModelMode && providerModels.length > 0 && (
                    <button
                      onClick={() => setCustomModelMode(false)}
                      className="text-[10px] text-brand-400 hover:text-brand-300 mt-1"
                    >
                      Back to model list
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Small capability badges shown below model dropdown when a model is selected. */
function ModelCapabilityBadges({ model }: { model?: ProviderModelInfo }) {
  if (!model) return null;
  const badges: { label: string; icon: React.ElementType }[] = [];
  if (model.supportsVision) badges.push({ label: "Vision", icon: Eye });
  if (model.supportsTools) badges.push({ label: "Tool calling", icon: Wrench });
  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
        >
          <b.icon className="h-2.5 w-2.5" />
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ─── ModelSection Card ──────────────────────────────────────

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
  workspaceId,
  providerModels,
  providerModelsLoading,
  onAddProviderClick,
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
  workspaceId: string | null;
  providerModels: ProviderModelInfo[];
  providerModelsLoading: boolean;
  onAddProviderClick?: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
      {/* Header */}
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

      <InlineConfigFields
        state={state}
        onChange={onChange}
        accounts={accounts}
        providers={providers}
        copilotModels={copilotModels}
        workspaceId={workspaceId}
        providerModels={providerModels}
        providerModelsLoading={providerModelsLoading}
        onAddProviderClick={onAddProviderClick}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function ModelConfigTab({
  workspaceId,
  defaults,
  loading,
  accounts,
  providers,
  onUpdate,
  userPreferences,
  enforcement,
  onUserPreferenceUpdate,
  onRefreshProviders,
  isPlatformAdmin,
}: Props) {
  // ── Workspace default state ──
  const [primary, setPrimary] = useState<ModelSectionState>(() => deriveSource(defaults, "default"));
  const [suggestions, setSuggestions] = useState<ModelSectionState>(() => deriveSource(defaults, "suggestion"));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Copilot models per section ──
  const activePrimaryCopilotId = primary.source === "copilot" ? primary.copilotAccountId : "";
  const activeSuggestionCopilotId = suggestions.source === "copilot" ? suggestions.copilotAccountId : "";
  const { models: primaryCopilotModels } = useCopilotModels(activePrimaryCopilotId || undefined);
  const { models: suggestionCopilotModels } = useCopilotModels(activeSuggestionCopilotId || undefined);

  // ── Provider models per workspace section ──
  const primaryCustomProviderId = primary.source === "custom" ? primary.providerId : "";
  const suggestionCustomProviderId = suggestions.source === "custom" ? suggestions.providerId : "";
  const { models: primaryProviderModels, loading: primaryProviderModelsLoading } = useProviderModels(workspaceId, primaryCustomProviderId);
  const { models: suggestionProviderModels, loading: suggestionProviderModelsLoading } = useProviderModels(workspaceId, suggestionCustomProviderId);

  // ── User preferences (primary override) ──
  const [userPrimary, setUserPrimary] = useState<ModelSectionState>({
    source: "copilot",
    copilotAccountId: "",
    providerId: "",
    model: "",
  });
  const activeUserCopilotId = userPrimary.source === "copilot" ? userPrimary.copilotAccountId : "";
  const { models: userCopilotModels } = useCopilotModels(activeUserCopilotId || undefined);
  const userCustomProviderId = userPrimary.source === "custom" ? userPrimary.providerId : "";
  const { models: userProviderModels, loading: userProviderModelsLoading } = useProviderModels(workspaceId, userCustomProviderId);

  // ── User preferences (suggestion override) ──
  const [userSuggestion, setUserSuggestion] = useState<ModelSectionState>({
    source: "copilot",
    copilotAccountId: "",
    providerId: "",
    model: "",
  });
  const activeUserSugCopilotId = userSuggestion.source === "copilot" ? userSuggestion.copilotAccountId : "";
  const { models: userSugCopilotModels } = useCopilotModels(activeUserSugCopilotId || undefined);
  const userSugCustomProviderId = userSuggestion.source === "custom" ? userSuggestion.providerId : "";
  const { models: userSugProviderModels, loading: userSugProviderModelsLoading } = useProviderModels(workspaceId, userSugCustomProviderId);

  const [userSaving, setUserSaving] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  // ── Which user override sub-tab is active ──
  const [userOverrideTab, setUserOverrideTab] = useState<"primary" | "suggestion">("primary");

  // ── Provider wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false);

  // ── Sync workspace defaults when loaded ──
  useEffect(() => {
    if (defaults) {
      setPrimary(deriveSource(defaults, "default"));
      setSuggestions(deriveSource(defaults, "suggestion"));
    }
  }, [defaults]);

  // ── Sync user preferences when loaded ──
  useEffect(() => {
    if (userPreferences) {
      const hasProvider = !!userPreferences.provider_id;
      setUserPrimary({
        source: hasProvider ? "custom" : "copilot",
        copilotAccountId: userPreferences.copilot_account_id ?? "",
        providerId: userPreferences.provider_id ?? "",
        model: userPreferences.model ?? "",
      });
      // Suggestion override fields — the API doesn't store these yet,
      // so they reset to defaults on page load. Backend extension pending.
    }
  }, [userPreferences]);

  // ── Save workspace defaults ──
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

  // ── Save user preferences ──
  const handleUserPrefSave = async () => {
    if (!onUserPreferenceUpdate) return;
    setUserSaving(true);
    try {
      await onUserPreferenceUpdate({
        copilotAccountId: userPrimary.source === "copilot" ? (userPrimary.copilotAccountId || null) : null,
        providerId: userPrimary.source === "custom" ? (userPrimary.providerId || null) : null,
        model: userPrimary.model || null,
      });
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 2000);
    } finally {
      setUserSaving(false);
    }
  };

  // ── Provider wizard callback ──
  const handleProviderAdded = () => {
    onRefreshProviders?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isEnforced = enforcement?.enforce_ai === true;

  return (
    <div className="space-y-5">
      {/* ════════════════════════════════════════════════════════
           How Model Selection Works (admin only)
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-300 mb-1">How model selection works</p>
              <ol className="text-[11px] text-blue-300/80 space-y-0.5 list-decimal list-inside">
                <li><strong className="text-blue-200">Enforcement</strong> (Access Control tab) — if active, everyone uses the enforced model. No exceptions.</li>
                <li><strong className="text-blue-200">Personal Override</strong> — each member can pick their own model. Overrides workspace defaults for that member only.</li>
                <li><strong className="text-blue-200">Workspace Defaults</strong> — the fallback for anyone who hasn&apos;t set a personal override.</li>
              </ol>
              <p className="text-[11px] text-blue-300/60 mt-1.5">Higher-numbered rules are only used when the one above isn&apos;t set.</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           My Personal Override
         ════════════════════════════════════════════════════════ */}
      {onUserPreferenceUpdate && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
              <User className="h-4 w-4 text-brand-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-zinc-200">My Personal Override</h3>
                <HelpTooltip text="This only changes the AI model for you. It overrides the workspace defaults below. Other workspace members will still use the workspace defaults unless they set their own override. If you don't set anything here, you'll also use the workspace defaults." />
              </div>
              <p className="text-xs text-zinc-500">
                Override the workspace defaults below for yourself only — other members are not affected
              </p>
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
              {/* Sub-tab switcher: Primary / Suggestion */}
              <div className="flex gap-1 mb-4 border-b border-zinc-800">
                <button
                  onClick={() => setUserOverrideTab("primary")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    userOverrideTab === "primary"
                      ? "border-brand-500 text-zinc-200"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" /> Primary Model
                </button>
                <button
                  onClick={() => setUserOverrideTab("suggestion")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    userOverrideTab === "suggestion"
                      ? "border-brand-500 text-zinc-200"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Suggestion Model
                </button>
              </div>

              {/* Primary override fields */}
              {userOverrideTab === "primary" && (
                <div className="mb-4">
                  <InlineConfigFields
                    state={userPrimary}
                    onChange={setUserPrimary}
                    accounts={accounts}
                    providers={providers}
                    copilotModels={userCopilotModels}
                    workspaceId={workspaceId}
                    providerModels={userProviderModels}
                    providerModelsLoading={userProviderModelsLoading}
                    onAddProviderClick={() => setWizardOpen(true)}
                  />
                </div>
              )}

              {/* Suggestion override fields */}
              {userOverrideTab === "suggestion" && (
                <div className="mb-4">
                  <p className="text-[10px] text-zinc-500 mb-3">
                    Override which model generates quick-action suggestion chips after each AI response.
                  </p>
                  <InlineConfigFields
                    state={userSuggestion}
                    onChange={setUserSuggestion}
                    accounts={accounts}
                    providers={providers}
                    copilotModels={userSugCopilotModels}
                    workspaceId={workspaceId}
                    providerModels={userSugProviderModels}
                    providerModelsLoading={userSugProviderModelsLoading}
                    onAddProviderClick={() => setWizardOpen(true)}
                  />
                </div>
              )}

              <button
                onClick={handleUserPrefSave}
                disabled={userSaving}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
              >
                {userSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : userSaved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                {userSaved ? "Saved!" : "Save My Override"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           Workspace Defaults Separator
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && onUserPreferenceUpdate && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Workspace Defaults — applies to all members
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           Primary Model — Workspace Default
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && <ModelSection
        title="Primary Model — All Workspace Members"
        description="Default model for code generation, editing, and agent tasks for everyone you've invited to this workspace"
        icon={Bot}
        state={primary}
        onChange={setPrimary}
        accounts={accounts}
        providers={providers}
        copilotModels={primaryCopilotModels}
        helpText="This is the main AI model used for chat, code generation, and editing. It applies to every member you've invited to this workspace — not all users on the platform. If a member has set a personal override (above), their override takes priority over this default."
        workspaceId={workspaceId}
        providerModels={primaryProviderModels}
        providerModelsLoading={primaryProviderModelsLoading}
        onAddProviderClick={() => setWizardOpen(true)}
      />}

      {/* ════════════════════════════════════════════════════════
           Suggestions Model — Workspace Default
         ════════════════════════════════════════════════════════ */}
      {isPlatformAdmin && <ModelSection
        title="Suggestions Model — All Workspace Members"
        description="Lighter model for suggestion chips, used by everyone you've invited to this workspace (saves cost vs primary model)"
        icon={Sparkles}
        state={suggestions}
        onChange={setSuggestions}
        accounts={accounts}
        providers={providers}
        copilotModels={suggestionCopilotModels}
        helpText="Suggestion chips are the quick-action buttons shown after each AI response. This model handles only those suggestions — a lighter, cheaper model works well here. Like the primary model, this applies to every member you've invited to this workspace, not all users on the platform."
        workspaceId={workspaceId}
        providerModels={suggestionProviderModels}
        providerModelsLoading={suggestionProviderModelsLoading}
        onAddProviderClick={() => setWizardOpen(true)}
      />}

      {isPlatformAdmin && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          {saved ? "Saved!" : "Save Configuration"}
        </button>
      )}

      {/* ════════════════════════════════════════════════════════
           Provider Wizard Dialog (inline add provider)
         ════════════════════════════════════════════════════════ */}
      <ProviderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={workspaceId}
        onProviderAdded={handleProviderAdded}
      />
    </div>
  );
}
