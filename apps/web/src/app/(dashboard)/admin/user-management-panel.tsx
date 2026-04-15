"use client";

import { useState } from "react";
import {
  Bot, Zap, Crown, Check, X, Loader2, RotateCcw, ChevronDown,
  Search, Shield, Sparkles,
} from "lucide-react";
import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
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

function EffectiveModelBadge({ row }: { row: UserAiAllocation }) {
  const { model, source } = getEffectiveModel(row);
  if (!model) return <span className="text-[11px] text-zinc-600">No model</span>;
  const colors = {
    enforced: "bg-red-600/15 text-red-400 border-red-600/30",
    user: "bg-emerald-600/15 text-emerald-400 border-emerald-600/30",
    workspace: "bg-blue-600/15 text-blue-400 border-blue-600/30",
    none: "bg-zinc-800 text-zinc-500 border-zinc-700",
  };
  const labels = { enforced: "Enforced", user: "Override", workspace: "Default", none: "" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${colors[source]}`}>
      <span className="font-medium">{labels[source]}</span>
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
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">Workspace default</span>;
  }
  if (side === "copilot") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-400">
        {row.copilot_account_label ?? "Copilot"}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400">
      {row.provider_label ?? row.provider_type ?? "Custom"}
    </span>
  );
}

// ─── User Detail Modal ──────────────────────────────────

function UserDetailModal({
  user,
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

  const eff = getEffectiveModel(user);
  const validAccounts = accounts.filter(a => a.is_valid);
  const validProviders = providers.filter(p => p.is_valid);

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
    setCreditSaving(true);
    try {
      await onSetCredits(user.user_id, {
        dailyCredits: creditDaily,
        monthlyCredits: creditMonthly,
        rolloverCredits: creditRollover,
        resetUsage,
      });
      if (!resetUsage) onClose();
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
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Effective Model</div>
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
              {/* Inheritance explanation */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  <strong className="text-zinc-400">How model resolution works:</strong>{" "}
                  {user.enforce_ai
                    ? <span className="text-red-400">Enforcement is ON — all users use the enforced model regardless of personal settings.</span>
                    : "User override → Workspace default → Auto-select. Set a personal override below to use a specific model for this user."
                  }
                </p>
                {eff.model && (
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Currently using: <strong className="text-white">{eff.model}</strong>
                    <span className="text-zinc-600"> ({eff.source})</span>
                  </p>
                )}
              </div>

              {/* Source toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Subscription / Provider</label>
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
                        <option value="">Default (gh CLI)</option>
                        {validAccounts.map(a => <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                      <input type="text" value={copilotModel} onChange={e => setCopilotModel(e.target.value)}
                        placeholder="e.g. claude-sonnet-4 (blank = auto)"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500" />
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
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                      <input type="text" value={providerModel} onChange={e => setProviderModel(e.target.value)}
                        placeholder="e.g. gpt-4o, meta/llama-3.3-70b-instruct"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500" />
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
                  <input type="number" min={0} value={creditDaily} onChange={e => setCreditDaily(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Monthly Credits</label>
                  <input type="number" min={0} value={creditMonthly} onChange={e => setCreditMonthly(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Rollover Credits</label>
                  <input type="number" min={0} value={creditRollover} onChange={e => setCreditRollover(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-brand-500" />
                </div>
              </div>

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

// ─── Main User Management Panel ─────────────────────────

interface UserManagementPanelProps {
  users: UserAiAllocation[];
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
}

export function UserManagementPanel({
  users, accounts, providers, loading, currentUserId,
  onAllocate, onReset, onSetCredits, onChangeRole, onChangePlan,
}: UserManagementPanelProps) {
  const [selectedUser, setSelectedUser] = useState<UserAiAllocation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<"all" | "copilot" | "custom" | "none">("all");

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

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">User</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Role / Plan</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Source</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Effective Model</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Credits (Daily)</th>
              <th className="w-16 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const isSelf = u.user_id === currentUserId;
              return (
                <tr
                  key={u.user_id}
                  className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedUser(u)}
                >
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
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                  {searchQuery ? "No users match your search." : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-red-400" /> Enforced = workspace enforcement active</span>
        <span className="flex items-center gap-1"><Bot className="h-3 w-3 text-emerald-400" /> Override = user-specific setting</span>
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-blue-400" /> Default = using workspace setting</span>
      </div>

      {/* Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
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
    </div>
  );
}
