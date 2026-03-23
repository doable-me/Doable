"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiListWorkspaces, apiFetch, type ApiWorkspace } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useGitHubAccounts, useCustomProviders, useWorkspaceAISettings, useUserAiPreferences, useUserAllocations } from "../hooks/use-ai-settings";
import { ConnectionsTab } from "./connections-tab";
import { ModelConfigTab } from "./model-config-tab";
import { AccessControlTab } from "./access-control-tab";
import { UserAllocationsTab } from "./user-allocations-tab";
import { Link2, Bot, Shield, ShieldAlert, Users } from "lucide-react";

type Tab = "connections" | "models" | "access" | "allocations";

export function AiSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("models");
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

  // All hooks must be called before any conditional returns
  const githubAccounts = useGitHubAccounts(activeWorkspaceId);
  const providers = useCustomProviders(activeWorkspaceId);
  const aiDefaults = useWorkspaceAISettings(activeWorkspaceId);
  const userPrefs = useUserAiPreferences(activeWorkspaceId ?? undefined);
  const userAllocations = useUserAllocations(activeWorkspaceId);

  // Only platform admins can access AI settings
  const hasAccess = featureAllowed !== null ? featureAllowed : isPlatformAdmin;

  // Redirect denied users
  useEffect(() => {
    if (loaded && featureAllowed !== null && !hasAccess) {
      router.replace("/");
    }
  }, [loaded, featureAllowed, hasAccess, router]);

  if (!loaded) return null;

  // Feature explicitly denied by platform admin
  if (featureAllowed === false) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <ShieldAlert className="h-12 w-12 text-zinc-600 mb-4" />
          <h2 className="text-lg font-semibold text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-zinc-400 max-w-md">
            {featureDeniedReason === "insufficient_role"
              ? "You need admin access to this workspace to view AI Settings."
              : featureDeniedReason === "feature_disabled"
              ? "AI Settings has been disabled by a platform administrator."
              : featureDeniedReason === "user_override_denied"
              ? "Your access to AI Settings has been restricted by a platform administrator."
              : "You don't have permission to access AI Settings. Contact your administrator."}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const allTabs: { key: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { key: "models", label: "Model Configuration", icon: Bot },
    { key: "connections", label: "Connections", icon: Link2, adminOnly: true },
    { key: "access", label: "Access Control", icon: Shield, adminOnly: true },
    { key: "allocations", label: "User Allocations", icon: Users, adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isPlatformAdmin);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AI Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configure which AI models power your workspace.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? "border-brand-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
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
        />
      )}
      {activeTab === "connections" && (
        <ConnectionsTab
          workspaceId={activeWorkspaceId}
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
      {activeTab === "allocations" && (
        <UserAllocationsTab
          allocations={userAllocations.allocations}
          loading={userAllocations.loading}
          accounts={githubAccounts.accounts}
          providers={providers.providers}
          enforcement={userPrefs.enforcement}
          onUpdate={userAllocations.updateOne}
          onCopyMySettings={userAllocations.copyMySettings}
          onReset={userAllocations.resetOne}
        />
      )}
    </div>
  );
}
