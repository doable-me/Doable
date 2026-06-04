"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
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
  useMcpConnectors,
  TRANSPORT_LABELS,
  type McpConnector,
  type McpTool,
  type CreateConnectorPayload,
} from "../hooks/use-mcp-connectors";
import { ConnectorCard } from "./mcp-connector-card";
import { AddServerForm } from "./mcp-add-server-form";

// ─── Types ──────────────────────────────────────────────────

interface McpPanelProps {
  workspaceId: string;
}

// ─── Main Panel ─────────────────────────────────────────────

export function McpPanel({ workspaceId }: McpPanelProps) {
  const {
    connectors,
    loading,
    error,
    refresh,
    createConnector,
    updateConnector,
    deleteConnector,
    testConnector,
    discoverServer,
    startOAuth,
  } = useMcpConnectors(workspaceId);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreated = useCallback(
    async (payload: CreateConnectorPayload) => {
      await createConnector(payload);
      setShowForm(false);
    },
    [createConnector],
  );

  // Re-authenticate an existing OAuth connector IN PLACE (same id + name) so a
  // connector whose token expired can recover without delete + re-add. The
  // backend authorize route accepts an existing connectorId and the callback
  // updates that row's credentials. We re-discover the server's OAuth endpoints
  // (they are not stored on the connector) and reuse the same popup flow as add.
  const handleReconnect = useCallback(
    async (connector: McpConnector) => {
      if (connector.auth_type !== "oauth2" || !connector.server_url) return;
      const disc = await discoverServer(connector.server_url);
      const meta = disc.oauthMetadata;
      if (!meta?.authorizationEndpoint || !meta?.tokenEndpoint) {
        window.alert(
          disc.error
            ? `Could not start re-authentication: ${disc.error}`
            : "Could not discover this server's OAuth endpoints. Check the server URL is still reachable.",
        );
        return;
      }
      let authorizationUrl: string;
      try {
        authorizationUrl = await startOAuth({
          authorizationEndpoint: meta.authorizationEndpoint,
          tokenEndpoint: meta.tokenEndpoint,
          mcpServerUrl: disc.mcpEndpointUrl ?? connector.server_url,
          scopes: meta.scopesSupported,
          registrationEndpoint: meta.registrationEndpoint,
          connectorId: connector.id,
          connectorName: connector.name,
        });
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Failed to start re-authentication");
        return;
      }
      const width = 600, height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        authorizationUrl,
        "doable-mcp-oauth",
        `width=${width},height=${height},left=${left},top=${top},popup=1`,
      );
      if (!popup) {
        window.alert("Popup was blocked. Please allow popups for this site and try again.");
        return;
      }
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      const messageHandler = (ev: MessageEvent) => {
        const data = ev.data;
        if (!data || typeof data !== "object" || data.type !== "doable:mcp-oauth-complete") return;
        window.removeEventListener("message", messageHandler);
        if (pollTimer) clearInterval(pollTimer);
        void refresh();
      };
      window.addEventListener("message", messageHandler);
      pollTimer = setInterval(() => {
        if (popup.closed) {
          if (pollTimer) clearInterval(pollTimer);
          window.removeEventListener("message", messageHandler);
          void refresh();
        }
      }, 500);
    },
    [discoverServer, startOAuth, refresh],
  );

  const activeCount = connectors.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">MCP Servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Model Context Protocol servers to give your AI assistant access to external tools and data.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void refresh()}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add MCP Server
          </button>
        </div>
      </div>

      {/* Stats */}
      {connectors.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{connectors.length} server{connectors.length !== 1 ? "s" : ""} configured</span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {activeCount} active
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <AddServerForm
          onSubmit={handleCreated}
          onCancel={() => setShowForm(false)}
          onDiscover={discoverServer}
          onStartOAuth={startOAuth}
          onOAuthComplete={refresh}
        />
      )}

      {/* Loading */}
      {loading && connectors.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading MCP servers...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && connectors.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Terminal className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No MCP servers configured</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            MCP servers let your AI assistant use external tools like databases, APIs, file systems, and more.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Your First Server
          </button>
        </div>
      )}

      {/* Connector list */}
      {connectors.length > 0 && (
        <div className="space-y-2">
          {connectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              expanded={expandedId === connector.id}
              onToggle={() =>
                setExpandedId(expandedId === connector.id ? null : connector.id)
              }
              onTest={() => void testConnector(connector.id)}
              onToggleActive={() =>
                void updateConnector(connector.id, {
                  status: connector.status === "active" ? "inactive" : "active",
                })
              }
              onDelete={() => void deleteConnector(connector.id)}
              onReconnect={
                connector.auth_type === "oauth2"
                  ? () => void handleReconnect(connector)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
