"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

export interface ConnectorTool {
  name: string;
  description: string;
}

export interface Connector {
  id: string;
  name: string;
  transport_type: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  status: "active" | "error" | "inactive";
  error_message?: string;
  server_url?: string;
  server_command?: string;
  auth_type: "none" | "api_key" | "bearer_token";
  created_at: string;
  updated_at: string;
}

export interface CreateConnectorPayload {
  name: string;
  transportType: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  serverUrl?: string;
  serverCommand?: string;
  authType: "none" | "api_key" | "bearer_token";
}

// ─── Hook ───────────────────────────────────────────────────

export function useConnectors(workspaceId: string) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ data: Connector[] }>(
        `/workspaces/${workspaceId}/connectors`
      );
      setConnectors(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConnector = useCallback(
    async (payload: CreateConnectorPayload) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const deleteConnector = useCallback(
    async (connectorId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors/${connectorId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const testConnector = useCallback(
    async (connectorId: string): Promise<{ success: boolean; error?: string; toolCount?: number }> => {
      try {
        const json = await apiFetch<{ data: { success: boolean; error?: string; toolCount?: number } }>(
          `/workspaces/${workspaceId}/connectors/${connectorId}/test`,
          { method: "POST" }
        );
        await refresh();
        return json.data;
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Test failed" };
      }
    },
    [workspaceId, refresh]
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
