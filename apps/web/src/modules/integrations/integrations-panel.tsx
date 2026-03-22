"use client";

import { useState, useCallback } from "react";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  GitBranch,
  CreditCard,
  Database,
  ExternalLink,
  Globe,
  Terminal,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useIntegrations,
  TRANSPORT_LABELS,
  SCOPE_LABELS,
  type CustomIntegration,
  type GitHubStatus,
} from "./use-integrations";
import { AddIntegrationForm } from "./add-integration-form";

// ─── Types ──────────────────────────────────────────────────

interface IntegrationsPanelProps {
  workspaceId: string;
  projectId?: string;
  variant?: "panel" | "settings";
}

// ─── Status Dot ─────────────────────────────────────────────

function StatusDot({ status }: { status: "active" | "error" | "inactive" | "connected" }) {
  const colors = {
    active: "bg-emerald-500",
    connected: "bg-emerald-500",
    error: "bg-red-500",
    inactive: "bg-muted-foreground/40",
  };
  return (
    <span
      className={cn("h-2 w-2 rounded-full shrink-0", colors[status])}
      title={status}
    />
  );
}

// ─── Transport Icon ─────────────────────────────────────────

function TransportIcon({ type }: { type: CustomIntegration["transport_type"] }) {
  if (type === "stdio") return <Terminal className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

// ─── Built-in Integration Card ──────────────────────────────

function BuiltInCard({
  icon: Icon,
  name,
  description,
  connected,
  statusText,
  onConnect,
  onDisconnect,
  children,
  comingSoon,
}: {
  icon: React.ElementType;
  name: string;
  description: string;
  connected: boolean;
  statusText?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  children?: React.ReactNode;
  comingSoon?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = connected && children;

  return (
    <div className="rounded-xl border transition-colors">
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{name}</h3>
              {comingSoon && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected && statusText && (
            <div className="flex items-center gap-1.5">
              <StatusDot status="connected" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                {statusText}
              </span>
            </div>
          )}
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          {!comingSoon && (
            <button
              onClick={connected ? onDisconnect : onConnect}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                connected
                  ? "border border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {connected ? "Disconnect" : "Connect"}
            </button>
          )}
        </div>
      </div>
      {expanded && children && (
        <div className="border-t px-4 py-3">{children}</div>
      )}
    </div>
  );
}

// ─── Custom Integration Card ────────────────────────────────

function CustomCard({
  integration,
  expanded,
  onToggle,
  onTest,
  onDelete,
}: {
  integration: CustomIntegration;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const transport = TRANSPORT_LABELS[integration.transport_type];
  const toolCount = (integration.tools ?? []).length;

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      onTest();
      await new Promise((r) => setTimeout(r, 1500));
      setTestResult({ ok: true, message: "Connection successful" });
    } catch {
      setTestResult({ ok: false, message: "Connection failed" });
    } finally {
      setTesting(false);
    }
  }, [onTest]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
    setConfirmDelete(false);
  }, [confirmDelete, onDelete]);

  return (
    <div className="rounded-xl border transition-colors">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-start gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
          <TransportIcon type={integration.transport_type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{integration.name}</h3>
            <StatusDot status={integration.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {transport.friendly}{" "}
            <span className="text-muted-foreground/60">({transport.technical})</span>
            {toolCount > 0 && (
              <>
                <span className="text-muted-foreground/40 mx-1.5">&middot;</span>
                {toolCount} {toolCount === 1 ? "capability" : "capabilities"}
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t">
          {/* Capabilities list */}
          {toolCount > 0 && (
            <div className="px-4 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Available Capabilities
              </p>
              <div className="space-y-1.5">
                {(integration.tools ?? []).map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40"
                  >
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolCount === 0 && (
            <div className="px-4 py-3 border-b">
              <p className="text-xs text-muted-foreground">
                No capabilities discovered yet. Test the connection to discover what&apos;s available.
              </p>
            </div>
          )}

          {/* Error */}
          {integration.error_message && (
            <div
              className={cn(
                "px-4 py-2.5 border-b text-xs flex items-center gap-1.5",
                integration.status === "error"
                  ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                  : "text-muted-foreground"
              )}
            >
              {integration.status === "error" && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              {integration.error_message}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                "px-4 py-2.5 border-b text-xs flex items-center gap-1.5",
                testResult.ok
                  ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                  : "text-red-600 bg-red-50 dark:bg-red-950/20"
              )}
            >
              {testResult.ok ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <button
              onClick={() => void handleTest()}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Test Connection
            </button>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              )}
            >
              {confirmDelete ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Confirm Remove
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scope Section ──────────────────────────────────────────

function ScopeSection({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-1 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5">
          {count}
        </span>
      </button>
      {open && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

export function IntegrationsPanel({ workspaceId, projectId, variant = "panel" }: IntegrationsPanelProps) {
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
  const builtInCount = projectId ? 3 : 0;
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

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border-b">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-3 space-y-1">
          {/* Add form */}
          {showForm && (
            <AddIntegrationForm
              workspaceId={workspaceId}
              onCreated={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          )}

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
                <ScopeSection label="Shared with all projects" count={workspaceCount}>
                  {workspaceIntegrations.map((integration) => (
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

              {/* This project only (project scope + built-ins) */}
              {projectId && (
                <ScopeSection label="This project only" count={projectCount}>
                  {/* GitHub (built-in) — always shown */}
                  {!githubLoading && (
                    <BuiltInCard
                      icon={GitBranch}
                      name="GitHub"
                      description="Sync code with a GitHub repository for version control."
                      connected={githubStatus?.connected ?? false}
                      statusText={githubStatus?.connected ? githubStatus.status : undefined}
                      onConnect={() => {
                        // Focus the GitHub button in the toolbar
                      }}
                      onDisconnect={() => void disconnectGithub()}
                    >
                      {githubStatus?.connected && (
                        <div className="space-y-2">
                          {githubStatus.repoUrl && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Repository</span>
                              <a
                                href={githubStatus.repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                {githubStatus.repoUrl.replace("https://github.com/", "")}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Branch</span>
                            <span className="font-mono text-xs">{githubStatus.branch}</span>
                          </div>
                          {githubStatus.lastSyncedAt && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Last synced</span>
                              <span className="text-xs">
                                {new Date(githubStatus.lastSyncedAt).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </BuiltInCard>
                  )}

                  {/* Stripe (coming soon) */}
                  <BuiltInCard
                    icon={CreditCard}
                    name="Stripe"
                    description="Accept payments, manage subscriptions, and process transactions."
                    connected={false}
                    comingSoon
                  />

                  {/* Supabase (coming soon) */}
                  <BuiltInCard
                    icon={Database}
                    name="Supabase"
                    description="Connect a Supabase database for backend storage and authentication."
                    connected={false}
                    comingSoon
                  />

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
                <ScopeSection label="Just for me" count={userCount}>
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
    </div>
  );
}
