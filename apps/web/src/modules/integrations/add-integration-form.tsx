"use client";

import { useState, useCallback } from "react";
import { Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIntegrations, TRANSPORT_LABELS } from "./use-integrations";

// ─── Types ──────────────────────────────────────────────────

interface AddIntegrationFormProps {
  workspaceId: string;
  isAdmin?: boolean;
  onCreated: () => void;
  onCancel: () => void;
}

type TransportType = "streamable_http" | "http_sse" | "stdio";
type AuthType = "none" | "api_key" | "bearer_token";
type ScopeType = "workspace" | "project" | "user";

// ─── Component ──────────────────────────────────────────────

export function AddIntegrationForm({
  workspaceId,
  isAdmin = false,
  onCreated,
  onCancel,
}: AddIntegrationFormProps) {
  const { createIntegration } = useIntegrations(workspaceId);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<ScopeType>(isAdmin ? "workspace" : "user");
  const [transportType, setTransportType] = useState<TransportType>("streamable_http");
  const [serverUrl, setServerUrl] = useState("");
  const [serverCommand, setServerCommand] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [authCredential, setAuthCredential] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isHttp = transportType === "streamable_http" || transportType === "http_sse";

  const canSubmit =
    name.trim().length > 0 &&
    (isHttp ? serverUrl.trim().length > 0 : serverCommand.trim().length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createIntegration({
        name: name.trim(),
        scope,
        transportType,
        serverUrl: isHttp ? serverUrl.trim() : undefined,
        serverCommand: !isHttp ? serverCommand.trim() : undefined,
        authType,
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
    createIntegration,
    onCreated,
  ]);

  return (
    <div className="rounded-xl border bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">New Integration</span>
        <button
          onClick={onCancel}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Notion, Slack, My API"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
          />
        </div>

        {/* Availability (scope) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Availability
          </label>
          <div className={cn("grid gap-2", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
            {([
              ...(isAdmin ? [{ value: "workspace" as const, label: "Everyone", desc: "All workspace members" }] : []),
              { value: "project" as const, label: "This project", desc: "Project members" },
              { value: "user" as const, label: "Only me", desc: "Personal" },
            ]).map((option) => (
              <button
                key={option.value}
                onClick={() => setScope(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  scope === option.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-input hover:bg-muted/50"
                )}
              >
                <p className="text-xs font-medium">{option.label}</p>
                <p className="text-[10px] text-muted-foreground">{option.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Server URL (default for HTTP) */}
        {isHttp && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Server URL
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://api.example.com/mcp"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Server Command (for stdio) */}
        {!isHttp && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Command
            </label>
            <input
              type="text"
              value={serverCommand}
              onChange={(e) => setServerCommand(e.target.value)}
              placeholder="npx -y @modelcontextprotocol/server"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
            />
          </div>
        )}

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAdvanced ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-1 border-l-2 border-muted ml-1">
            {/* Connection type */}
            <div className="pl-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Connection Type
              </label>
              <select
                value={transportType}
                onChange={(e) => setTransportType(e.target.value as TransportType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="streamable_http">
                  Web service (HTTP streaming)
                </option>
                <option value="http_sse">
                  Web service (HTTP SSE)
                </option>
              </select>
            </div>

            {/* Authentication */}
            <div className="pl-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Authentication
              </label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="none">None</option>
                <option value="api_key">API Key</option>
                <option value="bearer_token">Bearer Token</option>
              </select>
            </div>

            {/* Auth credential */}
            {authType !== "none" && (
              <div className="pl-3">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {authType === "api_key" ? "API Key" : "Bearer Token"}
                </label>
                <input
                  type="password"
                  value={authCredential}
                  onChange={(e) => setAuthCredential(e.target.value)}
                  placeholder={authType === "api_key" ? "sk-..." : "eyJhbGci..."}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !canSubmit}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add Integration
          </button>
        </div>
      </div>
    </div>
  );
}
