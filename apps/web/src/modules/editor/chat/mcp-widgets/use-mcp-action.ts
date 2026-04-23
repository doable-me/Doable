"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface McpActionPayload {
  projectId: string;
  toolCallId: string;
  connectorId: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface McpActionResult {
  success: boolean;
  error?: string;
  state?: Record<string, unknown>;
  instructions?: string;
}

export function useMcpAction(projectId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitAction = useCallback(
    async (params: Omit<McpActionPayload, "projectId">): Promise<McpActionResult> => {
      if (!projectId) return { success: false, error: "No project" };
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/projects/${projectId}/chat/mcp-action`, {
          method: "POST",
          body: JSON.stringify({ projectId, ...params }),
        });
        return res as McpActionResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Action failed";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  return { submitAction, loading, error };
}
