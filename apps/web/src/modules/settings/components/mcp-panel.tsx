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

// ─── Types ──────────────────────────────────────────────────

interface McpPanelProps {
  workspaceId: string;
}

// ─── Status Dot ─────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
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

function TransportBadge({ type }: { type: McpConnector["transport_type"] }) {
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

function ConnectorCard({
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

  const toolCount = connector.capabilities_cache
    ? (connector.capabilities_cache as { tools?: { count?: number } }).tools?.count ?? 0
    : 0;

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Parent passes async test — we just signal it
      onTest();
      // Wait briefly for visual feedback
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
          {/* Description */}
          {connector.description && (
            <div className="px-4 py-3 border-b">
              <p className="text-xs text-muted-foreground">{connector.description}</p>
            </div>
          )}

          {/* Config details */}
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
              {connector.server_args && connector.server_args.length > 0 && (
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

          {/* Error */}
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

          {/* Test result */}
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

          {/* Actions */}
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

// ─── Add Server Form ────────────────────────────────────────

function AddServerForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: CreateConnectorPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transportType, setTransportType] = useState<McpConnector["transport_type"]>("streamable_http");
  const [serverUrl, setServerUrl] = useState("");
  const [serverCommand, setServerCommand] = useState("");
  const [serverArgs, setServerArgs] = useState("");
  const [authType, setAuthType] = useState<"none" | "api_key" | "bearer_token">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHttp = transportType !== "stdio";

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (isHttp && !serverUrl.trim()) { setError("Server URL is required for HTTP transports"); return; }
    if (!isHttp && !serverCommand.trim()) { setError("Command is required for stdio transport"); return; }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        transportType,
        scope: "workspace",
        serverUrl: isHttp ? serverUrl.trim() : undefined,
        serverCommand: !isHttp ? serverCommand.trim() : undefined,
        serverArgs: !isHttp && serverArgs.trim()
          ? serverArgs.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        authType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setSaving(false);
    }
  }, [name, description, transportType, serverUrl, serverCommand, serverArgs, authType, isHttp, onSubmit]);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Add MCP Server</h3>
        <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My MCP Server"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this server provide?"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Transport Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Transport Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(TRANSPORT_LABELS) as [McpConnector["transport_type"], { label: string; description: string }][]).map(
              ([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTransportType(key)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    transportType === key
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {key === "stdio" ? (
                      <Terminal className="h-3.5 w-3.5" />
                    ) : key === "http_sse" ? (
                      <Radio className="h-3.5 w-3.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    <span className="text-xs font-medium">{val.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{val.description}</p>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Server URL (HTTP transports) */}
        {isHttp && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Server URL *</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://mcp.example.com/v1"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {/* Command + Args (stdio) */}
        {!isHttp && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Command *</label>
              <input
                type="text"
                value={serverCommand}
                onChange={(e) => setServerCommand(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-filesystem"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Arguments (comma-separated)</label>
              <input
                type="text"
                value={serverArgs}
                onChange={(e) => setServerArgs(e.target.value)}
                placeholder="/path/to/dir, --verbose"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </>
        )}

        {/* Auth Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Authentication</label>
          <div className="flex gap-2">
            {([
              ["none", "None"],
              ["api_key", "API Key"],
              ["bearer_token", "Bearer Token"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAuthType(key)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  authType === key
                    ? "border-primary bg-primary/5 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add Server
          </button>
        </div>
      </div>
    </div>
  );
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
