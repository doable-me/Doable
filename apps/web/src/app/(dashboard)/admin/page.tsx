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
  ShieldCheck,
  Plug,
  CreditCard,
  UserCheck,
  Globe,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import {
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";
import type { UserAiAllocation } from "./admin-shared";
import { getCreditSummary } from "./admin-shared";
import { FeatureRow } from "./admin-components";
import { ThumbnailsPanel, CopilotSessionsPanel } from "./admin-panels";
import { EmailPanel } from "./email-panel";
import { UserManagementPanel, type BulkApplyPayload } from "./user-management-panel";
import { ToolsConfigPanel } from "./tools-config-panel";
import { PlanDefaultsPanel } from "./plan-defaults-panel";
import { PlanLimitsPanel } from "./plan-limits-panel";
import { EmbeddingProviderPanel } from "./embedding-provider-panel";
import { IntegrationsAdminPanel } from "@/modules/integrations/integrations-admin-panel";
import { FrameworksPanel } from "./frameworks-panel";
import { AdminMfaPanel } from "./mfa-panel";
import { SignupsPanel } from "./signups-panel";
import { DnsConfigPanel } from "./dns-config-panel";

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
    bulkUpdateUsers,
  } = usePlatformAdmin();

  const { toasts, addToast, dismissToast } = useToasts();
  const [activeTab, setActiveTab] = useState<"features" | "users" | "tools" | "plans" | "thumbnails" | "copilot" | "email" | "integrations" | "mfa" | "signups" | "dns">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "email" || tab === "features" || tab === "users" || tab === "tools" || tab === "plans" || tab === "thumbnails" || tab === "copilot" || tab === "integrations" || tab === "mfa" || tab === "signups" || tab === "dns") return tab;
      // Legacy redirects
      if (tab === "planLimits" || tab === "planDefaults") return "plans";
    }
    return "features";
  });
  const [plansSubTab, setPlansSubTab] = useState<"limits" | "defaults" | "embedding">("limits");

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

  async function handleBulkApply(userIds: string[], payload: BulkApplyPayload) {
    let modelOk = 0, modelFail = 0, quotaOk = 0, quotaFail = 0;
    let roleUpdated = 0, planUpdated = 0;
    let rolePlanFailed = false;

    // Build a quick lookup for existing credit totals
    const byId = new Map(allocations.map((a) => [a.user_id, a]));

    for (const userId of userIds) {
      if (payload.model) {
        try {
          await apiFetch(`/admin/users/${userId}/ai-allocation`, {
            method: "PUT",
            body: JSON.stringify(payload.model),
          });
          modelOk++;
        } catch { modelFail++; }
      }
      if (payload.addQuota) {
        const row = byId.get(userId);
        const c = row ? getCreditSummary(row) : { dailyTotal: 0, monthlyTotal: 0, rollover: 0 };
        try {
          await apiFetch(`/admin/users/${userId}/credits`, {
            method: "PATCH",
            body: JSON.stringify({
              dailyCredits: c.dailyTotal + payload.addQuota.daily,
              monthlyCredits: c.monthlyTotal + payload.addQuota.monthly,
              rolloverCredits: c.rollover + payload.addQuota.rollover,
            }),
          });
          quotaOk++;
        } catch { quotaFail++; }
      }
    }

    if (payload.role || payload.plan) {
      try {
        const res = await bulkUpdateUsers(userIds, { role: payload.role, plan: payload.plan }) as { data?: { roleUpdated?: number; planUpdated?: number } };
        roleUpdated = res?.data?.roleUpdated ?? 0;
        planUpdated = res?.data?.planUpdated ?? 0;
      } catch {
        rolePlanFailed = true;
      }
    }

    await loadAllocations();

    const parts: string[] = [];
    if (payload.model) parts.push(`model: ${modelOk} ok${modelFail ? `, ${modelFail} failed` : ""}`);
    if (payload.addQuota) parts.push(`quota: ${quotaOk} ok${quotaFail ? `, ${quotaFail} failed` : ""}`);
    if (payload.role) parts.push(rolePlanFailed ? `role: failed` : `role: ${roleUpdated} updated`);
    if (payload.plan) parts.push(rolePlanFailed ? `plan: failed` : `plan: ${planUpdated} updated`);
    const allFailed =
      (payload.model && modelOk === 0 && modelFail > 0) ||
      (payload.addQuota && quotaOk === 0 && quotaFail > 0) ||
      ((payload.role || payload.plan) && rolePlanFailed && !payload.model && !payload.addQuota);
    addToast(allFailed ? "error" : "success", `Bulk applied to ${userIds.length} users — ${parts.join(" · ")}`);
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
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground">Platform admin access required.</p>
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
        <button onClick={() => router.push("/dashboard")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Shield className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">System Administration</h1>
            <p className="text-sm text-muted-foreground">Manage platform features, users, AI tools, and access controls</p>
          </div>
          <Link
            href="/admin/projects"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            title="All projects (drafts + published) with framework, owner, chat activity"
          >
            <Activity className="h-3.5 w-3.5 text-brand-400" />
            Projects
          </Link>
          <Link
            href="/admin/runtime"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            title="Published apps + live dev servers — CPU, memory, uptime, controls"
          >
            <Activity className="h-3.5 w-3.5 text-brand-400" />
            Runtime
          </Link>
          <Link
            href="/admin/chat"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            title="All AI chat sessions (redacted, audit-logged) — for training & abuse review"
          >
            <Activity className="h-3.5 w-3.5 text-brand-400" />
            Chat
          </Link>
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            title="Prompt & conversation audit (enterprise)"
          >
            <Activity className="h-3.5 w-3.5 text-brand-400" />
            Audit
          </Link>
          <Link
            href="/admin/moderation"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            title="Marketplace moderation queue & reports"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
            Moderation
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border pb-px overflow-x-auto">
        {([
          { key: "features" as const, label: "Feature Flags", icon: Settings2 },
          { key: "dns" as const, label: "DNS", icon: Globe },
          { key: "signups" as const, label: "Signups", icon: UserCheck },
          { key: "users" as const, label: "Users & AI", icon: Users },
          { key: "integrations" as const, label: "Integrations", icon: Plug },
          { key: "plans" as const, label: "Plans", icon: CreditCard },
          { key: "tools" as const, label: "AI Tools", icon: Wrench },
          { key: "mfa" as const, label: "MFA", icon: ShieldCheck },
          { key: "thumbnails" as const, label: "Thumbnails", icon: ImageIcon },
          { key: "copilot" as const, label: "Sessions", icon: Activity },
          { key: "email" as const, label: "Email", icon: Mail },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.key ? "text-foreground border-b-2 border-brand-500" : "text-muted-foreground hover:text-foreground"
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
        <div className="space-y-6">
          {/* Framework Controls */}
          <FrameworksPanel />

          {/* Feature Flags */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-4">Toggle features on/off globally. Set minimum plan or workspace role requirements.</p>
            {features.map((f) => (
              <FeatureRow key={f.feature_key} feature={f} onToggle={toggleFeature} onUpdate={updateFeature} />
            ))}
            {features.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No feature flags configured.</p>
            )}
          </div>
        </div>
      )}

      {/* DNS Tab — wildcard CNAME, custom token, etc. */}
      {activeTab === "dns" && (
        <div className="space-y-6">
          <DnsConfigPanel />
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
          onBulkApply={handleBulkApply}
        />
      )}

      {/* Plans Tab (sub-tabs: Limits & Defaults) */}
      {activeTab === "plans" && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 border-b border-border/50 pb-px">
            <button
              onClick={() => setPlansSubTab("limits")}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                plansSubTab === "limits" ? "text-foreground border-b-2 border-brand-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Plan Limits
            </button>
            <button
              onClick={() => setPlansSubTab("defaults")}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                plansSubTab === "defaults" ? "text-foreground border-b-2 border-brand-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Plan Defaults
            </button>
            <button
              onClick={() => setPlansSubTab("embedding")}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                plansSubTab === "embedding" ? "text-foreground border-b-2 border-brand-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Embedding Model
            </button>
          </div>
          {plansSubTab === "limits" && <PlanLimitsPanel />}
          {plansSubTab === "defaults" && <PlanDefaultsPanel />}
          {plansSubTab === "embedding" && <EmbeddingProviderPanel />}
        </div>
      )}

      {/* AI Tools Tab */}
      {activeTab === "tools" && <ToolsConfigPanel />}

      {activeTab === "mfa" && <AdminMfaPanel />}
      {activeTab === "signups" && <SignupsPanel />}

      {activeTab === "thumbnails" && <ThumbnailsPanel />}
      {activeTab === "copilot" && <CopilotSessionsPanel />}
      {activeTab === "email" && <EmailPanel />}
      {activeTab === "integrations" && <IntegrationsAdminPanel />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
