"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformAdmin, type FeatureFlag, type AdminUser } from "@/hooks/use-platform-admin";
import { apiFetch } from "@/lib/api";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import {
  Shield,
  ToggleLeft,
  ToggleRight,
  Users,
  Settings2,
  Crown,
  Loader2,
  ArrowLeft,
  ChevronDown,
  Bot,
  RotateCcw,
  Copy,
  Check,
  X,
  ImageIcon,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_META,
  ROLE_META,
  PLAN_LABELS,
  ROLE_LABELS,
  type WorkspacePlan,
  type WorkspaceRole,
} from "@doable/shared";

// ─── Role / Plan display helpers ────────────────────────────

const PLAN_OPTIONS = [
  { value: "", label: "All plans" },
  ...WORKSPACE_PLANS.map((p, i) => ({
    value: p,
    label: i === WORKSPACE_PLANS.length - 1 ? `${PLAN_LABELS[p]} only` : `${PLAN_LABELS[p]}+`,
  })),
];

const ROLE_OPTIONS = [
  { value: "", label: "Any role" },
  ...WORKSPACE_ROLES.map((r, i) => ({
    value: r,
    label: i === WORKSPACE_ROLES.length - 1 ? `${ROLE_LABELS[r]} only` : `${ROLE_LABELS[r]}+`,
  })),
];

// ─── AI Allocation types ────────────────────────────────────

interface UserAiAllocation {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_platform_admin: boolean;
  platform_role: string | null;
  role: string | null;
  workspace_plan: string | null;
  copilot_account_id: string | null;
  copilot_account_label: string | null;
  provider_id: string | null;
  provider_label: string | null;
  provider_type: string | null;
  model: string | null;
  preference_updated_at: string | null;
}

// ─── Feature Row ────────────────────────────────────────────

function FeatureRow({
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          onClick={() => onToggle(feature.feature_key, !feature.enabled)}
          className="shrink-0"
        >
          {feature.enabled ? (
            <ToggleRight className="h-6 w-6 text-brand-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-zinc-600" />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${feature.enabled ? "text-white" : "text-zinc-500"}`}>
              {feature.label}
            </span>
            <code className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
              {feature.feature_key}
            </code>
          </div>
          {feature.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{feature.description}</p>
          )}
        </div>

        {/* Restrictions badges */}
        <div className="flex items-center gap-2 shrink-0">
          {feature.min_plan && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-400 font-medium">
              {PLAN_LABELS[feature.min_plan]}+
            </span>
          )}
          {feature.min_role && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">
              {ROLE_LABELS[feature.min_role]}+
            </span>
          )}
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min Plan:</label>
            <select
              value={feature.min_plan ?? ""}
              onChange={(e) =>
                onUpdate(feature.feature_key, { min_plan: e.target.value || null })
              }
              className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
            >
              {PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min Role:</label>
            <select
              value={feature.min_role ?? ""}
              onChange={(e) =>
                onUpdate(feature.feature_key, { min_role: e.target.value || null })
              }
              className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Allocation Status Badge ─────────────────────────────

function AiStatusBadge({ row }: { row: UserAiAllocation }) {
  const hasAllocation = !!(row.copilot_account_id || row.provider_id || row.model);
  if (!hasAllocation) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">No AI configured</span>;
  }
  if (row.copilot_account_id) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-400">
        Copilot: {row.copilot_account_label ?? "Unknown"}{row.model ? ` / ${row.model}` : ""}
      </span>
    );
  }
  if (row.provider_id) {
    const typeName = row.provider_type ? row.provider_type.charAt(0).toUpperCase() + row.provider_type.slice(1) : "Provider";
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400">
        {typeName}: {row.provider_label ?? "Unknown"}{row.model ? ` / ${row.model}` : ""}
      </span>
    );
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400">Model: {row.model}</span>;
}

// ─── Role / Plan color helpers ──────────────────────────────

const ROLE_COLORS: Record<string, string> =
  Object.fromEntries(WORKSPACE_ROLES.map((r) => [r, ROLE_META[r].color]));

const PLAN_COLORS: Record<string, string> =
  Object.fromEntries(WORKSPACE_PLANS.map((p) => [p, PLAN_META[p].color]));

// ─── User Row with AI allocation ────────────────────────────

function UserRow({
  u,
  currentUserId,
  accounts,
  providers,
  onChangeRole,
  onChangePlan,
  onAllocate,
  onReset,
}: {
  u: UserAiAllocation;
  currentUserId: string;
  accounts: Omit<ApiGitHubCopilotAccount, "workspace_id" | "added_by" | "created_at" | "updated_at">[];
  providers: Omit<ApiAiProvider, "workspace_id" | "added_by" | "created_at" | "updated_at">[];
  onChangeRole: (userId: string, role: string) => void;
  onChangePlan: (userId: string, plan: string) => void;
  onAllocate: (userId: string, data: { copilotAccountId?: string | null; providerId?: string | null; model?: string | null }) => Promise<void>;
  onReset: (userId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<"copilot" | "custom">("copilot");
  const [copilotAccountId, setCopilotAccountId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  const hasAllocation = !!(u.copilot_account_id || u.provider_id || u.model);
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);
  const isSelf = u.user_id === currentUserId;

  function startEdit() {
    if (u.provider_id) {
      setSource("custom");
      setProviderId(u.provider_id);
      setCopilotAccountId("");
    } else {
      setSource("copilot");
      setCopilotAccountId(u.copilot_account_id ?? "");
      setProviderId("");
    }
    setModel(u.model ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await onAllocate(u.user_id, {
        copilotAccountId: source === "copilot" ? (copilotAccountId || null) : null,
        providerId: source === "custom" ? (providerId || null) : null,
        model: model || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400 shrink-0">
          {(u.display_name ?? u.email)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">
              {u.display_name ?? u.email.split("@")[0]}
            </p>
            {u.is_platform_admin && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
            {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">You</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-zinc-500 truncate">{u.email}</p>
            <AiStatusBadge row={u} />
          </div>
        </div>

        {/* AI actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={startEdit}
            className="rounded p-1.5 text-zinc-500 hover:text-brand-400 hover:bg-zinc-800 transition-colors"
            title="Configure AI for this user"
          >
            <Bot className="h-4 w-4" />
          </button>
          {hasAllocation && (
            <button
              onClick={() => onReset(u.user_id)}
              className="rounded p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
              title="Reset AI allocation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Role dropdown */}
        <select
          value={u.platform_role ?? "member"}
          onChange={(e) => onChangeRole(u.user_id, e.target.value)}
          disabled={isSelf}
          className={`shrink-0 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-medium px-2 py-1.5 outline-none focus:border-brand-500 disabled:opacity-40 disabled:cursor-not-allowed ${ROLE_COLORS[u.platform_role ?? "member"] ?? "text-zinc-300"}`}
        >
          {WORKSPACE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        {/* Plan dropdown */}
        <select
          value={u.workspace_plan ?? "free"}
          onChange={(e) => onChangePlan(u.user_id, e.target.value)}
          className={`shrink-0 rounded-md bg-zinc-800 border border-zinc-700 text-xs font-medium px-2 py-1.5 outline-none focus:border-brand-500 ${PLAN_COLORS[u.workspace_plan ?? "free"] ?? "text-zinc-300"}`}
        >
          {WORKSPACE_PLANS.map((p) => (
            <option key={p} value={p}>{PLAN_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-300">
              Configure AI for {u.display_name ?? u.email}
            </p>
            <button onClick={() => setEditing(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Source toggle */}
          <div className="mb-3">
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
              <button
                onClick={() => { setSource("copilot"); setProviderId(""); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === "copilot" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                GitHub Copilot
              </button>
              <button
                onClick={() => { setSource("custom"); setCopilotAccountId(""); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === "custom" ? "bg-brand-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Custom Provider
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {source === "copilot" ? (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wider">Account</label>
                  <select
                    value={copilotAccountId}
                    onChange={(e) => setCopilotAccountId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-500"
                  >
                    <option value="">Default (gh CLI)</option>
                    {validAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. claude-sonnet-4 (blank = auto)"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wider">Provider</label>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-500"
                  >
                    <option value="">Select a provider...</option>
                    {validProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. gpt-4o"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Page ─────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    isPlatformAdmin,
    features,
    users,
    loading,
    error,
    toggleFeature,
    updateFeature,
    setUserRole,
    setUserPlan,
    bulkUpdateUsers,
  } = usePlatformAdmin();

  const { toasts, addToast, dismissToast } = useToasts();
  const [activeTab, setActiveTab] = useState<"features" | "users" | "thumbnails">("features");

  // AI allocations state
  const [allocations, setAllocations] = useState<UserAiAllocation[]>([]);
  const [accounts, setAccounts] = useState<ApiGitHubCopilotAccount[]>([]);
  const [providers, setProviders] = useState<ApiAiProvider[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCopying, setBulkCopying] = useState(false);
  // bulkResult replaced by toasts — keep for backward compat with inline display
  const bulkResult: string | null = null;
  const [bulkRole, setBulkRole] = useState("");
  const [bulkPlan, setBulkPlan] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const loadAllocations = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setAllocLoading(true);
    try {
      const res = await apiFetch<{
        data: UserAiAllocation[];
        workspaceId: string | null;
        accounts: ApiGitHubCopilotAccount[];
        providers: ApiAiProvider[];
      }>("/admin/users/ai-allocations");
      setAllocations(res.data);
      setAccounts(res.accounts ?? []);
      setProviders(res.providers ?? []);
    } catch (err) {
      console.error("Failed to load AI allocations:", err);
    } finally {
      setAllocLoading(false);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (activeTab === "users" && isPlatformAdmin) {
      loadAllocations();
    }
  }, [activeTab, isPlatformAdmin, loadAllocations]);

  async function handleAllocate(userId: string, data: { copilotAccountId?: string | null; providerId?: string | null; model?: string | null }) {
    try {
      await apiFetch(`/admin/users/${userId}/ai-allocation`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      await loadAllocations();
      addToast("success", "AI settings saved");
    } catch {
      addToast("error", "Failed to save AI settings");
    }
  }

  async function handleReset(userId: string) {
    try {
      await apiFetch(`/admin/users/${userId}/ai-allocation`, { method: "DELETE" });
      await loadAllocations();
      addToast("success", "AI settings reset");
    } catch {
      addToast("error", "Failed to reset AI settings");
    }
  }

  async function handleBulkCopy() {
    if (selectedIds.size === 0) return;
    setBulkCopying(true);
    try {
      const res = await apiFetch<{ data: { updated: number } }>("/admin/users/ai-allocations/copy-my-settings", {
        method: "POST",
        body: JSON.stringify({ targetUserIds: Array.from(selectedIds) }),
      });
      addToast("success", `AI settings copied to ${res.data.updated} user${res.data.updated !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      await loadAllocations();
    } catch {
      addToast("error", "Failed to copy AI settings");
    } finally {
      setBulkCopying(false);
    }
  }

  async function handleBulkRolePlan() {
    if (selectedIds.size === 0 || (!bulkRole && !bulkPlan)) return;
    setBulkUpdating(true);
    try {
      await bulkUpdateUsers(
        Array.from(selectedIds),
        { ...(bulkRole ? { role: bulkRole } : {}), ...(bulkPlan ? { plan: bulkPlan } : {}) }
      );
      const parts: string[] = [];
      if (bulkRole) parts.push(`role → ${ROLE_LABELS[bulkRole]}`);
      if (bulkPlan) parts.push(`plan → ${PLAN_LABELS[bulkPlan]}`);
      addToast("success", `Updated ${selectedIds.size} user${selectedIds.size !== 1 ? "s" : ""}: ${parts.join(", ")}`);
      setSelectedIds(new Set());
      setBulkRole("");
      setBulkPlan("");
      await loadAllocations();
    } catch {
      addToast("error", "Bulk update failed");
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleChangeRole(userId: string, role: string) {
    // Optimistic update — instant UI feedback
    const prev = allocations;
    setAllocations((a) => a.map((u) =>
      u.user_id === userId ? { ...u, platform_role: role, is_platform_admin: role === "admin" || role === "owner" } : u
    ));
    try {
      await setUserRole(userId, role);
      const name = prev.find((u) => u.user_id === userId)?.display_name ?? "User";
      addToast("success", `${name} → ${ROLE_LABELS[role]}`);
    } catch {
      setAllocations(prev); // Revert on error
      addToast("error", "Failed to update role");
    }
  }

  async function handleChangePlan(userId: string, plan: string) {
    // Optimistic update — instant UI feedback
    const prev = allocations;
    setAllocations((a) => a.map((u) =>
      u.user_id === userId ? { ...u, workspace_plan: plan } : u
    ));
    try {
      await setUserPlan(userId, plan);
      const name = prev.find((u) => u.user_id === userId)?.display_name ?? "User";
      addToast("success", `${name} → ${PLAN_LABELS[plan]} plan`);
    } catch {
      setAllocations(prev); // Revert on error
      addToast("error", "Failed to update plan");
    }
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // Redirect non-admins
  if (!loading && !isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-300">Access Denied</h2>
        <p className="text-sm text-zinc-500">Platform admin access required.</p>
        <Button
          onClick={() => router.push("/dashboard")}
          className="bg-brand-600 text-white hover:bg-brand-500"
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // Merge users with allocations for display
  const displayUsers: UserAiAllocation[] = allocations.length > 0
    ? allocations
    : users.map((u) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.display_name,
        avatar_url: null,
        is_platform_admin: u.is_platform_admin,
        platform_role: u.platform_role ?? "member",
        role: null,
        workspace_plan: null,
        copilot_account_id: null,
        copilot_account_label: null,
        provider_id: null,
        provider_label: null,
        provider_type: null,
        model: null,
        preference_updated_at: null,
      }));

  const allSelectableIds = displayUsers
    .filter((u) => u.user_id !== user?.id)
    .map((u) => u.user_id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.has(id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Shield className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">System Administration</h1>
            <p className="text-sm text-zinc-500">Manage platform features, users, and access controls</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-px">
        {[
          { key: "features" as const, label: "Feature Flags", icon: Settings2 },
          { key: "users" as const, label: "Users", icon: Users },
          { key: "thumbnails" as const, label: "Thumbnails", icon: ImageIcon },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? "text-white border-b-2 border-brand-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Feature Flags Tab */}
      {activeTab === "features" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-4">
            Toggle features on/off globally. Set minimum plan or workspace role requirements. Per-user overrides coming soon.
          </p>
          {features.map((f) => (
            <FeatureRow
              key={f.feature_key}
              feature={f}
              onToggle={toggleFeature}
              onUpdate={updateFeature}
            />
          ))}
          {features.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">
              No feature flags configured. Run the migration to seed defaults.
            </p>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Manage users, roles, plans, and AI model allocations. Click the <Bot className="inline h-3 w-3 text-zinc-400" /> icon to configure AI for any user.
            </p>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-600/30 bg-brand-600/5 px-4 py-2.5">
              <span className="text-xs font-medium text-zinc-300">{selectedIds.size} selected</span>

              {/* Bulk role */}
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value)}
                  className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
                >
                  <option value="">Set role...</option>
                  {WORKSPACE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {/* Bulk plan */}
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                  className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
                >
                  <option value="">Set plan...</option>
                  {WORKSPACE_PLANS.map((p) => (
                    <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              {/* Apply bulk changes */}
              {(bulkRole || bulkPlan) && (
                <button
                  onClick={handleBulkRolePlan}
                  disabled={bulkUpdating}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Apply
                </button>
              )}

              <div className="h-4 w-px bg-zinc-700" />

              {/* Bulk AI copy */}
              <button
                onClick={handleBulkCopy}
                disabled={bulkCopying}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                {bulkCopying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                Copy My AI Settings
              </button>

              <button
                onClick={() => { setSelectedIds(new Set()); setBulkRole(""); setBulkPlan(""); }}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Clear
              </button>
            </div>
          )}

          {bulkResult && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-4 py-2">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-300">{bulkResult}</span>
            </div>
          )}

          {allocLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Select All header */}
              {displayUsers.length > 1 && (
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(allSelectableIds));
                      }
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                  />
                  <span className="text-[11px] text-zinc-500">
                    {allSelected ? "Deselect all" : "Select all"}
                  </span>
                  <div className="flex-1" />
                  <span className="text-[10px] text-zinc-600">{displayUsers.length} users</span>
                </div>
              )}
              {displayUsers.map((u) => (
                <div key={u.user_id} className="flex items-start gap-2">
                  <div className="pt-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.user_id)}
                      onChange={() => toggleSelect(u.user_id)}
                      className="rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                    />
                  </div>
                  <div className="flex-1">
                    <UserRow
                      u={u}
                      currentUserId={user?.id ?? ""}
                      accounts={accounts}
                      providers={providers}
                      onChangeRole={handleChangeRole}
                      onChangePlan={handleChangePlan}
                      onAllocate={handleAllocate}
                      onReset={handleReset}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Thumbnails Tab */}
      {activeTab === "thumbnails" && (
        <ThumbnailsPanel />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ─── Thumbnails Panel ────────────────────────────────────────

interface ThumbnailLog {
  id: string;
  project_id: string;
  project_name: string | null;
  current_project_name: string | null;
  status: string;
  preview_url: string | null;
  error_message: string | null;
  duration_ms: number | null;
  triggered_by: string;
  created_at: string;
}

interface GenerateResult {
  total: number;
  missing: number;
  queued: number;
  message: string;
}

function ThumbnailsPanel() {
  const [logs, setLogs] = useState<ThumbnailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: ThumbnailLog[] }>("/admin/thumbnail-logs?limit=100");
      setLogs(res.data);
    } catch (e) {
      console.error("Failed to fetch thumbnail logs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleGenerateMissing = useCallback(async () => {
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiFetch<{ data: GenerateResult }>("/admin/thumbnails/generate-missing", { method: "POST" });
      setResult(res.data);
      // Refresh logs after a delay to show new entries
      setTimeout(() => fetchLogs(), 3000);
    } catch (e) {
      console.error("Failed to generate thumbnails:", e);
    } finally {
      setGenerating(false);
    }
  }, [fetchLogs]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "skipped": return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500">
            Generate missing project thumbnails and view the generation log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGenerateMissing}
            disabled={generating}
            className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              <><Play className="h-4 w-4" /> Generate Missing Thumbnails</>
            )}
          </Button>
          <Button
            onClick={fetchLogs}
            variant="outline"
            className="gap-2 text-sm border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-brand-800/50 bg-brand-900/20 px-4 py-3 text-sm">
          <p className="text-brand-300 font-medium">{result.message}</p>
          <p className="text-zinc-500 text-xs mt-1">
            Total projects: {result.total} | Missing: {result.missing} | Queued: {result.queued}
          </p>
        </div>
      )}

      {/* Logs table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="bg-zinc-900/50 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Generation Log</h3>
          <span className="text-xs text-zinc-600">{logs.length} entries</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-zinc-600">
            No thumbnail generation logs yet. Click "Generate Missing Thumbnails" to start.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50 max-h-[500px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-zinc-900/30">
                {statusIcon(log.status)}
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-200 font-medium truncate block">
                    {log.current_project_name ?? log.project_name ?? log.project_id.slice(0, 8)}
                  </span>
                  {log.error_message && (
                    <span className="text-xs text-red-400 truncate block">{log.error_message}</span>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  log.triggered_by === "admin" ? "bg-purple-900/30 text-purple-400" :
                  log.triggered_by === "regenerate" ? "bg-blue-900/30 text-blue-400" :
                  "bg-zinc-800 text-zinc-500"
                }`}>
                  {log.triggered_by}
                </span>
                {log.duration_ms != null && (
                  <span className="text-xs text-zinc-600">{log.duration_ms}ms</span>
                )}
                <span className="text-xs text-zinc-600 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
