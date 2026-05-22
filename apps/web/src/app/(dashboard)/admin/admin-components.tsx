"use client";

import { useState } from "react";
import {
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Crown,
  Bot,
  RotateCcw,
  Check,
  X,
  Loader2,
  Zap,
} from "lucide-react";
import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import type { FeatureFlag } from "@/hooks/use-platform-admin";
import {
  type UserAiAllocation,
  rowActiveSide,
  rowActiveModel,
  rowHasAllocation,
  PLAN_OPTIONS,
  ROLE_OPTIONS,
  ROLE_COLORS,
  PLAN_COLORS,
} from "./admin-shared";

// ─── Feature Row ────────────────────────────────────────────

export function FeatureRow({
  feature,
  onToggle,
  onUpdate,
}: {
  feature: FeatureFlag;
  onToggle: (key: string, enabled: boolean) => void;
  onUpdate: (key: string, data: Partial<Pick<FeatureFlag, "enabled" | "min_plan" | "min_role">>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onToggle(feature.feature_key, !feature.enabled)} className="shrink-0">
          {feature.enabled ? <ToggleRight className="h-6 w-6 text-brand-500" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${feature.enabled ? "text-foreground" : "text-muted-foreground"}`}>{feature.label}</span>
            <code className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{feature.feature_key}</code>
          </div>
          {feature.description && <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {feature.min_plan && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 border border-brand-600 text-brand-700 font-semibold dark:bg-brand-600/20 dark:border-transparent dark:text-brand-400 dark:font-medium">{PLAN_LABELS[feature.min_plan]}+</span>}
          {feature.min_role && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-600 text-amber-800 font-semibold dark:bg-amber-600/20 dark:border-transparent dark:text-amber-400 dark:font-medium">{ROLE_LABELS[feature.min_role]}+</span>}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Min Plan:</label>
            <select value={feature.min_plan ?? ""} onChange={(e) => onUpdate(feature.feature_key, { min_plan: e.target.value || null })} className="rounded-md bg-background border border-input text-xs text-foreground px-2 py-1 outline-none focus:border-brand-500">
              {PLAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Min Role:</label>
            <select value={feature.min_role ?? ""} onChange={(e) => onUpdate(feature.feature_key, { min_role: e.target.value || null })} className="rounded-md bg-background border border-input text-xs text-foreground px-2 py-1 outline-none focus:border-brand-500">
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Allocation Status Badge ─────────────────────────────

export function AiStatusBadge({ row }: { row: UserAiAllocation }) {
  if (!rowHasAllocation(row)) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">No AI configured</span>;
  }
  const side = rowActiveSide(row);
  const activeModel = rowActiveModel(row);
  if (side === "copilot" && row.copilot_account_id) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-400">
        Copilot: {row.copilot_account_label ?? "Unknown"}{activeModel ? ` / ${activeModel}` : ""}
      </span>
    );
  }
  if (side === "custom" && row.provider_id) {
    const typeName = row.provider_type ? row.provider_type.charAt(0).toUpperCase() + row.provider_type.slice(1) : "Provider";
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400">
        {typeName}: {row.provider_label ?? "Unknown"}{activeModel ? ` / ${activeModel}` : ""}
      </span>
    );
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">Configured</span>;
}

// ─── User Row with AI allocation ────────────────────────────

export function UserRow({
  u,
  currentUserId,
  accounts,
  providers,
  onChangeRole,
  onChangePlan,
  onAllocate,
  onReset,
  onGetCredits,
  onSetCredits,
}: {
  u: UserAiAllocation;
  currentUserId: string;
  accounts: Omit<ApiGitHubCopilotAccount, "workspace_id" | "added_by" | "created_at" | "updated_at">[];
  providers: Omit<ApiAiProvider, "workspace_id" | "added_by" | "created_at" | "updated_at">[];
  onChangeRole: (userId: string, role: string) => void;
  onChangePlan: (userId: string, plan: string) => void;
  onAllocate: (userId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
  }) => Promise<void>;
  onReset: (userId: string) => Promise<void>;
  onGetCredits: (userId: string) => Promise<{ daily_total: number; daily_remaining: number; monthly_total: number; monthly_remaining: number; rollover_credits: number }>;
  onSetCredits: (userId: string, data: { dailyCredits?: number; monthlyCredits?: number; rolloverCredits?: number; resetUsage?: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<"copilot" | "custom">("copilot");
  const [copilotAccountId, setCopilotAccountId] = useState("");
  const [copilotModel, setCopilotModel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingCredits, setEditingCredits] = useState(false);
  const [creditDaily, setCreditDaily] = useState(0);
  const [creditMonthly, setCreditMonthly] = useState(0);
  const [creditRollover, setCreditRollover] = useState(0);
  const [creditDailyUsed, setCreditDailyUsed] = useState(0);
  const [creditMonthlyUsed, setCreditMonthlyUsed] = useState(0);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditSaving, setCreditSaving] = useState(false);

  const hasAllocation = rowHasAllocation(u);
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);
  const isSelf = u.user_id === currentUserId;

  function startEdit() {
    setSource(rowActiveSide(u) ?? "copilot");
    setCopilotAccountId(u.copilot_account_id ?? "");
    setCopilotModel(u.copilot_model ?? "");
    setProviderId(u.provider_id ?? "");
    setProviderModel(u.provider_model ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await onAllocate(u.user_id, { source, copilotAccountId: copilotAccountId || null, copilotModel: copilotModel || null, providerId: providerId || null, providerModel: providerModel || null });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function startEditCredits() {
    setCreditLoading(true);
    setEditingCredits(true);
    try {
      const res = await onGetCredits(u.user_id);
      setCreditDaily(res.daily_total);
      setCreditMonthly(res.monthly_total);
      setCreditRollover(res.rollover_credits);
      setCreditDailyUsed(res.daily_total - res.daily_remaining);
      setCreditMonthlyUsed(res.monthly_total - res.monthly_remaining);
    } catch {
      setCreditDaily(0); setCreditMonthly(0); setCreditRollover(0); setCreditDailyUsed(0); setCreditMonthlyUsed(0);
    } finally {
      setCreditLoading(false);
    }
  }

  async function saveCredits(resetUsage = false) {
    setCreditSaving(true);
    try {
      await onSetCredits(u.user_id, { dailyCredits: creditDaily, monthlyCredits: creditMonthly, rolloverCredits: creditRollover, resetUsage });
      if (resetUsage) { setCreditDailyUsed(0); setCreditMonthlyUsed(0); }
      if (!resetUsage) setEditingCredits(false);
    } finally {
      setCreditSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground shrink-0">
          {(u.display_name ?? u.email)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{u.display_name ?? u.email.split("@")[0]}</p>
            {u.is_platform_admin && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
            {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">You</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            <AiStatusBadge row={u} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={startEditCredits} className="rounded p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-accent transition-colors" title="Manage credits"><Zap className="h-4 w-4" /></button>
          <button onClick={startEdit} className="rounded p-1.5 text-muted-foreground hover:text-brand-400 hover:bg-accent transition-colors" title="Configure AI for this user"><Bot className="h-4 w-4" /></button>
          {hasAllocation && (
            <button onClick={() => onReset(u.user_id)} className="rounded p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-accent transition-colors" title="Reset AI allocation"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
        </div>
        <select value={u.platform_role ?? "member"} onChange={(e) => onChangeRole(u.user_id, e.target.value)} disabled={isSelf} className={`shrink-0 rounded-md bg-background border border-input text-xs font-medium px-2 py-1.5 outline-none focus:border-brand-500 disabled:opacity-40 disabled:cursor-not-allowed ${ROLE_COLORS[u.platform_role ?? "member"] ?? "text-foreground"}`}>
          {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select value={u.workspace_plan ?? "free"} onChange={(e) => onChangePlan(u.user_id, e.target.value)} className={`shrink-0 rounded-md bg-background border border-input text-xs font-medium px-2 py-1.5 outline-none focus:border-brand-500 ${PLAN_COLORS[u.workspace_plan ?? "free"] ?? "text-foreground"}`}>
          {WORKSPACE_PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div className="border-t border-border px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-foreground">Configure AI for {u.display_name ?? u.email}</p>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mb-3">
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              <button onClick={() => setSource("copilot")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${source === "copilot" ? "bg-brand-600 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>GitHub Copilot</button>
              <button onClick={() => setSource("custom")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${source === "custom" ? "bg-brand-600 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>Custom Provider</button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Both configurations are saved. The selected tab is what this user will use.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {source === "copilot" ? (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Account</label>
                  <select value={copilotAccountId} onChange={(e) => setCopilotAccountId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-500">
                    <option value="">Default (gh CLI)</option>
                    {validAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Model</label>
                  <input type="text" value={copilotModel} onChange={(e) => setCopilotModel(e.target.value)} placeholder="e.g. claude-sonnet-4 (blank = auto)" className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Provider</label>
                  <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-500">
                    <option value="">Select a provider...</option>
                    {validProviders.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Model</label>
                  <input type="text" value={providerModel} onChange={(e) => setProviderModel(e.target.value)} placeholder="e.g. gpt-4o" className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Credits edit panel */}
      {editingCredits && (
        <div className="border-t border-border px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-foreground"><Zap className="inline h-3.5 w-3.5 text-emerald-400 mr-1" />Credits for {u.display_name ?? u.email}</p>
            <button onClick={() => setEditingCredits(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
          {creditLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="flex gap-3 mb-3 text-[11px]">
                <span className="text-muted-foreground">Daily used: <span className="text-foreground">{creditDailyUsed}/{creditDaily}</span></span>
                <span className="text-muted-foreground">Monthly used: <span className="text-foreground">{creditMonthlyUsed}/{creditMonthly}</span></span>
                <span className="text-muted-foreground">Rollover: <span className="text-foreground">{creditRollover}</span></span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Daily Credits</label>
                  <input type="number" min={0} value={creditDaily} onChange={(e) => setCreditDaily(Number(e.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Monthly Credits</label>
                  <input type="number" min={0} value={creditMonthly} onChange={(e) => setCreditMonthly(Number(e.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Rollover Credits</label>
                  <input type="number" min={0} value={creditRollover} onChange={(e) => setCreditRollover(Number(e.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => saveCredits(false)} disabled={creditSaving} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                  {creditSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save Credits
                </button>
                <button onClick={() => saveCredits(true)} disabled={creditSaving} className="flex items-center gap-1.5 rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors" title="Save credits and reset daily/monthly usage to 0">
                  <RotateCcw className="h-3 w-3" /> Save &amp; Reset Usage
                </button>
                <button onClick={() => setEditingCredits(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
