"use client";

import { useState, useCallback } from "react";
import {
  Trash2,
  Loader2,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Globe,
  Terminal,
  Radio,
  Power,
  PowerOff,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRANSPORT_LABELS,
  type McpConnector,
  type McpTool,
} from "../hooks/use-mcp-connectors";

// ─── Status Dot ─────────────────────────────────────────────

export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    connecting: "bg-yellow-500",
    error: "bg-red-500",
    inactive: "bg-muted-foreground/40",
  };
  return (
    <span
      className={cn("h-2 w-2 rounded-full shrink-0", colors[status] ?? colors.inactive)}
      title={status}
    />
  );
}

// ─── Transport Badge ────────────────────────────────────────

export function TransportBadge({ type }: { type: McpConnector["transport_type"] }) {
  const label = TRANSPORT_LABELS[type];
  const Icon = type === "stdio" ? Terminal : type === "http_sse" ? Radio : Globe;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      {label.label}
    </span>
  );
}

// ─── Connector Card ─────────────────────────────────────────

export function ConnectorCard({
  connector,
  expanded,
  onToggle,
  onTest,
  onToggleActive,
  onDelete,
}: {
  connector: McpConnector;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; tools?: McpTool[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling, setToggling] = useState(false);

  const capTools = connector.capabilities_cache
    ? (connector.capabilities_cache as { tools?: { count?: number; list?: McpTool[] } }).tools
    : undefined;
  const toolCount = capTools?.count ?? 0;
  const toolList = capTools?.list ?? [];

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      onTest();
      await new Promise((r) => setTimeout(r, 600));
      setTestResult({ ok: true, message: "Connection test initiated" });
    } catch {
      setTestResult({ ok: false, message: "Connection failed" });
    } finally {
      setTesting(false);
    }
  }, [onTest]);

  const handleToggleActive = useCallback(async () => {
    setToggling(true);
    try {
      onToggleActive();
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setToggling(false);
    }
  }, [onToggleActive]);

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
          {connector.transport_type === "stdio" ? (
            <Terminal className="h-5 w-5" />
          ) : connector.transport_type === "http_sse" ? (
            <Radio className="h-5 w-5" />
          ) : (
            <Globe className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{connector.name}</h3>
            <StatusDot status={connector.status} />
            <TransportBadge type={connector.transport_type} />
            {toolCount > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 dark:bg-blue-950/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                <Wrench className="h-2.5 w-2.5" />
                {toolCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">
            {connector.transport_type === "stdio"
              ? connector.server_command
              : connector.server_url}
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

      {/* Expanded details */}
      {expanded && (
        <div className="border-t">
          {connector.description && (
            <div className="px-4 py-3 border-b">
              <p className="text-xs text-muted-foreground">{connector.description}</p>
            </div>
          )}

          <div className="px-4 py-3 border-b space-y-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Transport</span>
              <span>{TRANSPORT_LABELS[connector.transport_type].label}</span>
              {connector.server_url && (
                <>
                  <span className="text-muted-foreground font-medium">URL</span>
                  <span className="font-mono truncate">{connector.server_url}</span>
                </>
              )}
              {connector.server_command && (
                <>
                  <span className="text-muted-foreground font-medium">Command</span>
                  <span className="font-mono truncate">{connector.server_command}</span>
                </>
              )}
              {Array.isArray(connector.server_args) && connector.server_args.length > 0 && (
                <>
                  <span className="text-muted-foreground font-medium">Args</span>
                  <span className="font-mono truncate">{connector.server_args.join(", ")}</span>
                </>
              )}
              <span className="text-muted-foreground font-medium">Auth</span>
              <span className="capitalize">{connector.auth_type.replace("_", " ")}</span>
              <span className="text-muted-foreground font-medium">Scope</span>
              <span className="capitalize">{connector.scope}</span>
            </div>
          </div>

          {toolList.length > 0 && (
            <div className="px-4 py-3 border-b">
              <div className="flex items-center gap-1.5 mb-2">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Tools ({toolCount})
                </span>
              </div>
              <div className="grid gap-1">
                {toolList.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2 text-xs">
                    <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                      {tool.name}
                    </code>
                    {tool.description && (
                      <span className="text-muted-foreground truncate">{tool.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {connector.error_message && (
            <div
              className={cn(
                "px-4 py-2.5 border-b text-xs flex items-center gap-1.5",
                connector.status === "error"
                  ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                  : "text-muted-foreground",
              )}
            >
              {connector.status === "error" && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              {connector.error_message}
            </div>
          )}

          {testResult && (
            <div
              className={cn(
                "px-4 py-2.5 border-b text-xs flex items-center gap-1.5",
                testResult.ok
                  ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                  : "text-red-600 bg-red-50 dark:bg-red-950/20",
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

          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleTest()}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Test Connection
              </button>
              <button
                onClick={() => void handleToggleActive()}
                disabled={toggling}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {connector.status === "active" || connector.status === "connecting" ? (
                  <>
                    <PowerOff className="h-3.5 w-3.5" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Power className="h-3.5 w-3.5" />
                    Activate
                  </>
                )}
              </button>
            </div>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20",
              )}
            >
              {confirmDelete ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Confirm Delete
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
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
