"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Zap,
  Check,
  AlertCircle,
  RefreshCw,
  Loader2,
  Unplug,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  AUTH_LABELS,
  type CatalogItem,
  type IntegrationAction,
  type NativeConnection,
} from "./use-integration-catalog";

// ─── Integration Detail Sheet ──────────────────────────────

interface IntegrationDetailSheetProps {
  item: CatalogItem | null;
  connections: NativeConnection[];
  open: boolean;
  onClose: () => void;
  onConnect: (item: CatalogItem) => void;
  onDisconnect: (connectionId: string) => void;
  onTestConnection: (connectionId: string) => Promise<{ valid: boolean; error?: string }>;
  onGetActions: (integrationId: string) => Promise<IntegrationAction[]>;
}

export function IntegrationDetailSheet({
  item,
  connections,
  open,
  onClose,
  onConnect,
  onDisconnect,
  onTestConnection,
  onGetActions,
}: IntegrationDetailSheetProps) {
  const [actions, setActions] = useState<IntegrationAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    valid: boolean;
    error?: string;
  } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);

  // Load actions when the sheet opens for a specific item
  useEffect(() => {
    if (!item || !open) {
      setActions([]);
      return;
    }

    let cancelled = false;
    setLoadingActions(true);
    onGetActions(item.id)
      .then((data) => {
        if (!cancelled) setActions(data);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingActions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id, open, onGetActions]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setTestResult(null);
      setConfirmDisconnect(null);
    }
  }, [open]);

  const handleTest = useCallback(
    async (connectionId: string) => {
      setTestingId(connectionId);
      setTestResult(null);
      try {
        const result = await onTestConnection(connectionId);
        setTestResult({ id: connectionId, ...result });
      } catch {
        setTestResult({ id: connectionId, valid: false, error: "Test failed" });
      } finally {
        setTestingId(null);
      }
    },
    [onTestConnection]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      if (confirmDisconnect !== connectionId) {
        setConfirmDisconnect(connectionId);
        return;
      }
      onDisconnect(connectionId);
      setConfirmDisconnect(null);
    },
    [confirmDisconnect, onDisconnect]
  );

  if (!item) return null;

  const itemConnections = connections.filter(
    (c) => c.integrationId === item.id
  );
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const authLabel = AUTH_LABELS[item.authType] ?? item.authType;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full max-w-md border-l bg-background shadow-xl",
          "transform transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted shrink-0 overflow-hidden">
                {item.logoUrl ? (
                  <img
                    src={item.logoUrl}
                    alt={item.displayName}
                    className="h-7 w-7 object-contain"
                  />
                ) : (
                  <span className="text-base font-bold text-muted-foreground">
                    {item.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold truncate">
                    {item.displayName}
                  </h2>
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      item.connected ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium px-2 py-0.5"
                  >
                    {categoryLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {authLabel}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-auto">
            {/* Description */}
            <div className="p-5 border-b">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description || "No description available."}
              </p>
            </div>

            {/* Connections */}
            {itemConnections.length > 0 && (
              <div className="p-5 border-b">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Active Connections
                </h3>
                <div className="space-y-2">
                  {itemConnections.map((conn) => (
                    <div
                      key={conn.id}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              conn.status === "active"
                                ? "bg-emerald-500"
                                : conn.status === "error"
                                ? "bg-red-500"
                                : "bg-muted-foreground/40"
                            )}
                          />
                          <span className="text-sm font-medium truncate">
                            {conn.displayName || "Connection"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {conn.scope}
                        </span>
                      </div>

                      {/* Error message (hide if we have a fresh test result for this connection) */}
                      {conn.errorMessage && !(testResult && testResult.id === conn.id) && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 mb-2">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span className="truncate">{conn.errorMessage}</span>
                        </div>
                      )}

                      {/* Test result */}
                      {testResult && testResult.id === conn.id && (
                        <div
                          className={cn(
                            "flex items-center gap-1.5 text-xs mb-2 rounded-md px-2 py-1",
                            testResult.valid
                              ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                              : "text-red-600 bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {testResult.valid ? (
                            <Check className="h-3 w-3 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3 w-3 shrink-0" />
                          )}
                          {testResult.valid
                            ? (testResult as any).message || "Connection is healthy"
                            : testResult.error || "Connection failed"}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleTest(conn.id)}
                          disabled={testingId === conn.id}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          {testingId === conn.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Test
                        </button>
                        <span className="text-muted-foreground/30">|</span>
                        <button
                          onClick={() => handleDisconnect(conn.id)}
                          onBlur={() => setConfirmDisconnect(null)}
                          className={cn(
                            "flex items-center gap-1 text-xs transition-colors",
                            confirmDisconnect === conn.id
                              ? "text-red-600 font-medium"
                              : "text-muted-foreground hover:text-red-600"
                          )}
                        >
                          <Unplug className="h-3 w-3" />
                          {confirmDisconnect === conn.id
                            ? "Confirm disconnect?"
                            : "Disconnect"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Actions */}
            <div className="p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Available Actions
                {!loadingActions && actions.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground/60 normal-case font-normal">
                    ({actions.length})
                  </span>
                )}
              </h3>

              {loadingActions && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading actions...
                </div>
              )}

              {!loadingActions && actions.length === 0 && (
                <p className="text-xs text-muted-foreground/70 py-2">
                  No actions discovered for this integration yet.
                </p>
              )}

              {!loadingActions && actions.length > 0 && (
                <div className="space-y-1.5">
                  {actions.map((action) => (
                    <div
                      key={action.name}
                      className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-muted/40"
                    >
                      <Zap className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">
                          {action.displayName}
                        </p>
                        {action.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {action.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            {item.connected ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  Connected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConnect(item)}
                  className="text-xs"
                >
                  Add Another Connection
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                size="sm"
                onClick={() => onConnect(item)}
              >
                Connect {item.displayName}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
