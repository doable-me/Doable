"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description?: string;
}

export interface McpServerCard {
  $schema?: string;
  version?: string;
  protocolVersion?: string;
  serverInfo?: {
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
  };
  transport?: {
    type?: string;
    url?: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  auth?: {
    type?: string;
    [key: string]: unknown;
  };
}

export interface OAuthMetadata {
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revocationEndpoint?: string;
  scopesSupported?: string[];
  grantTypesSupported?: string[];
  codeChallengeMethodsSupported?: string[];
  registrationEndpoint?: string;
  resourceMetadataUrl?: string;
  resource?: string;
}

export interface DiscoveryResult {
  success: boolean;
  method: "server-card" | "mcp-probe" | "none";
  serverCard?: McpServerCard;
  name?: string;
  description?: string;
  transportType?: "streamable_http" | "http_sse";
  mcpEndpointUrl?: string;
  authType?: "none" | "api_key" | "oauth2" | "bearer_token";
  capabilities?: Record<string, unknown>;
  tools?: McpTool[];
  toolCount?: number;
  oauthMetadata?: OAuthMetadata;
  error?: string;
}

export interface McpConnector {
  id: string;
  workspace_id: string;
  project_id: string | null;
  created_by: string;
  scope: "workspace" | "project" | "user";
  name: string;
  description: string | null;
  transport_type: "streamable_http" | "http_sse" | "stdio";
  server_url: string | null;
  server_command: string | null;
  server_args: string[];
  auth_type: "none" | "api_key" | "oauth2" | "bearer_token";
  status: "active" | "inactive" | "error" | "connecting";
  capabilities_cache: Record<string, unknown> | null;
  last_connected_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectorPayload {
  name: string;
  description?: string;
  transportType: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  serverUrl?: string;
  serverCommand?: string;
  serverArgs?: string[];
  authType: "none" | "api_key" | "bearer_token" | "oauth2";
  projectId?: string;
  /** Auth credentials — shape depends on authType. Encrypted server-side. */
  credentials?: Record<string, unknown>;
  /** Env vars passed to stdio MCP servers. Encrypted server-side. */
  serverEnv?: Record<string, string>;
}

export interface TestResult {
  success: boolean;
  toolCount: number;
  tools?: McpTool[];
  error?: string;
}

export const TRANSPORT_LABELS: Record<
  McpConnector["transport_type"],
  { label: string; description: string }
> = {
  streamable_http: { label: "HTTP (Streamable)", description: "Connect to an HTTP-based MCP server with streaming support" },
  http_sse: { label: "Server-Sent Events (SSE)", description: "Connect via HTTP with Server-Sent Events" },
  // stdio kept for display of existing builtin connectors but hidden from the
  // "add" form — user-created stdio connectors are blocked server-side.
  stdio: { label: "Built-in App", description: "Server-managed local process" },
};

/** Transport types available for user-created connectors (excludes stdio). */
export const USER_TRANSPORT_TYPES = ["streamable_http", "http_sse"] as const;

// ─── Hook ───────────────────────────────────────────────────

export function useMcpConnectors(workspaceId: string) {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ data: McpConnector[] }>(
        `/workspaces/${workspaceId}/connectors`,
      );
      setConnectors(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createConnector = useCallback(
    async (payload: CreateConnectorPayload) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const updateConnector = useCallback(
    async (id: string, updates: Partial<Pick<McpConnector, "name" | "description" | "status">>) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const deleteConnector = useCallback(
    async (id: string) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors/${id}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const testConnector = useCallback(
    async (id: string): Promise<TestResult> => {
      try {
        const json = await apiFetch<{ data: TestResult }>(
          `/workspaces/${workspaceId}/connectors/${id}/test`,
          { method: "POST" },
        );
        await refresh();
        return json.data;
      } catch (err) {
        return { success: false, toolCount: 0, error: err instanceof Error ? err.message : "Test failed" };
      }
    },
    [workspaceId, refresh],
  );

  const discoverServer = useCallback(
    async (url: string): Promise<DiscoveryResult> => {
      try {
        const json = await apiFetch<{ data: DiscoveryResult }>(
          `/workspaces/${workspaceId}/connectors/discover`,
          { method: "POST", body: JSON.stringify({ url }) },
        );
        return json.data;
      } catch (err) {
        return { success: false, method: "none", error: err instanceof Error ? err.message : "Discovery failed" };
      }
    },
    [workspaceId],
  );

  /** Start MCP OAuth flow — returns authorization URL for popup */
  const startOAuth = useCallback(
    async (params: {
      authorizationEndpoint: string;
      tokenEndpoint: string;
      mcpServerUrl: string;
      scopes?: string[];
      clientId?: string;
      registrationEndpoint?: string;
      connectorId?: string;
      connectorName?: string;
    }): Promise<string> => {
      const json = await apiFetch<{ data: { authorizationUrl: string } }>(
        `/workspaces/${workspaceId}/connectors/mcp-oauth/authorize`,
        { method: "POST", body: JSON.stringify(params) },
      );
      return json.data.authorizationUrl;
    },
    [workspaceId],
  );

  return {
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
  };
}
