"use client";

import { useState, useEffect, useCallback } from "react";
import type { Workspace } from "@doable/shared";
import { apiFetch } from "@/lib/api";

const ACTIVE_WS_KEY = "doable_active_workspace_id";

interface UseWorkspacesReturn {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (id: string) => void;
  loading: boolean;
  error: string | null;
  createWorkspace: (data: {
    name: string;
    slug: string;
    description?: string;
  }) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    data: Partial<Pick<Workspace, "name" | "description" | "avatarUrl">>
  ) => Promise<Workspace>;
  refetch: () => void;
}

export function useWorkspaces(): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiFetch<{ data: Workspace[] }>("/workspaces");
      setWorkspaces(data);

      if (data.length > 0) {
        const persisted =
          typeof window !== "undefined"
            ? localStorage.getItem(ACTIVE_WS_KEY)
            : null;
        const found = data.find((w: Workspace) => w.id === persisted);
        setActiveId(found ? found.id : data[0]?.id ?? null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_WS_KEY, id);
    }
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;

  const createWorkspace = async (data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Workspace> => {
    const { data: workspace } = await apiFetch<{ data: Workspace }>(
      "/workspaces",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    setWorkspaces((prev) => [...prev, workspace]);
    setActiveWorkspaceId(workspace.id);
    return workspace;
  };

  const updateWorkspace = async (
    id: string,
    data: Partial<Pick<Workspace, "name" | "description" | "avatarUrl">>
  ): Promise<Workspace> => {
    const { data: updated } = await apiFetch<{ data: Workspace }>(
      `/workspaces/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updated } : w))
    );
    return updated;
  };

  return {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    loading,
    error,
    createWorkspace,
    updateWorkspace,
    refetch: fetchWorkspaces,
  };
}
