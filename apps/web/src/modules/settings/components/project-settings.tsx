"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGetProject, type ApiProject } from "@/lib/api";
import { McpPanel } from "@/modules/settings/components/mcp-panel";
import { SkillsRulesPanel } from "@/modules/settings/components/skills-rules-panel";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import {
  type Tab,
  TABS,
  SectionCard,
  SettingsLoadingSkeleton,
} from "./project-settings-shared";
import { GeneralTab, IntegrationsPanelWrapper } from "./project-settings-general";
import { ContextFilesTab } from "./project-settings-context";
import { DomainTab } from "./project-settings-domain";
import { EnvironmentsTab, DangerTab } from "./project-settings-tabs";
import { RateLimitingTab } from "./project-settings-ratelimit";
import { SecurityTab } from "./project-settings-security";
import { DatabaseTab } from "@/modules/settings/database/database-tab";
import { DoableAiTab } from "./project-settings-doable-ai";

// ─── Main Component ─────────────────────────────────────────

interface ProjectSettingsProps {
  projectId: string;
}

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "general";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const validTabs: Tab[] = ["general", "integrations", "mcp", "skills", "context", "doable-ai", "security", "domain", "environments", "database", "danger"];
    return validTabs.includes(tab as Tab) ? (tab as Tab) : "general";
  });
  const [project, setProject] = useState<ApiProject | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, dismissToast } = useToasts();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiGetProject(projectId)
      .then(({ data }) => {
        if (!cancelled) {
          setProject(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          addToast("error", err instanceof Error ? err.message : "Failed to load project");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, addToast]);

  if (loading) {
    return <SettingsLoadingSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">Project not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The project may have been deleted or you don't have access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      {activeTab === "general" && (
        <GeneralTab
          project={project}
          onUpdate={(updated) => setProject(updated)}
          addToast={addToast}
        />
      )}
      {activeTab === "integrations" && (
        <IntegrationsPanelWrapper projectId={projectId} />
      )}
      {activeTab === "mcp" && project.workspace_id && (
        <McpPanel
          workspaceId={project.workspace_id}
        />
      )}
      {activeTab === "skills" && project.workspace_id && (
        <SectionCard title="Skills & Rules" description="Manage reusable skills and rules that shape how the AI works across your workspace.">
          <SkillsRulesPanel workspaceId={project.workspace_id} />
        </SectionCard>
      )}
      {activeTab === "context" && (
        <ContextFilesTab projectId={projectId} addToast={addToast} />
      )}
      {activeTab === "doable-ai" && project.workspace_id && (
        <DoableAiTab
          projectId={projectId}
          workspaceId={project.workspace_id}
          addToast={addToast}
        />
      )}
      {activeTab === "security" && (
        <SecurityTab projectId={projectId} addToast={addToast} />
      )}
      {activeTab === "domain" && (
        <DomainTab project={project} addToast={addToast} />
      )}
      {activeTab === "environments" && (
        <EnvironmentsTab project={project} />
      )}
      {activeTab === "database" && (
        <DatabaseTab projectId={projectId} />
      )}
      {activeTab === "danger" && (
        <DangerTab project={project} addToast={addToast} />
      )}
    </div>
  );
}
