import { apiFetch } from "./api-core";

// ─── Project Types (frontend) ─────────────────────────────

export interface ApiProject {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  visibility: string;
  github_repo_url: string | null;
  published_url: string | null;
  thumbnail_url: string | null;
  template_id: string | null;
  folder_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  starred: boolean;
}

// ─── Project API Methods ──────────────────────────────────

export async function apiListProjects(opts?: {
  workspaceId?: string;
  search?: string;
  status?: string;
  folderId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: ApiProject[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
  const params = new URLSearchParams();
  if (opts?.workspaceId) params.set("workspaceId", opts.workspaceId);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.folderId) params.set("folderId", opts.folderId);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch(`/projects${qs ? `?${qs}` : ""}`);
}

export async function apiListSharedProjects(opts?: {
  page?: number;
  pageSize?: number;
}): Promise<{ data: ApiProject[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch(`/projects/shared${qs ? `?${qs}` : ""}`);
}

export async function apiGetShareStats(projectId: string): Promise<{
  data: {
    uniqueVisitors: number;
    totalVisits: number;
    visitors: Array<{
      user_id: string;
      display_name: string | null;
      email: string;
      visit_count: number;
      first_visited_at: string;
      last_visited_at: string;
    }>;
  };
}> {
  return apiFetch(`/projects/${projectId}/share-stats`);
}

export interface ApiInstanceMetrics {
  state: "running" | "stopped" | "failed" | "unknown";
  uptimeMs: number | null;
  memoryBytes: number | null;
  cpuPct: number | null;
  source: "cgroup" | "ps" | "none";
}

export interface ApiWorkspaceInstance extends ApiInstanceMetrics {
  projectId: string;
  projectName: string;
  projectSlug: string;
  dbState: string;
  failCount: number;
  lastActiveAt: string | null;
}

export async function apiGetRuntimeMetrics(projectId: string): Promise<{ data: ApiInstanceMetrics }> {
  return apiFetch(`/projects/${projectId}/runtime/metrics`);
}

export async function apiListWorkspaceInstances(workspaceId: string): Promise<{ data: ApiWorkspaceInstance[] }> {
  return apiFetch(`/workspaces/${workspaceId}/runtime/instances`);
}

export async function apiCreateProject(data: {
  name: string;
  slug?: string;
  description?: string;
  workspaceId?: string;
  prompt?: string;
  templateId?: string;
  frameworkId?: string;
}): Promise<{ data: ApiProject }> {
  return apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiGetProject(id: string): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}`);
}

export async function apiUpdateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
    visibility?: string;
    folderId?: string | null;
  }
): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function apiDeleteProject(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  return apiFetch(`/projects/${id}`, {
    method: "DELETE",
  });
}

export async function apiDuplicateProject(id: string): Promise<{ data: ApiProject }> {
  return apiFetch(`/projects/${id}/duplicate`, {
    method: "POST",
  });
}

export async function apiToggleStarProject(id: string): Promise<{ data: { projectId: string; starred: boolean } }> {
  return apiFetch(`/projects/${id}/star`, {
    method: "POST",
  });
}

export async function apiListStarredProjects(): Promise<{ data: ApiProject[] }> {
  return apiFetch("/projects/starred");
}

export async function apiListRecentlyViewed(opts?: {
  workspaceId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: ApiProject[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }> {
  const params = new URLSearchParams();
  if (opts?.workspaceId) params.set("workspaceId", opts.workspaceId);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch(`/projects/recently-viewed${qs ? `?${qs}` : ""}`);
}

export async function apiRecordProjectView(id: string): Promise<void> {
  await apiFetch(`/projects/${id}/view`, { method: "POST" });
}

// ─── Collaborator Types & Methods ──────────────────────────

export interface ApiCollaborator {
  user_id: string;
  role: string;
  added_at: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export async function apiListCollaborators(id: string): Promise<{ data: ApiCollaborator[] }> {
  return apiFetch(`/projects/${id}/collaborators`);
}

export async function apiRemoveCollaborator(projectId: string, userId: string): Promise<{ data: { removed: boolean } }> {
  return apiFetch(`/projects/${projectId}/collaborators/${userId}`, {
    method: "DELETE",
  });
}
