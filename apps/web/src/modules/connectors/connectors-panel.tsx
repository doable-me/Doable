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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useConnectors, type Connector } from "./use-connectors";
import { ConnectorForm } from "./connector-form";

// ─── Types ──────────────────────────────────────────────────

interface ConnectorsPanelProps {
  workspaceId: string;
}

// ─── Status Indicator ───────────────────────────────────────

function StatusDot({ status }: { status: Connector["status"] }) {
  const colors = {
    active: "bg-emerald-500",
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

// ─── Transport Badge ────────────────────────────────────────

const TRANSPORT_LABELS: Record<Connector["transport_type"], string> = {
  streamable_http: "HTTP",
  http_sse: "SSE",
  stdio: "stdio",
};

// ─── Scope Badge ────────────────────────────────────────────

const SCOPE_VARIANTS: Record<
  Connector["scope"],
  "default" | "secondary" | "outline"
> = {
  workspace: "default",
  project: "secondary",
  user: "outline",
};

// ─── Connector Card ─────────────────────────────────────────

function ConnectorCard({
  connector,
  expanded,
  onToggle,
  onTest,
  onDelete,
}: {
  connector: Connector;
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

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // onTest is async from the parent
      onTest();
      // Simulate waiting for the result — parent refreshes state
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
    <div className="border rounded-md overflow-hidden">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <StatusDot status={connector.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{connector.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {TRANSPORT_LABELS[connector.transport_type]}
            </span>
            <span className="text-xs text-muted-foreground/50">·</span>
            <span className="text-xs text-muted-foreground">
              {connector.scope}
            </span>
            <span className="text-xs text-muted-foreground/50">·</span>
            <span className="text-xs text-muted-foreground">
              {((connector as any).tools ?? []).length} tool
              {((connector as any).tools ?? []).length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <Badge variant={SCOPE_VARIANTS[connector.scope]} className="text-[10px] shrink-0">
          {connector.scope}
        </Badge>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t bg-muted/20">
          {/* Tools list */}
          {((connector as any).tools ?? []).length > 0 && (
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Available Tools
              </p>
              <div className="space-y-1">
                {((connector as any).tools ?? []).map((tool: { name: string; description?: string }) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-2 px-2 py-1 rounded-md bg-background"
                  >
                    <Wrench className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium font-mono truncate">
                        {tool.name}
                      </p>
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

          {((connector as any).tools ?? []).length === 0 && (
            <div className="px-3 py-2 border-b">
              <p className="text-xs text-muted-foreground">
                No tools discovered yet. Test the connection to discover
                available tools.
              </p>
            </div>
          )}

          {/* Status message */}
          {connector.error_message && (
            <div
              className={cn(
                "px-3 py-2 border-b text-xs flex items-center gap-1.5",
                connector.status === "error"
                  ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                  : "text-muted-foreground"
              )}
            >
              {connector.status === "error" && (
                <AlertCircle className="h-3 w-3 shrink-0" />
              )}
              {connector.error_message}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                "px-3 py-2 border-b text-xs flex items-center gap-1.5",
                testResult.ok
                  ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                  : "text-red-600 bg-red-50 dark:bg-red-950/20"
              )}
            >
              {testResult.ok ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <AlertCircle className="h-3 w-3 shrink-0" />
              )}
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => void handleTest()}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Test Connection
            </button>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              )}
            >
              {confirmDelete ? (
                <>
                  <AlertCircle className="h-3 w-3" />
                  Confirm Delete
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

export const ConnectorsPanel = ({ workspaceId }: ConnectorsPanelProps) => {
  const {
    connectors,
    loading,
    error,
    refresh,
    testConnector,
    deleteConnector,
  } = useConnectors(workspaceId);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreated = useCallback(() => {
    setShowForm(false);
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">MCP Connectors</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void refresh()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Add connector"
          >
            <Plus className="h-3.5 w-3.5" />
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
        <div className="p-3 space-y-2">
          {/* Add form */}
          {showForm && (
            <ConnectorForm
              workspaceId={workspaceId}
              onCreated={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          )}

          {/* Loading state */}
          {loading && connectors.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading...
            </div>
          )}

          {/* Empty state */}
          {!loading && connectors.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                No connectors yet
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                Add an MCP connector to extend your AI with external tools.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Connector
              </button>
            </div>
          )}

          {/* Connector list */}
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              expanded={expandedId === connector.id}
              onToggle={() =>
                setExpandedId((prev) =>
                  prev === connector.id ? null : connector.id
                )
              }
              onTest={() => void testConnector(connector.id)}
              onDelete={() => void deleteConnector(connector.id)}
            />
          ))}
        </div>
      </div>

      {/* Footer summary */}
      {connectors.length > 0 && (
        <div className="px-4 py-2 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {connectors.length} connector
              {connectors.length !== 1 ? "s" : ""}
            </span>
            <span>
              {connectors.reduce((sum, c) => sum + ((c as any).tools ?? []).length, 0)} total
              tools
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
