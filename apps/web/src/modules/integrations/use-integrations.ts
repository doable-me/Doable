"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { WorkspaceRole } from "@doable/shared";

// ─── Types ──────────────────────────────────────────────────

export interface IntegrationTool {
  name: string;
  description: string;
}

export interface CustomIntegration {
  id: string;
  name: string;
  transport_type: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  status: "active" | "error" | "inactive";
  error_message?: string;
  server_url?: string;
  server_command?: string;
  auth_type: "none" | "api_key" | "bearer_token";
  tools?: IntegrationTool[];
  created_at: string;
  updated_at: string;
}

export interface GitHubStatus {
  connected: boolean;
  status: string;
  repoUrl: string | null;
  branch: string;
  lastSyncedAt: string | null;
}

export interface CreateIntegrationPayload {
  name: string;
  transportType: "streamable_http" | "http_sse" | "stdio";
  scope: "workspace" | "project" | "user";
  serverUrl?: string;
  serverCommand?: string;
  authType: "none" | "api_key" | "bearer_token";
}

// ─── Transport Labels ───────────────────────────────────────

export const TRANSPORT_LABELS: Record<CustomIntegration["transport_type"], { friendly: string; technical: string }> = {
  streamable_http: { friendly: "Web service", technical: "HTTP streaming" },
  http_sse: { friendly: "Web service", technical: "HTTP SSE" },
  // stdio kept for display of existing builtin connectors but hidden from the
  // "add" form — user-created stdio connectors are blocked server-side.
  stdio: { friendly: "Built-in app", technical: "managed" },
};

export const SCOPE_LABELS: Record<CustomIntegration["scope"], string> = {
  workspace: "Everyone in this workspace",
  project: "Everyone on this project",
  user: "Only me (personal)",
};

export type { WorkspaceRole } from "@doable/shared";

// ─── Hook ───────────────────────────────────────────────────

export function useIntegrations(workspaceId: string, projectId?: string) {
  const [integrations, setIntegrations] = useState<CustomIntegration[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubLoading, setGithubLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ data: CustomIntegration[]; role?: WorkspaceRole }>(
        `/workspaces/${workspaceId}/connectors`
      );
      setIntegrations(json.data);
      if (json.role) setRole(json.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const refreshGithub = useCallback(async () => {
    if (!projectId) {
      setGithubLoading(false);
      return;
    }
    setGithubLoading(true);
    try {
      const res = await apiFetch<{ data: GitHubStatus }>(
        `/projects/${projectId}/github/status`
      );
      setGithubStatus(res.data);
    } catch {
      setGithubStatus(null);
    } finally {
      setGithubLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshGithub();
  }, [refreshGithub]);

  const createIntegration = useCallback(
    async (payload: CreateIntegrationPayload) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const deleteIntegration = useCallback(
    async (integrationId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/connectors/${integrationId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const testIntegration = useCallback(
    async (integrationId: string): Promise<{ success: boolean; error?: string; toolCount?: number }> => {
      try {
        const json = await apiFetch<{ data: { success: boolean; error?: string; toolCount?: number } }>(
          `/workspaces/${workspaceId}/connectors/${integrationId}/test`,
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

  const disconnectGithub = useCallback(
    async () => {
      if (!projectId) return;
      await apiFetch(`/projects/${projectId}/github/connect`, {
        method: "DELETE",
      });
      setGithubStatus(null);
    },
    [projectId]
  );

  // Group integrations by scope
  const workspaceIntegrations = integrations.filter((i) => i.scope === "workspace");
  const projectIntegrations = integrations.filter((i) => i.scope === "project");
  const userIntegrations = integrations.filter((i) => i.scope === "user");

  const isAdmin = role === "owner" || role === "admin";

  return {
    integrations,
    workspaceIntegrations,
    projectIntegrations,
    userIntegrations,
    githubStatus,
    loading,
    githubLoading,
    error,
    role,
    isAdmin,
    refresh,
    refreshGithub,
    createIntegration,
    deleteIntegration,
    testIntegration,
    disconnectGithub,
  };
}
