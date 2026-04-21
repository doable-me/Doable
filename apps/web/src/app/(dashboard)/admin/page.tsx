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
  ImageIcon,
  Activity,
  Mail,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import {
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { UserAiAllocation } from "./admin-shared";
import { FeatureRow } from "./admin-components";
import { ThumbnailsPanel, CopilotSessionsPanel } from "./admin-panels";
import { EmailPanel } from "./email-panel";
import { UserManagementPanel } from "./user-management-panel";
import { ToolsConfigPanel } from "./tools-config-panel";

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
    setUserCredits,
  } = usePlatformAdmin();

  const { toasts, addToast, dismissToast } = useToasts();
  const [activeTab, setActiveTab] = useState<"features" | "users" | "tools" | "thumbnails" | "copilot" | "email">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "email" || tab === "features" || tab === "users" || tab === "tools" || tab === "thumbnails" || tab === "copilot") return tab;
    }
    return "features";
  });

  // AI allocations state
  const [allocations, setAllocations] = useState<UserAiAllocation[]>([]);
  const [accounts, setAccounts] = useState<ApiGitHubCopilotAccount[]>([]);
  const [providers, setProviders] = useState<ApiAiProvider[]>([]);
  const [adminWorkspaceId, setAdminWorkspaceId] = useState<string | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);

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
      setAdminWorkspaceId(res.workspaceId ?? null);
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
        daily_credits: null, daily_credits_used: null, monthly_credits: null,
        monthly_credits_used: null, rollover_credits: null, enforce_ai: null,
        enforced_model: null, default_source: null, default_copilot_model: null,
        default_provider_model: null, ws_default_copilot_account_id: null, ws_default_provider_id: null,
      }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
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
            <p className="text-sm text-zinc-500">Manage platform features, users, AI tools, and access controls</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-px overflow-x-auto">
        {([
          { key: "features" as const, label: "Feature Flags", icon: Settings2 },
          { key: "users" as const, label: "Users & AI", icon: Users },
          { key: "tools" as const, label: "AI Tools", icon: Wrench },
          { key: "thumbnails" as const, label: "Thumbnails", icon: ImageIcon },
          { key: "copilot" as const, label: "Sessions", icon: Activity },
          { key: "email" as const, label: "Email", icon: Mail },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
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
          <p className="text-xs text-zinc-500 mb-4">Toggle features on/off globally. Set minimum plan or workspace role requirements.</p>
          {features.map((f) => (
            <FeatureRow key={f.feature_key} feature={f} onToggle={toggleFeature} onUpdate={updateFeature} />
          ))}
          {features.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">No feature flags configured.</p>
          )}
        </div>
      )}

      {/* Users & AI Tab — New comprehensive panel */}
      {activeTab === "users" && (
        <UserManagementPanel
          users={displayUsers}
          workspaceId={adminWorkspaceId}
          accounts={accounts}
          providers={providers}
          loading={allocLoading}
          currentUserId={user?.id ?? ""}
          onAllocate={handleAllocate}
          onReset={handleReset}
          onSetCredits={async (userId, data) => {
            await setUserCredits(userId, data);
            const name = allocations.find((a) => a.user_id === userId)?.display_name ?? "User";
            addToast("success", `Credits updated for ${name}`);
            await loadAllocations();
          }}
          onChangeRole={handleChangeRole}
          onChangePlan={handleChangePlan}
        />
      )}

      {/* AI Tools Tab */}
      {activeTab === "tools" && <ToolsConfigPanel />}

      {activeTab === "thumbnails" && <ThumbnailsPanel />}
      {activeTab === "copilot" && <CopilotSessionsPanel />}
      {activeTab === "email" && <EmailPanel />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
