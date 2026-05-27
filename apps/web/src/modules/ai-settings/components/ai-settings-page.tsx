"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiListWorkspaces, apiFetch, type ApiWorkspace } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useGitHubAccounts, useCustomProviders, useWorkspaceAISettings, useUserAiPreferences } from "../hooks/use-ai-settings";
import { ConnectionsTab } from "./connections-tab";
import { ModelConfigTab } from "./model-config-tab";
import { AccessControlTab } from "./access-control-tab";
import { DoableAiSettingsTab } from "./doable-ai-tab";
import { Link2, Bot, Shield, ShieldAlert, Sparkles } from "lucide-react";

type Tab = "connections" | "models" | "doable-ai" | "access";

export function AiSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("connections");
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [featureAllowed, setFeatureAllowed] = useState<boolean | null>(null);
  const [featureDeniedReason, setFeatureDeniedReason] = useState<string | null>(null);

  useEffect(() => {
    apiListWorkspaces().then(({ data }) => {
      setWorkspaces(data);
      const persisted = localStorage.getItem("doable_active_workspace_id");
      const found = data.find((w) => w.id === persisted);
      setActiveWorkspaceId(found ? found.id : data[0]?.id ?? null);
      setLoaded(true);
    }).catch(() => { setLoaded(true); });
  }, []);

  // Check feature flag access for this user
  useEffect(() => {
    if (!loaded || !activeWorkspaceId) return;
    apiFetch<{ allowed: boolean; reason: string }>(
      `/admin/features/check/ai_settings?workspaceId=${activeWorkspaceId}`
    )
      .then((res) => {
        setFeatureAllowed(res.allowed);
        if (!res.allowed) setFeatureDeniedReason(res.reason);
      })
      .catch(() => {
        // If check fails, fall back to workspace role check
        setFeatureAllowed(null);
      });
  }, [loaded, activeWorkspaceId]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const isPlatformAdmin = !!user?.isPlatformAdmin;
  const isWorkspaceAdmin =
    activeWorkspace?.userRole === "owner" || activeWorkspace?.userRole === "admin";

  // All hooks must be called before any conditional returns
  const githubAccounts = useGitHubAccounts(activeWorkspaceId);
  const providers = useCustomProviders(activeWorkspaceId);
  const aiDefaults = useWorkspaceAISettings(activeWorkspaceId);
  const userPrefs = useUserAiPreferences(activeWorkspaceId ?? undefined);

  // Any workspace member can access AI settings (for personal model preferences).
  // Only block if the feature is explicitly disabled or per-user denied.
  const isHardDenied =
    featureAllowed === false &&
    (featureDeniedReason === "feature_disabled" || featureDeniedReason === "user_override_denied");
  const hasAccess = !isHardDenied;

  // Connections is now visible to every member: any member can add their
  // own personal Copilot account / provider. Admin-only actions inside
  // (e.g. "Add for workspace") are gated within the tab itself.
  const allTabs: { key: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { key: "connections", label: "Connections", icon: Link2 },
    { key: "models", label: "Configure Model", icon: Bot },
    { key: "doable-ai", label: "Doable AI", icon: Sparkles },
    { key: "access", label: "Access Control", icon: Shield, adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isPlatformAdmin);

  // Redirect only when explicitly denied (not for insufficient_role)
  useEffect(() => {
    if (loaded && isHardDenied) {
      router.replace("/");
    }
  }, [loaded, isHardDenied, router]);

  // If current tab isn't visible (e.g. non-admin), fall back to first available
  useEffect(() => {
    const first = tabs[0];
    if (first && !tabs.some((t) => t.key === activeTab)) {
      setActiveTab(first.key);
    }
  }, [isPlatformAdmin]);

  if (!loaded) return null;

  // Feature explicitly disabled or per-user denied
  if (isHardDenied) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            {featureDeniedReason === "feature_disabled"
              ? "AI Settings has been disabled by a platform administrator."
              : featureDeniedReason === "user_override_denied"
              ? "Your access to AI Settings has been restricted by a platform administrator."
              : "You don't have permission to access AI Settings. Contact your administrator."}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-lg bg-secondary px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">AI Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure which AI models power your workspace.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? "border-brand-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "models" && (
        <ModelConfigTab
          workspaceId={activeWorkspaceId}
          defaults={aiDefaults.defaults}
          loading={aiDefaults.loading}
          accounts={githubAccounts.accounts}
          providers={providers.providers}
          onUpdate={aiDefaults.update}
          userPreferences={userPrefs.preferences}
          enforcement={userPrefs.enforcement}
          onUserPreferenceUpdate={userPrefs.update}
          onRefreshProviders={providers.refresh}
          isPlatformAdmin={isPlatformAdmin}
        />
      )}
      {activeTab === "connections" && (
        <ConnectionsTab
          workspaceId={activeWorkspaceId}
          isWorkspaceAdmin={isWorkspaceAdmin}
          currentUserId={user?.id ?? null}
          accounts={githubAccounts.accounts}
          accountsLoading={githubAccounts.loading}
          providers={providers.providers}
          providersLoading={providers.loading}
          onAddAccount={githubAccounts.add}
          onRemoveAccount={githubAccounts.remove}
          onValidateAccount={githubAccounts.validate}
          onAddProvider={providers.add}
          onRemoveProvider={providers.remove}
          onValidateProvider={providers.validate}
          onPromoteProvider={providers.promoteToWorkspace}
          onRefreshProviders={providers.refresh}
        />
      )}
      {activeTab === "access" && (
        <AccessControlTab
          defaults={aiDefaults.defaults}
          accounts={githubAccounts.accounts}
          providers={providers.providers}
          onUpdate={async (data) => {
            await aiDefaults.update(data);
            await userPrefs.refresh();
          }}
        />
      )}
      {activeTab === "doable-ai" && activeWorkspaceId && (
        <DoableAiSettingsTab
          workspaceId={activeWorkspaceId}
          isAdmin={isWorkspaceAdmin || isPlatformAdmin}
        />
      )}
    </div>
  );
}
