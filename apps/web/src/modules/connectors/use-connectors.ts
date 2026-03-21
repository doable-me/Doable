"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface ConnectorTool {
  name: string;
  description: string;
}

export interface Connector {
  id: string;
  name: string;
  transportType: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  status: "active" | "error" | "inactive";
  statusMessage?: string;
  serverUrl?: string;
  serverCommand?: string;
  authType: "none" | "api_key" | "bearer_token";
  tools: ConnectorTool[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectorPayload {
  name: string;
  transportType: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  serverUrl?: string;
  serverCommand?: string;
  authType: "none" | "api_key" | "bearer_token";
  authCredential?: string;
}

// ─── Hook ───────────────────────────────────────────────────

export function useConnectors(workspaceId: string, apiBaseUrl = "/api") {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/connectors`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load connectors");
      const json = (await res.json()) as { data: Connector[] };
      setConnectors(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, apiBaseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConnector = useCallback(
    async (payload: CreateConnectorPayload) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/connectors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to create connector");
      }
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const deleteConnector = useCallback(
    async (connectorId: string) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/connectors/${connectorId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to delete connector");
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const testConnector = useCallback(
    async (connectorId: string): Promise<{ ok: boolean; message: string }> => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/connectors/${connectorId}/test`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json()) as {
        data?: { ok: boolean; message: string };
        error?: string;
      };
      if (!res.ok) {
        return { ok: false, message: json.error ?? "Test failed" };
      }
      // Refresh to get updated status after test
      await refresh();
      return json.data ?? { ok: true, message: "Connection successful" };
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  return {
    connectors,
    loading,
    error,
    refresh,
    createConnector,
    deleteConnector,
    testConnector,
  };
}
