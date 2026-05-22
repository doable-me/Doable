"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Project, ProjectStatus, PaginatedResponse } from "@doable/shared";
import { apiFetch } from "@/lib/api";

type ProjectWithStar = Project & { starred: boolean };

interface UseProjectsOptions {
  workspaceId: string | null;
  status?: ProjectStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface UseProjectsReturn {
  projects: ProjectWithStar[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createProject: (data: {
    name: string;
    slug: string;
    description?: string;
    templateId?: string;
    prompt?: string;
    folderId?: string;
  }) => Promise<ProjectWithStar>;
  updateProject: (
    id: string,
    data: Partial<Project>
  ) => Promise<ProjectWithStar>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<ProjectWithStar>;
  toggleStar: (id: string) => Promise<void>;
  moveProject: (id: string, folderId: string | null) => Promise<void>;
}

export function useProjects(opts: UseProjectsOptions): UseProjectsReturn {
  const { workspaceId, status, search, page = 1, pageSize = 20 } = opts;
  const [projects, setProjects] = useState<ProjectWithStar[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!workspaceId) {
      setProjects([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (status) params.set("status", status);
      if (search) params.set("search", search);

      const body = await apiFetch<PaginatedResponse<ProjectWithStar>>(
        `/projects?${params}`
      );
      if (controller.signal.aborted) return;

      setProjects(body.data);
      setPagination(body.pagination);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, status, search, page, pageSize]);

  useEffect(() => {
    fetchProjects();

    // Refetch when the user returns to this tab — picks up thumbnails
    // that were generated in the background while the user was in the editor.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchProjects();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchProjects]);

  const createProject = async (data: {
    name: string;
    slug: string;
    description?: string;
    templateId?: string;
    prompt?: string;
    folderId?: string;
  }): Promise<ProjectWithStar> => {
    const { data: project } = await apiFetch<{ data: ProjectWithStar }>(
      "/projects",
      {
        method: "POST",
        body: JSON.stringify({ ...data, workspaceId }),
      }
    );
    const newProject = { ...project, starred: false };
    setProjects((prev) => [newProject, ...prev]);
    return newProject;
  };

  const updateProject = async (
    id: string,
    data: Partial<Project>
  ): Promise<ProjectWithStar> => {
    const { data: updated } = await apiFetch<{ data: ProjectWithStar }>(
      `/projects/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
    );
    return updated;
  };

  const deleteProject = async (id: string): Promise<void> => {
    // Optimistic update
    const prev = projects;
    setProjects((ps) => ps.filter((p) => p.id !== id));

    try {
      await apiFetch(`/projects/${id}`, { method: "DELETE" });
    } catch {
      setProjects(prev);
    }
  };

  const duplicateProject = async (id: string): Promise<ProjectWithStar> => {
    const { data: dup } = await apiFetch<{ data: ProjectWithStar }>(
      `/projects/${id}/duplicate`,
      { method: "POST" }
    );
    const newProject = { ...dup, starred: false };
    setProjects((prev) => [newProject, ...prev]);
    return newProject;
  };

  const toggleStar = async (id: string): Promise<void> => {
    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
    );

    try {
      await apiFetch(`/projects/${id}/star`, { method: "POST" });
    } catch {
      // Revert
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))
      );
    }
  };

  const moveProject = async (
    id: string,
    folderId: string | null
  ): Promise<void> => {
    await apiFetch(`/projects/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ folderId }),
    });
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, folderId } : p))
    );
  };

  return {
    projects,
    pagination,
    loading,
    error,
    refetch: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    toggleStar,
    moveProject,
  };
}
