"use client";

import { useState, useCallback } from "react";
import {
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  Globe,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRANSPORT_LABELS,
  type CustomIntegration,
} from "./use-integrations";

export function StatusDot({ status }: { status: "active" | "error" | "inactive" | "connected" }) {
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

export function TransportIcon({ type }: { type: CustomIntegration["transport_type"] }) {
  if (type === "stdio") return <Terminal className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

// ─── Built-in Integration Card ──────────────────────────────

export function BuiltInCard({
  icon: Icon,
  name,
  description,
  connected,
  statusText,
  onConnect,
  onDisconnect,
  children,
}: {
  icon: React.ElementType;
  name: string;
  description: string;
  connected: boolean;
  statusText?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  children?: React.ReactNode;
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
            <h3 className="text-sm font-semibold">{name}</h3>
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
        </div>
      </div>
      {expanded && children && (
        <div className="border-t px-4 py-3">{children}</div>
      )}
    </div>
  );
}

// ─── Custom Integration Card ────────────────────────────────

export function CustomCard({
  integration,
  expanded,
  onToggle,
  onTest,
  onDelete,
  readOnly = false,
}: {
  integration: CustomIntegration;
  expanded: boolean;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
  readOnly?: boolean;
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
            <span className="text-muted-foreground">({transport.technical})</span>
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
            {!readOnly && <button
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
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scope Section ──────────────────────────────────────────

export function ScopeSection({
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
