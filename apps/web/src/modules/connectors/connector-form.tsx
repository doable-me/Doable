"use client";

import { useState, useCallback } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectors } from "./use-connectors";

// ─── Types ──────────────────────────────────────────────────

interface ConnectorFormProps {
  workspaceId: string;
  onCreated: () => void;
  onCancel: () => void;
}

type TransportType = "streamable_http" | "http_sse" | "stdio";
type AuthType = "none" | "api_key" | "bearer_token";
type ScopeType = "workspace" | "project" | "user";

// ─── Component ──────────────────────────────────────────────

export const ConnectorForm = ({
  workspaceId,
  onCreated,
  onCancel,
}: ConnectorFormProps) => {
  const { createConnector } = useConnectors(workspaceId);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<ScopeType>("workspace");
  const [transportType, setTransportType] =
    useState<TransportType>("streamable_http");
  const [serverUrl, setServerUrl] = useState("");
  const [serverCommand, setServerCommand] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [authCredential, setAuthCredential] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHttp =
    transportType === "streamable_http" || transportType === "http_sse";

  const canSubmit =
    name.trim().length > 0 &&
    (isHttp ? serverUrl.trim().length > 0 : serverCommand.trim().length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createConnector({
        name: name.trim(),
        scope,
        transportType,
        serverUrl: isHttp ? serverUrl.trim() : undefined,
        serverCommand: !isHttp ? serverCommand.trim() : undefined,
        authType,
        authCredential:
          authType !== "none" ? authCredential.trim() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }, [
    canSubmit,
    name,
    scope,
    transportType,
    isHttp,
    serverUrl,
    serverCommand,
    authType,
    authCredential,
    createConnector,
    onCreated,
  ]);

  return (
    <div className="border rounded-md bg-muted/30">
      {/* Form header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold">New Connector</span>
        <button
          onClick={onCancel}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Fields */}
      <div className="p-3 space-y-3">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My API Server"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
          />
        </div>

        {/* Scope */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Scope
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeType)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          >
            <option value="workspace">Workspace</option>
            <option value="project">Project</option>
            <option value="user">User</option>
          </select>
        </div>

        {/* Transport Type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Transport
          </label>
          <select
            value={transportType}
            onChange={(e) => setTransportType(e.target.value as TransportType)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          >
            <option value="streamable_http">Streamable HTTP</option>
            <option value="http_sse">HTTP + SSE</option>
            <option value="stdio">stdio</option>
          </select>
        </div>

        {/* Server URL (HTTP transports) */}
        {isHttp && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Server URL
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://api.example.com/mcp"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Server Command (stdio transport) */}
        {!isHttp && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Server Command
            </label>
            <input
              type="text"
              value={serverCommand}
              onChange={(e) => setServerCommand(e.target.value)}
              placeholder="npx -y @modelcontextprotocol/server"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Auth Type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Authentication
          </label>
          <select
            value={authType}
            onChange={(e) => setAuthType(e.target.value as AuthType)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          >
            <option value="none">None</option>
            <option value="api_key">API Key</option>
            <option value="bearer_token">Bearer Token</option>
          </select>
        </div>

        {/* Auth Credential */}
        {authType !== "none" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {authType === "api_key" ? "API Key" : "Bearer Token"}
            </label>
            <input
              type="password"
              value={authCredential}
              onChange={(e) => setAuthCredential(e.target.value)}
              placeholder={
                authType === "api_key" ? "sk-..." : "eyJhbGciOiJIUzI1NiIs..."
              }
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !canSubmit}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Add Connector
          </button>
        </div>
      </div>
    </div>
  );
};
