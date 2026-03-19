"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import { useGitHubAccounts, useCustomProviders, useWorkspaceAISettings, useUserAiPreferences } from "../hooks/use-ai-settings";
import { ConnectionsTab } from "./connections-tab";
import { ModelConfigTab } from "./model-config-tab";
import { AccessControlTab } from "./access-control-tab";
import { Link2, Bot, Shield } from "lucide-react";

type Tab = "connections" | "models" | "access";

export function AiSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("models");
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiListWorkspaces().then(({ data }) => {
      setWorkspaces(data);
      const persisted = localStorage.getItem("doable_active_workspace_id");
      const found = data.find((w) => w.id === persisted);
      setActiveWorkspaceId(found ? found.id : data[0]?.id ?? null);
      setLoaded(true);
    }).catch(() => { setLoaded(true); });
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const isAdmin = activeWorkspace?.userRole === "owner" || activeWorkspace?.userRole === "admin";

  // Redirect non-admins away from this page
  useEffect(() => {
    if (loaded && activeWorkspace && !isAdmin) {
      router.replace("/");
    }
  }, [loaded, activeWorkspace, isAdmin, router]);

  if (!loaded || (activeWorkspace && !isAdmin)) return null;

  const githubAccounts = useGitHubAccounts(activeWorkspaceId);
  const providers = useCustomProviders(activeWorkspaceId);
  const aiDefaults = useWorkspaceAISettings(activeWorkspaceId);
  const userPrefs = useUserAiPreferences(activeWorkspaceId ?? undefined);

  const allTabs: { key: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { key: "models", label: "Model Configuration", icon: Bot },
    { key: "connections", label: "Connections", icon: Link2, adminOnly: true },
    { key: "access", label: "Access Control", icon: Shield, adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isAdmin);

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
                ? "border-orange-500 text-white"
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
    </div>
  );
}
