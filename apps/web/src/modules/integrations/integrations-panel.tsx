"use client";

import { useState, useCallback } from "react";
import {
  Plug,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useIntegrations,
  type CustomIntegration,
} from "./use-integrations";
import { AddIntegrationForm } from "./add-integration-form";
import { IntegrationCatalog } from "./integration-catalog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CustomCard, ScopeSection } from "./integrations-panel-cards";

// ─── Types ──────────────────────────────────────────────────

interface IntegrationsPanelProps {
  workspaceId: string;
  projectId?: string;
  variant?: "panel" | "settings";
  onGitHubConnect?: () => void;
}



// ─── Main Panel ─────────────────────────────────────────────

export function IntegrationsPanel({ workspaceId, projectId, variant = "panel", onGitHubConnect }: IntegrationsPanelProps) {
  const {
    workspaceIntegrations,
    projectIntegrations,
    userIntegrations,
    githubStatus,
    loading,
    githubLoading,
    error,
    refresh,
    testIntegration,
    deleteIntegration,
    disconnectGithub,
    isAdmin,
  } = useIntegrations(workspaceId, projectId);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreated = useCallback(() => {
    setShowForm(false);
    void refresh();
  }, [refresh]);

  const isLoading = loading || githubLoading;
  const totalCustom = workspaceIntegrations.length + projectIntegrations.length + userIntegrations.length;
  const hasGithub = githubStatus?.connected;

  // Count for each scope section (including built-ins)
  const workspaceCount = workspaceIntegrations.length;
  // Count built-in integrations: GitHub (connected or not) + Stripe + Supabase placeholders
  const builtInCount = 0; // Built-ins moved to native catalog or header buttons
  const projectCount = projectIntegrations.length + builtInCount;
  const userCount = userIntegrations.length;

  const isSettings = variant === "settings";

  return (
    <div className={cn("flex flex-col h-full", isSettings && "max-w-3xl")}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Integrations</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void refresh()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Native Integration Catalog */}
        <div className="p-3 pb-0">
          <IntegrationCatalog workspaceId={workspaceId} projectId={projectId} />
        </div>

        {/* Separator */}
        <div className="mx-3 my-4 border-t" />

        {/* Custom MCP Connectors heading */}
        <div className="px-4 pb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Custom MCP Connectors
          </h4>
        </div>

        {/* MCP Error */}
        {error && (
          <div className="mx-3 mb-2 px-3 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg">
            {error}
          </div>
        )}

        <div className="p-3 pt-0 space-y-1">
          {/* Loading */}
          {isLoading && totalCustom === 0 && !githubStatus && (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading integrations...
              </div>
            </div>
          )}

          {/* Empty state — only when no projectId (no built-ins to show) and no custom integrations */}
          {!isLoading && totalCustom === 0 && !projectId && !showForm && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                No integrations yet
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4 max-w-[240px]">
                Connect third-party services and AI tools to extend your project.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Integration
              </button>
            </div>
          )}

          {/* Grouped by scope */}
          {!isLoading && (totalCustom > 0 || projectId) && (
            <>
              {/* Shared with all projects (workspace scope) */}
              {workspaceCount > 0 && (
                <ScopeSection label="Everyone in this workspace" count={workspaceCount}>
                  {workspaceIntegrations.map((integration) => (
                    <CustomCard
                      key={integration.id}
                      integration={integration}
                      expanded={expandedId === integration.id}
                      readOnly={!isAdmin}
                      onToggle={() =>
                        setExpandedId((prev) =>
                          prev === integration.id ? null : integration.id
                        )
                      }
                      onTest={() => void testIntegration(integration.id)}
                      onDelete={() => void deleteIntegration(integration.id)}
                    />
                  ))}
                </ScopeSection>
              )}

              {/* This project only (project scope) */}
              {projectId && projectIntegrations.length > 0 && (
                <ScopeSection label="Everyone on this project" count={projectCount}>
                  {/* Custom project-scoped integrations */}
                  {projectIntegrations.map((integration) => (
                    <CustomCard
                      key={integration.id}
                      integration={integration}
                      expanded={expandedId === integration.id}
                      onToggle={() =>
                        setExpandedId((prev) =>
                          prev === integration.id ? null : integration.id
                        )
                      }
                      onTest={() => void testIntegration(integration.id)}
                      onDelete={() => void deleteIntegration(integration.id)}
                    />
                  ))}
                </ScopeSection>
              )}

              {/* Just for me (user scope) */}
              {userCount > 0 && (
                <ScopeSection label="Only me (personal)" count={userCount}>
                  {userIntegrations.map((integration) => (
                    <CustomCard
                      key={integration.id}
                      integration={integration}
                      expanded={expandedId === integration.id}
                      onToggle={() =>
                        setExpandedId((prev) =>
                          prev === integration.id ? null : integration.id
                        )
                      }
                      onTest={() => void testIntegration(integration.id)}
                      onDelete={() => void deleteIntegration(integration.id)}
                    />
                  ))}
                </ScopeSection>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer summary */}
      {totalCustom > 0 && (
        <div className="px-4 py-2 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {totalCustom + (hasGithub ? 1 : 0)} integration{(totalCustom + (hasGithub ? 1 : 0)) !== 1 ? "s" : ""} connected
            </span>
          </div>
        </div>
      )}

      {/* Add MCP Server Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <AddIntegrationForm
            workspaceId={workspaceId}
            isAdmin={isAdmin}
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
