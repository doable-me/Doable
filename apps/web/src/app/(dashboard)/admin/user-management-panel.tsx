"use client";

import { useState } from "react";
import {
  Bot, Zap, Crown, Check, X, Loader2, RotateCcw, ChevronDown,
  Search, Shield, Sparkles, Users as UsersIcon, Plus,
} from "lucide-react";
import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import { ApiError } from "@/lib/api";

// Server-side caps (keep in sync with services/api/src/routes/admin-users.ts)
const CREDIT_CAPS = {
  daily: 100_000,
  monthly: 1_000_000,
  rollover: 1_000_000,
} as const;

type CreditFieldErrors = Partial<Record<"dailyCredits" | "monthlyCredits" | "rolloverCredits", string>>;

function extractFieldErrors(err: unknown): { fieldErrors: CreditFieldErrors; formError: string | null } | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  // Server returns { error: { formErrors: [], fieldErrors: { dailyCredits: [...] } } }
  const raw = (err.body as unknown as { error?: unknown }).error;
  if (!raw || typeof raw !== "object") return null;
  const flat = raw as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
  if (!flat.fieldErrors && !flat.formErrors) return null;
  const fe: CreditFieldErrors = {};
  for (const k of ["dailyCredits", "monthlyCredits", "rolloverCredits"] as const) {
    const msgs = flat.fieldErrors?.[k];
    if (msgs && msgs.length > 0) fe[k] = msgs[0];
  }
  const formError = flat.formErrors && flat.formErrors.length > 0 ? flat.formErrors[0] : null;
  return { fieldErrors: fe, formError };
}
import {
  useCopilotModels,
  useProviderModels,
  FALLBACK_MODELS,
} from "@/modules/ai-settings/components/model-config-hooks";
import {
  type UserAiAllocation,
  rowActiveSide,
  rowActiveModel,
  rowHasAllocation,
  getEffectiveModel,
  getCreditSummary,
  ROLE_COLORS,
  PLAN_COLORS,
} from "./admin-shared";

// ─── Effective Model Badge ───────────────────────────────

function getSourceDetail(row: UserAiAllocation, source: "enforced" | "user" | "workspace" | "none"): { label: string; via: string } {
  if (source === "enforced") return { label: "Enforced", via: "workspace enforcement" };
  if (source === "user") {
    const side = rowActiveSide(row);
    if (side === "copilot") return { label: "User · Copilot", via: row.copilot_account_label ?? "Copilot" };
    if (side === "custom") return { label: "User · Custom", via: row.provider_label ?? row.provider_type ?? "Custom provider" };
    return { label: "User override", via: "user preference" };
  }
  if (source === "workspace") {
    const wsSrc = row.default_source;
    if (wsSrc === "copilot") return { label: "WS default · Copilot", via: "workspace Copilot setting" };
    if (wsSrc === "custom") return { label: "WS default · Custom", via: "workspace custom provider" };
    return { label: "Workspace default", via: "workspace setting" };
  }
  return { label: "Auto", via: "no model configured" };
}

function EffectiveModelBadge({ row }: { row: UserAiAllocation }) {
  const { model, source } = getEffectiveModel(row);
  const { label } = getSourceDetail(row, source);
  if (!model) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-zinc-800 text-zinc-500 border-zinc-700">
        <span className="font-medium">Auto-select</span>
        <span className="opacity-50">· no override</span>
      </span>
    );
  }
  const colors = {
    enforced: "bg-red-600/15 text-red-400 border-red-600/30",
    user: "bg-emerald-600/15 text-emerald-400 border-emerald-600/30",
    workspace: "bg-blue-600/15 text-blue-400 border-blue-600/30",
    none: "bg-zinc-800 text-zinc-500 border-zinc-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${colors[source]}`}>
      <span className="font-medium">{label}</span>
      <span className="opacity-70">·</span>
      <span className="truncate max-w-[140px]">{model}</span>
    </span>
  );
}

// ─── Credit Mini Bar ─────────────────────────────────────

function CreditMiniBar({ row }: { row: UserAiAllocation }) {
  const c = getCreditSummary(row);
  if (c.dailyTotal === 0 && c.monthlyTotal === 0) {
    return <span className="text-[10px] text-zinc-600">No credits</span>;
  }
  const pct = c.dailyTotal > 0 ? Math.round((c.dailyRemaining / c.dailyTotal) * 100) : 0;
  const color = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-400 whitespace-nowrap tabular-nums">
        {c.dailyRemaining}/{c.dailyTotal}
      </span>
    </div>
  );
}

// ─── Source Badge ────────────────────────────────────────

function SourceBadge({ row }: { row: UserAiAllocation }) {
  const side = rowActiveSide(row);
  if (!rowHasAllocation(row)) {
    // Show what workspace default is, if any
    if (row.default_source === "copilot") {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">WS default · Copilot</span>;
    }
    if (row.default_source === "custom") {
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">WS default · Custom</span>;
    }
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">No source set</span>;
  }
  if (side === "copilot") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-400">
        Copilot · {row.copilot_account_label ?? "default account"}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400">
      Custom · {row.provider_label ?? row.provider_type ?? "provider"}
    </span>
  );
}

// ─── User Detail Modal ──────────────────────────────────

function UserDetailModal({
  user,
  workspaceId,
  accounts,
  providers,
  onClose,
  onAllocate,
  onReset,
  onSetCredits,
  onChangeRole,
  onChangePlan,
}: {
  user: UserAiAllocation;
  workspaceId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onClose: () => void;
  onAllocate: (userId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
  }) => Promise<void>;
  onReset: (userId: string) => Promise<void>;
  onSetCredits: (userId: string, data: { dailyCredits?: number; monthlyCredits?: number; rolloverCredits?: number; resetUsage?: boolean }) => Promise<void>;
  onChangeRole: (userId: string, role: string) => void;
  onChangePlan: (userId: string, plan: string) => void;
}) {
  const [tab, setTab] = useState<"model" | "credits">("model");
  const [source, setSource] = useState<"copilot" | "custom">(rowActiveSide(user) ?? "copilot");
  const [copilotAccountId, setCopilotAccountId] = useState(user.copilot_account_id ?? "");
  const [copilotModel, setCopilotModel] = useState(user.copilot_model ?? "");
  const [providerId, setProviderId] = useState(user.provider_id ?? "");
  const [providerModel, setProviderModel] = useState(user.provider_model ?? "");
  const [saving, setSaving] = useState(false);

  const c = getCreditSummary(user);
  const [creditDaily, setCreditDaily] = useState(c.dailyTotal);
  const [creditMonthly, setCreditMonthly] = useState(c.monthlyTotal);
  const [creditRollover, setCreditRollover] = useState(c.rollover);
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditErrors, setCreditErrors] = useState<CreditFieldErrors>({});
  const [creditFormError, setCreditFormError] = useState<string | null>(null);

  function validateCredits(): CreditFieldErrors {
    const errs: CreditFieldErrors = {};
    const check = (key: "dailyCredits" | "monthlyCredits" | "rolloverCredits", val: number, max: number) => {
      if (!Number.isFinite(val) || Number.isNaN(val)) errs[key] = "Must be a number";
      else if (!Number.isInteger(val)) errs[key] = "Must be a whole number";
      else if (val < 0) errs[key] = "Must be ≥ 0";
      else if (val > max) errs[key] = `Must be ≤ ${max.toLocaleString()}`;
    };
    check("dailyCredits", creditDaily, CREDIT_CAPS.daily);
    check("monthlyCredits", creditMonthly, CREDIT_CAPS.monthly);
    check("rolloverCredits", creditRollover, CREDIT_CAPS.rollover);
    return errs;
  }

  const eff = getEffectiveModel(user);
  const validAccounts = accounts.filter(a => a.is_valid);
  const validProviders = providers.filter(p => p.is_valid);

  // Dynamic model lists — Copilot models depend on account; provider models
  // require workspaceId + providerId. When data isn't available we fall back
  // to the curated FALLBACK_MODELS list so admins are never stuck with a
  // free-text field.
  const { models: copilotModels, loadingModels: loadingCopilot } =
    useCopilotModels(copilotAccountId || undefined);
  const { models: providerModelList, loading: loadingProviderModels } =
    useProviderModels(workspaceId, providerId);

  async function saveModel() {
    setSaving(true);
    try {
      await onAllocate(user.user_id, {
        source,
        copilotAccountId: copilotAccountId || null,
        copilotModel: copilotModel || null,
        providerId: providerId || null,
        providerModel: providerModel || null,
      });
      onClose();
    } finally { setSaving(false); }
  }

  async function saveCredits(resetUsage = false) {
    const clientErrs = validateCredits();
    if (Object.keys(clientErrs).length > 0) {
      setCreditErrors(clientErrs);
      setCreditFormError(null);
      return;
    }
    setCreditErrors({});
    setCreditFormError(null);
    setCreditSaving(true);
    try {
      await onSetCredits(user.user_id, {
        dailyCredits: creditDaily,
        monthlyCredits: creditMonthly,
        rolloverCredits: creditRollover,
        resetUsage,
      });
      if (!resetUsage) onClose();
    } catch (err) {
      const parsed = extractFieldErrors(err);
      if (parsed) {
        setCreditErrors(parsed.fieldErrors);
        setCreditFormError(parsed.formError);
        return;
      }
      // Unknown error — surface as a form-level message instead of crashing the page
      setCreditFormError(err instanceof Error ? err.message : "Failed to save credits");
    } finally { setCreditSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
            {(user.display_name ?? user.email)[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{user.display_name ?? user.email.split("@")[0]}</h3>
              {user.is_platform_admin && <Crown className="h-3.5 w-3.5 text-amber-400" />}
            </div>
            <p className="text-xs text-zinc-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role & Plan row */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Role:</label>
            <select
              value={user.platform_role ?? "member"}
              onChange={e => onChangeRole(user.user_id, e.target.value)}
              className={`rounded-md bg-zinc-800 border border-zinc-700 text-xs font-medium px-2 py-1 outline-none focus:border-brand-500 ${ROLE_COLORS[user.platform_role ?? "member"] ?? "text-zinc-300"}`}
            >
              {WORKSPACE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Plan:</label>
            <select
              value={user.workspace_plan ?? "free"}
              onChange={e => onChangePlan(user.user_id, e.target.value)}
              className={`rounded-md bg-zinc-800 border border-zinc-700 text-xs font-medium px-2 py-1 outline-none focus:border-brand-500 ${PLAN_COLORS[user.workspace_plan ?? "free"] ?? "text-zinc-300"}`}
            >
              {WORKSPACE_PLANS.map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          {/* Effective model display */}
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Active Model</div>
            <EffectiveModelBadge row={user} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button onClick={() => setTab("model")} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${tab === "model" ? "text-white border-b-2 border-brand-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            <Bot className="h-3.5 w-3.5" /> AI Model & Source
          </button>
          <button onClick={() => setTab("credits")} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${tab === "credits" ? "text-white border-b-2 border-brand-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            <Zap className="h-3.5 w-3.5" /> Credits
          </button>
        </div>

        {/* Tab Content */}
        <div className="px-6 py-5">
          {tab === "model" && (
            <div className="space-y-4">
              {/* Current active state */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Currently Active</div>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <span className="text-zinc-500">Model:</span>
                  <span className="text-white font-medium">{eff.model ?? "Auto-select (no model set)"}</span>
                  <span className="text-zinc-500">Source:</span>
                  <span className={`${
                    eff.source === "enforced" ? "text-red-400" :
                    eff.source === "user" ? "text-emerald-400" :
                    eff.source === "workspace" ? "text-blue-400" : "text-zinc-500"
                  }`}>{getSourceDetail(user, eff.source).via}</span>
                  <span className="text-zinc-500">Subscription:</span>
                  <span className="text-zinc-300">{(() => {
                    const side = rowActiveSide(user);
                    if (side === "copilot") return `GitHub Copilot${user.copilot_account_label ? ` (${user.copilot_account_label})` : ""}`;
                    if (side === "custom") return `Custom provider${user.provider_label ? ` (${user.provider_label})` : ""}`;
                    if (user.default_source === "copilot") return "GitHub Copilot (workspace default)";
                    if (user.default_source === "custom") return "Custom provider (workspace default)";
                    return "None configured";
                  })()}</span>
                </div>
                {user.enforce_ai && (
                  <p className="text-[11px] text-red-400 mt-1">
                    Workspace enforcement is ON — this user cannot choose their own model.
                  </p>
                )}
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Resolution: Enforcement → User override → Workspace default → Auto-select
                </p>
              </div>

              {/* Source toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Set Override Source</label>
                <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
                  <button onClick={() => setSource("copilot")} className={`px-4 py-2 text-sm font-medium transition-colors ${source === "copilot" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                    GitHub Copilot
                  </button>
                  <button onClick={() => setSource("custom")} className={`px-4 py-2 text-sm font-medium transition-colors ${source === "custom" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                    Custom Provider
                  </button>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3">
                {source === "copilot" ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Copilot Account</label>
                      <select value={copilotAccountId} onChange={e => setCopilotAccountId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                        <option value="">No specific account (auto)</option>
                        {validAccounts.map(a => <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Model {loadingCopilot && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                      </label>
                      <select
                        value={copilotModel}
                        onChange={e => setCopilotModel(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                      >
                        {copilotModels.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                        {copilotModel && !copilotModels.some(m => m.id === copilotModel) && (
                          <option value={copilotModel}>{copilotModel} (custom)</option>
                        )}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
                      <select value={providerId} onChange={e => setProviderId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                        <option value="">Select a provider...</option>
                        {validProviders.map(p => <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Model {loadingProviderModels && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                      </label>
                      {providerId && providerModelList.length > 0 ? (
                        <select
                          value={providerModel}
                          onChange={e => setProviderModel(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                        >
                          <option value="">Auto (provider default)</option>
                          {providerModelList.map(m => (
                            <option key={m.id} value={m.id}>{m.name ?? m.id}</option>
                          ))}
                          {providerModel && !providerModelList.some(m => m.id === providerModel) && (
                            <option value={providerModel}>{providerModel} (custom)</option>
                          )}
                        </select>
                      ) : (
                        <select
                          value={providerModel}
                          onChange={e => setProviderModel(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                          disabled={!providerId}
                        >
                          {FALLBACK_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                          {providerModel && !FALLBACK_MODELS.some(m => m.id === providerModel) && (
                            <option value={providerModel}>{providerModel} (custom)</option>
                          )}
                        </select>
                      )}
                      {!providerId && (
                        <p className="text-[10px] text-zinc-500 mt-1">Select a provider to load its models.</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button onClick={saveModel} disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                </button>
                {rowHasAllocation(user) && (
                  <button onClick={() => { onReset(user.user_id); onClose(); }}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-600/30 transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset to Defaults
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {tab === "credits" && (
            <div className="space-y-4">
              {/* Current usage summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Daily</div>
                  <div className="text-lg font-semibold text-white tabular-nums">{c.dailyRemaining}<span className="text-zinc-600 text-sm">/{c.dailyTotal}</span></div>
                  <div className="text-[10px] text-zinc-500">{c.dailyUsed} used</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Monthly</div>
                  <div className="text-lg font-semibold text-white tabular-nums">{c.monthlyRemaining}<span className="text-zinc-600 text-sm">/{c.monthlyTotal}</span></div>
                  <div className="text-[10px] text-zinc-500">{c.monthlyUsed} used</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Rollover</div>
                  <div className="text-lg font-semibold text-white tabular-nums">{c.rollover}</div>
                  <div className="text-[10px] text-zinc-500">bonus credits</div>
                </div>
              </div>

              {/* Edit fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Daily Credits</label>
                  <input type="number" min={0} max={CREDIT_CAPS.daily} step={1} value={creditDaily} onChange={e => setCreditDaily(Number(e.target.value))}
                    aria-invalid={!!creditErrors.dailyCredits}
                    className={`w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500 ${creditErrors.dailyCredits ? "border-red-500" : "border-zinc-700"}`} />
                  <p className="text-[10px] text-zinc-500 mt-1">Max {CREDIT_CAPS.daily.toLocaleString()}</p>
                  {creditErrors.dailyCredits && <p className="text-[11px] text-red-400 mt-1">{creditErrors.dailyCredits}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Monthly Credits</label>
                  <input type="number" min={0} max={CREDIT_CAPS.monthly} step={1} value={creditMonthly} onChange={e => setCreditMonthly(Number(e.target.value))}
                    aria-invalid={!!creditErrors.monthlyCredits}
                    className={`w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500 ${creditErrors.monthlyCredits ? "border-red-500" : "border-zinc-700"}`} />
                  <p className="text-[10px] text-zinc-500 mt-1">Max {CREDIT_CAPS.monthly.toLocaleString()}</p>
                  {creditErrors.monthlyCredits && <p className="text-[11px] text-red-400 mt-1">{creditErrors.monthlyCredits}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Rollover Credits</label>
                  <input type="number" min={0} max={CREDIT_CAPS.rollover} step={1} value={creditRollover} onChange={e => setCreditRollover(Number(e.target.value))}
                    aria-invalid={!!creditErrors.rolloverCredits}
                    className={`w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500 ${creditErrors.rolloverCredits ? "border-red-500" : "border-zinc-700"}`} />
                  <p className="text-[10px] text-zinc-500 mt-1">Max {CREDIT_CAPS.rollover.toLocaleString()}</p>
                  {creditErrors.rolloverCredits && <p className="text-[11px] text-red-400 mt-1">{creditErrors.rolloverCredits}</p>}
                </div>
              </div>

              {creditFormError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {creditFormError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button onClick={() => saveCredits(false)} disabled={creditSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                  {creditSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save Credits
                </button>
                <button onClick={() => saveCredits(true)} disabled={creditSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
                  <RotateCcw className="h-3.5 w-3.5" /> Save & Reset Usage
                </button>
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Allocate Modal ────────────────────────────────

export interface BulkApplyPayload {
  model?: {
    source: "copilot" | "custom";
    copilotAccountId: string | null;
    copilotModel: string | null;
    providerId: string | null;
    providerModel: string | null;
  };
  addQuota?: {
    daily: number;
    monthly: number;
    rollover: number;
  };
}

function BulkAllocateModal({
  selectedUsers,
  workspaceId,
  accounts,
  providers,
  onClose,
  onApply,
}: {
  selectedUsers: UserAiAllocation[];
  workspaceId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onClose: () => void;
  onApply: (userIds: string[], payload: BulkApplyPayload) => Promise<void>;
}) {
  const [applyModel, setApplyModel] = useState(true);
  const [applyQuota, setApplyQuota] = useState(false);

  const [source, setSource] = useState<"copilot" | "custom">("copilot");
  const [copilotAccountId, setCopilotAccountId] = useState("");
  const [copilotModel, setCopilotModel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerModel, setProviderModel] = useState("");

  const [addDaily, setAddDaily] = useState(0);
  const [addMonthly, setAddMonthly] = useState(0);
  const [addRollover, setAddRollover] = useState(0);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const validAccounts = accounts.filter(a => a.is_valid);
  const validProviders = providers.filter(p => p.is_valid);

  const { models: copilotModels, loadingModels: loadingCopilot } =
    useCopilotModels(copilotAccountId || undefined);
  const { models: providerModelList, loading: loadingProviderModels } =
    useProviderModels(workspaceId, providerId);

  const canApply =
    (applyModel || applyQuota) &&
    (!applyModel ||
      (source === "copilot" ? !!copilotModel : !!providerId)) &&
    (!applyQuota || addDaily > 0 || addMonthly > 0 || addRollover > 0);

  async function handleApply() {
    if (!canApply) return;
    const payload: BulkApplyPayload = {};
    if (applyModel) {
      payload.model = {
        source,
        copilotAccountId: copilotAccountId || null,
        copilotModel: source === "copilot" ? (copilotModel || null) : null,
        providerId: source === "custom" ? (providerId || null) : null,
        providerModel: source === "custom" ? (providerModel || null) : null,
      };
    }
    if (applyQuota) {
      payload.addQuota = { daily: addDaily, monthly: addMonthly, rollover: addRollover };
    }
    setSaving(true);
    setProgress({ done: 0, total: selectedUsers.length });
    try {
      // Wrap onApply so it can report progress through a reference; for simplicity
      // we just call onApply once with all ids — parent does its own iteration.
      await onApply(selectedUsers.map(u => u.user_id), payload);
      onClose();
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  const previewNames = selectedUsers
    .slice(0, 6)
    .map(u => u.display_name ?? u.email.split("@")[0])
    .join(", ");
  const remaining = selectedUsers.length - 6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/20 text-brand-400">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">Bulk Allocate AI Settings</h3>
            <p className="text-xs text-zinc-500 truncate">
              {selectedUsers.length} user{selectedUsers.length !== 1 ? "s" : ""}
              {previewNames && <>: <span className="text-zinc-400">{previewNames}{remaining > 0 ? ` +${remaining} more` : ""}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Section: Model & Source */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50">
            <label className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={applyModel}
                onChange={e => setApplyModel(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
              />
              <Bot className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Set AI Model & Source</span>
              <span className="text-[11px] text-zinc-500 ml-auto">Replaces user's current override</span>
            </label>
            {applyModel && (
              <div className="px-4 py-4 space-y-3">
                {/* Source toggle */}
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Source</label>
                  <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
                    <button onClick={() => setSource("copilot")} className={`px-4 py-2 text-sm font-medium transition-colors ${source === "copilot" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                      GitHub Copilot
                    </button>
                    <button onClick={() => setSource("custom")} className={`px-4 py-2 text-sm font-medium transition-colors ${source === "custom" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                      Custom Provider
                    </button>
                  </div>
                </div>

                {source === "copilot" ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Copilot Account</label>
                      <select value={copilotAccountId} onChange={e => setCopilotAccountId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                        <option value="">No specific account (auto)</option>
                        {validAccounts.map(a => <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Model {loadingCopilot && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                      </label>
                      <select value={copilotModel} onChange={e => setCopilotModel(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                        <option value="">Select a model...</option>
                        {copilotModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
                      <select value={providerId} onChange={e => setProviderId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                        <option value="">Select a provider...</option>
                        {validProviders.map(p => <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Model {loadingProviderModels && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                      </label>
                      {providerId && providerModelList.length > 0 ? (
                        <select value={providerModel} onChange={e => setProviderModel(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500">
                          <option value="">Auto (provider default)</option>
                          {providerModelList.map(m => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
                        </select>
                      ) : (
                        <select value={providerModel} onChange={e => setProviderModel(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500"
                          disabled={!providerId}>
                          {FALLBACK_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Section: Add Quota */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50">
            <label className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={applyQuota}
                onChange={e => setApplyQuota(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
              />
              <Zap className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Add Additional Quota</span>
              <span className="text-[11px] text-zinc-500 ml-auto">Adds to each user's existing credits</span>
            </label>
            {applyQuota && (
              <div className="px-4 py-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">+ Daily</label>
                    <input type="number" min={0} value={addDaily} onChange={e => setAddDaily(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">+ Monthly</label>
                    <input type="number" min={0} value={addMonthly} onChange={e => setAddMonthly(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">+ Rollover</label>
                    <input type="number" min={0} value={addRollover} onChange={e => setAddRollover(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">
                  These amounts are <span className="text-zinc-300 font-medium">added</span> to each selected user's current totals (not replaced).
                </p>
              </div>
            )}
          </div>

          {progress && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Applying to {progress.done} / {progress.total} users…
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-800">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleApply} disabled={!canApply || saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Apply to {selectedUsers.length} user{selectedUsers.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main User Management Panel ─────────────────────────

interface UserManagementPanelProps {
  users: UserAiAllocation[];
  workspaceId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  loading: boolean;
  currentUserId: string;
  onAllocate: (userId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
  }) => Promise<void>;
  onReset: (userId: string) => Promise<void>;
  onSetCredits: (userId: string, data: { dailyCredits?: number; monthlyCredits?: number; rolloverCredits?: number; resetUsage?: boolean }) => Promise<void>;
  onChangeRole: (userId: string, role: string) => void;
  onChangePlan: (userId: string, plan: string) => void;
  onBulkApply: (userIds: string[], payload: BulkApplyPayload) => Promise<void>;
}

export function UserManagementPanel({
  users, workspaceId, accounts, providers, loading, currentUserId,
  onAllocate, onReset, onSetCredits, onChangeRole, onChangePlan, onBulkApply,
}: UserManagementPanelProps) {
  const [selectedUser, setSelectedUser] = useState<UserAiAllocation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<"all" | "copilot" | "custom" | "none">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  }

  const filtered = users.filter(u => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.email.toLowerCase().includes(q) && !(u.display_name?.toLowerCase().includes(q))) return false;
    }
    if (filterSource !== "all") {
      const side = rowActiveSide(u);
      if (filterSource === "none" && side !== null) return false;
      if (filterSource === "copilot" && side !== "copilot") return false;
      if (filterSource === "custom" && side !== "custom") return false;
    }
    return true;
  });

  const filteredIds = filtered.map(u => u.user_id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some(id => selectedIds.has(id));

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedUsers = users.filter(u => selectedIds.has(u.user_id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value as typeof filterSource)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-brand-500"
        >
          <option value="all">All sources</option>
          <option value="copilot">Copilot only</option>
          <option value="custom">Custom only</option>
          <option value="none">No AI configured</option>
        </select>
        <div className="flex-1" />
        <span className="text-[10px] text-zinc-600">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-600/40 bg-brand-600/10 px-4 py-2.5">
          <UsersIcon className="h-4 w-4 text-brand-400" />
          <span className="text-sm text-zinc-200">
            <span className="font-semibold text-white">{selectedIds.size}</span> user{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
          >
            Clear
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Bulk Allocate AI / Quota
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={el => {
                    if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected;
                  }}
                  onChange={toggleAllFiltered}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 cursor-pointer"
                />
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">User</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Role / Plan</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Subscription</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Active Model</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Credits (Daily)</th>
              <th className="w-16 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const isSelf = u.user_id === currentUserId;
              const isChecked = selectedIds.has(u.user_id);
              return (
                <tr
                  key={u.user_id}
                  className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/40 cursor-pointer transition-colors ${isChecked ? "bg-brand-600/5" : ""}`}
                  onClick={() => setSelectedUser(u)}
                >
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(u.user_id)}
                      aria-label={`Select ${u.email}`}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400 shrink-0">
                        {(u.display_name ?? u.email)[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-zinc-200 truncate">{u.display_name ?? u.email.split("@")[0]}</span>
                          {u.is_platform_admin && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
                          {isSelf && <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">You</span>}
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_COLORS[u.platform_role ?? "member"] ?? "text-zinc-400"} bg-zinc-800`}>
                        {ROLE_LABELS[u.platform_role ?? "member"]}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${PLAN_COLORS[u.workspace_plan ?? "free"] ?? "text-zinc-400"} bg-zinc-800`}>
                        {PLAN_LABELS[u.workspace_plan ?? "free"]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <SourceBadge row={u} />
                  </td>
                  <td className="px-3 py-3">
                    <EffectiveModelBadge row={u} />
                  </td>
                  <td className="px-3 py-3">
                    <CreditMiniBar row={u} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedUser(u); }}
                      className="rounded p-1.5 text-zinc-500 hover:text-brand-400 hover:bg-zinc-800 transition-colors"
                      title="Manage user"
                    >
                      <ChevronDown className="h-4 w-4 -rotate-90" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-500">
                  {searchQuery ? "No users match your search." : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-red-400" /> Enforced = admin-locked model</span>
        <span className="flex items-center gap-1"><Bot className="h-3 w-3 text-emerald-400" /> User · Copilot/Custom = personal override</span>
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-blue-400" /> WS default = inheriting workspace setting</span>
        <span>Auto-select = no model configured anywhere</span>
      </div>

      {/* Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          workspaceId={workspaceId}
          accounts={accounts}
          providers={providers}
          onClose={() => setSelectedUser(null)}
          onAllocate={onAllocate}
          onReset={onReset}
          onSetCredits={onSetCredits}
          onChangeRole={onChangeRole}
          onChangePlan={onChangePlan}
        />
      )}

      {/* Bulk Allocate Modal */}
      {bulkOpen && selectedUsers.length > 0 && (
        <BulkAllocateModal
          selectedUsers={selectedUsers}
          workspaceId={workspaceId}
          accounts={accounts}
          providers={providers}
          onClose={() => setBulkOpen(false)}
          onApply={async (userIds, payload) => {
            await onBulkApply(userIds, payload);
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
