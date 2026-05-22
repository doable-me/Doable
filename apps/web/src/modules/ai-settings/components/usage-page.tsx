"use client";

import { useState, useEffect } from "react";
import { apiListWorkspaces, type ApiWorkspace } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { MyUsageTab } from "./my-usage-tab";
import { WorkspaceUsageTab } from "./workspace-usage-tab";
import { PlatformUsageTab } from "./platform-usage-tab";
import { BarChart3, Users, Globe } from "lucide-react";

type Tab = "my-usage" | "workspace-usage" | "platform-usage";

export function UsagePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("my-usage");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiListWorkspaces()
      .then(({ data }) => {
        const persisted = localStorage.getItem("doable_active_workspace_id");
        const found = data.find((w: ApiWorkspace) => w.id === persisted);
        setActiveWorkspaceId(found ? found.id : data[0]?.id ?? null);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  const isPlatformAdmin = !!user?.isPlatformAdmin;

  if (!loaded) return null;

  const allTabs: { key: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { key: "my-usage", label: "My Usage", icon: BarChart3 },
    { key: "workspace-usage", label: "Workspace Usage", icon: Users, adminOnly: true },
    { key: "platform-usage", label: "Platform", icon: Globe, adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isPlatformAdmin);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your AI usage, token consumption, and costs.
        </p>
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
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
      )}

      {/* Tab content */}
      {activeTab === "my-usage" && <MyUsageTab workspaceId={activeWorkspaceId} />}
      {activeTab === "workspace-usage" && <WorkspaceUsageTab workspaceId={activeWorkspaceId} />}
      {activeTab === "platform-usage" && <PlatformUsageTab />}
    </div>
  );
}
