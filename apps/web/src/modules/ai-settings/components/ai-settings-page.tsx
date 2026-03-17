"use client";

import { useState, useEffect } from "react";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import { useGitHubAccounts, useCustomProviders, useWorkspaceAISettings } from "../hooks/use-ai-settings";
import { ConnectionsTab } from "./connections-tab";
import { ModelConfigTab } from "./model-config-tab";
import { Link2, Bot, Settings } from "lucide-react";

type Tab = "connections" | "models" | "access";

export function AiSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("models");
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    apiListWorkspaces().then(({ data }) => {
      setWorkspaces(data);
      const persisted = localStorage.getItem("doable_active_workspace_id");
      const found = data.find((w) => w.id === persisted);
      setActiveWorkspaceId(found ? found.id : data[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const githubAccounts = useGitHubAccounts(activeWorkspaceId);
  const providers = useCustomProviders(activeWorkspaceId);
  const aiDefaults = useWorkspaceAISettings(activeWorkspaceId);

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "models", label: "Model Configuration", icon: Bot },
    { key: "connections", label: "Connections", icon: Link2 },
    { key: "access", label: "Access Control", icon: Settings },
  ];

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
                ? "border-violet-500 text-white"
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <Settings className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
          <h3 className="text-lg font-medium text-zinc-300 mb-1">Access Control</h3>
          <p className="text-sm text-zinc-500">
            Role-based access control for AI settings is coming soon.
          </p>
        </div>
      )}
    </div>
  );
}
