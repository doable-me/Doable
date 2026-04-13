"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { apiFetch } from "@/lib/api";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import {
  Shield,
  Users,
  Settings2,
  Loader2,
  ArrowLeft,
  Bot,
  Copy,
  Check,
  ImageIcon,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { UserAiAllocation } from "./admin-shared";
import { FeatureRow, UserRow } from "./admin-components";
import { ThumbnailsPanel, CopilotSessionsPanel } from "./admin-panels";

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
    getUserCredits,
    setUserCredits,
    bulkUpdateUsers,
  } = usePlatformAdmin();

  const { toasts, addToast, dismissToast } = useToasts();
  const [activeTab, setActiveTab] = useState<"features" | "users" | "thumbnails" | "copilot">("features");

  // AI allocations state
  const [allocations, setAllocations] = useState<UserAiAllocation[]>([]);
  const [accounts, setAccounts] = useState<ApiGitHubCopilotAccount[]>([]);
  const [providers, setProviders] = useState<ApiAiProvider[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCopying, setBulkCopying] = useState(false);
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

  async function handleAllocate(userId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
  }) {
    try {
      await apiFetch(`/admin/users/${userId}/ai-allocation`, { method: "PUT", body: JSON.stringify(data) });
      await loadAllocations();
      addToast("success", "AI settings saved");
    } catch { addToast("error", "Failed to save AI settings"); }
  }

  async function handleReset(userId: string) {
    try {
      await apiFetch(`/admin/users/${userId}/ai-allocation`, { method: "DELETE" });
      await loadAllocations();
      addToast("success", "AI settings reset");
    } catch { addToast("error", "Failed to reset AI settings"); }
  }

  async function handleBulkCopy() {
    if (selectedIds.size === 0) return;
    setBulkCopying(true);
    try {
      const res = await apiFetch<{ data: { updated: number } }>("/admin/users/ai-allocations/copy-my-settings", {
        method: "POST", body: JSON.stringify({ targetUserIds: Array.from(selectedIds) }),
      });
      addToast("success", `AI settings copied to ${res.data.updated} user${res.data.updated !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      await loadAllocations();
    } catch { addToast("error", "Failed to copy AI settings"); }
    finally { setBulkCopying(false); }
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
    } catch { addToast("error", "Bulk update failed"); }
    finally { setBulkUpdating(false); }
  }

  async function handleChangeRole(userId: string, role: string) {
    const prev = allocations;
    setAllocations((a) => a.map((u) =>
      u.user_id === userId ? { ...u, platform_role: role, is_platform_admin: role === "admin" || role === "owner" } : u
    ));
    try {
      await setUserRole(userId, role);
      const name = prev.find((u) => u.user_id === userId)?.display_name ?? "User";
      addToast("success", `${name} → ${ROLE_LABELS[role]}`);
    } catch { setAllocations(prev); addToast("error", "Failed to update role"); }
  }

  async function handleChangePlan(userId: string, plan: string) {
    const prev = allocations;
    setAllocations((a) => a.map((u) =>
      u.user_id === userId ? { ...u, workspace_plan: plan } : u
    ));
    try {
      await setUserPlan(userId, plan);
      const name = prev.find((u) => u.user_id === userId)?.display_name ?? "User";
      addToast("success", `${name} → ${PLAN_LABELS[plan]} plan`);
    } catch { setAllocations(prev); addToast("error", "Failed to update plan"); }
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
        <Button onClick={() => router.push("/dashboard")} className="bg-brand-600 text-white hover:bg-brand-500">Back to Dashboard</Button>
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

  const displayUsers: UserAiAllocation[] = allocations.length > 0
    ? allocations
    : users.map((u) => ({
        user_id: u.id, email: u.email, display_name: u.display_name, avatar_url: null,
        is_platform_admin: u.is_platform_admin, platform_role: u.platform_role ?? "member",
        role: null, workspace_plan: null, source: null, copilot_account_id: null,
        copilot_account_label: null, copilot_model: null, provider_id: null, provider_label: null,
        provider_type: null, provider_model: null, model: null, preference_updated_at: null,
      }));

  const allSelectableIds = displayUsers.filter((u) => u.user_id !== user?.id).map((u) => u.user_id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.has(id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => router.push("/dashboard")} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
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
        {([
          { key: "features" as const, label: "Feature Flags", icon: Settings2 },
          { key: "users" as const, label: "Users", icon: Users },
          { key: "thumbnails" as const, label: "Thumbnails", icon: ImageIcon },
          { key: "copilot" as const, label: "Copilot Sessions", icon: Activity },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key ? "text-white border-b-2 border-brand-500" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {/* Feature Flags Tab */}
      {activeTab === "features" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-4">Toggle features on/off globally. Set minimum plan or workspace role requirements. Per-user overrides coming soon.</p>
          {features.map((f) => (
            <FeatureRow key={f.feature_key} feature={f} onToggle={toggleFeature} onUpdate={updateFeature} />
          ))}
          {features.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">No feature flags configured. Run the migration to seed defaults.</p>
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

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-600/30 bg-brand-600/5 px-4 py-2.5">
              <span className="text-xs font-medium text-zinc-300">{selectedIds.size} selected</span>
              <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500">
                <option value="">Set role...</option>
                {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <select value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value)} className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500">
                <option value="">Set plan...</option>
                {WORKSPACE_PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
              </select>
              {(bulkRole || bulkPlan) && (
                <button onClick={handleBulkRolePlan} disabled={bulkUpdating} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors">
                  {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Apply
                </button>
              )}
              <div className="h-4 w-px bg-zinc-700" />
              <button onClick={handleBulkCopy} disabled={bulkCopying} className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 transition-colors">
                {bulkCopying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} Copy My AI Settings
              </button>
              <button onClick={() => { setSelectedIds(new Set()); setBulkRole(""); setBulkPlan(""); }} className="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>
            </div>
          )}

          {bulkResult && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-4 py-2">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-300">{bulkResult}</span>
            </div>
          )}

          {allocLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
          ) : (
            <div className="space-y-1">
              {displayUsers.length > 1 && (
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <input type="checkbox" checked={allSelected} onChange={() => { if (allSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(allSelectableIds)); }} className="rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0" />
                  <span className="text-[11px] text-zinc-500">{allSelected ? "Deselect all" : "Select all"}</span>
                  <div className="flex-1" />
                  <span className="text-[10px] text-zinc-600">{displayUsers.length} users</span>
                </div>
              )}
              {displayUsers.map((u) => (
                <div key={u.user_id} className="flex items-start gap-2">
                  <div className="pt-3.5">
                    <input type="checkbox" checked={selectedIds.has(u.user_id)} onChange={() => toggleSelect(u.user_id)} className="rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0" />
                  </div>
                  <div className="flex-1">
                    <UserRow
                      u={u} currentUserId={user?.id ?? ""} accounts={accounts} providers={providers}
                      onChangeRole={handleChangeRole} onChangePlan={handleChangePlan}
                      onAllocate={handleAllocate} onReset={handleReset} onGetCredits={getUserCredits}
                      onSetCredits={async (userId, data) => {
                        await setUserCredits(userId, data);
                        const name = allocations.find((a) => a.user_id === userId)?.display_name ?? "User";
                        addToast("success", `Credits updated for ${name}`);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "thumbnails" && <ThumbnailsPanel />}
      {activeTab === "copilot" && <CopilotSessionsPanel />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
