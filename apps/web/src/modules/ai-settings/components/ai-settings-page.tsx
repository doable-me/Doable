"use client";

import { useState, useEffect } from "react";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import { useGitHubAccounts, useCustomProviders, useWorkspaceAISettings } from "../hooks/use-ai-settings";
import { GitHubAccountsTab } from "./github-accounts-tab";
import { CustomProvidersTab } from "./custom-providers-tab";
import { ModelDefaultsTab } from "./model-defaults-tab";
import { Bot, Github, Key, Settings } from "lucide-react";

type Tab = "github" | "providers" | "defaults" | "access";

export function AiSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("github");
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
    { key: "github", label: "GitHub Accounts", icon: Github },
    { key: "providers", label: "Custom Providers", icon: Key },
    { key: "defaults", label: "Default Model", icon: Bot },
    { key: "access", label: "Access Control", icon: Settings },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AI Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configure AI providers, connect GitHub accounts, and set workspace defaults.
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
      {activeTab === "github" && (
        <GitHubAccountsTab
          workspaceId={activeWorkspaceId}
          accounts={githubAccounts.accounts}
          loading={githubAccounts.loading}
          activeAccountId={aiDefaults.defaults?.default_copilot_account_id ?? null}
          onAdd={githubAccounts.add}
          onRemove={githubAccounts.remove}
          onValidate={githubAccounts.validate}
          onSetActive={async (id) => {
            await aiDefaults.update({ defaultCopilotAccountId: id });
          }}
        />
      )}
      {activeTab === "providers" && (
        <CustomProvidersTab
          workspaceId={activeWorkspaceId}
          providers={providers.providers}
          loading={providers.loading}
          onAdd={providers.add}
          onRemove={providers.remove}
          onValidate={providers.validate}
        />
      )}
      {activeTab === "defaults" && (
        <ModelDefaultsTab
          workspaceId={activeWorkspaceId}
          defaults={aiDefaults.defaults}
          loading={aiDefaults.loading}
          accounts={githubAccounts.accounts}
          providers={providers.providers}
          onUpdate={aiDefaults.update}
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
