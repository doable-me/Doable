import { apiFetch } from "./api-core";

// ─── Template Types ─────────────────────────────────────────

export interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags?: string[];
  previewImageUrl: string | null;
  isOfficial: boolean;
  fileCount: number;
}

// ─── Template API Methods ─────────────────────────────────

export async function apiListTemplates(opts?: { category?: string; search?: string }): Promise<{ data: { templates: ApiTemplate[]; categories: string[] } }> {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.search) params.set("search", opts.search);
  const qs = params.toString();
  return apiFetch(`/templates${qs ? `?${qs}` : ""}`);
}

export async function apiUseTemplate(templateId: string, projectName: string): Promise<{ data: { projectId: string } }> {
  return apiFetch(`/templates/${templateId}/use`, {
    method: "POST",
    body: JSON.stringify({ projectName }),
  });
}

// ─── Community Types ──────────────────────────────────────

export interface ApiPublicProject {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  remix_count: number;
  view_count: number;
  featured: boolean;
  published_at: string;
}

// ─── Community API Methods ──────────────────────────────────

export async function apiDiscoverProjects(opts?: {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  data: {
    projects: ApiPublicProject[];
    total: number;
    page: number;
    pageSize: number;
  };
}> {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch(`/community/discover${qs ? `?${qs}` : ""}`);
}

export async function apiFeaturedProjects(): Promise<{
  data: { projects: ApiPublicProject[] };
}> {
  return apiFetch("/community/featured");
}

export async function apiCommunityCategories(): Promise<{
  data: { categories: string[] };
}> {
  return apiFetch("/community/categories");
}

export async function apiRemixProject(
  projectId: string,
  projectName?: string
): Promise<{
  data: { projectId: string; sourceProjectId: string; name: string; filesCopied: number };
}> {
  return apiFetch(`/community/${projectId}/remix`, {
    method: "POST",
    body: JSON.stringify({ projectName }),
  });
}

/**
 * Share a project to the Discover community feed.
 * Canonical surface as of Phase 1; the legacy `/publish` endpoint still
 * works via 308 redirect.
 */
export async function apiShareProject(
  projectId: string,
  data: { title: string; description?: string; category?: string; thumbnailUrl?: string }
): Promise<{ data: ApiPublicProject }> {
  return apiFetch(`/community/${projectId}/share`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Unshare a previously-shared project from Discover. */
export async function apiUnshareProject(
  projectId: string
): Promise<{ data: { success: boolean } }> {
  return apiFetch(`/community/${projectId}/share`, { method: "DELETE" });
}

/**
 * Returns the set of project_ids the current user has shared. Used by
 * the dashboard to badge cards without N+1 queries.
 */
export async function apiMySharedProjects(): Promise<{
  data: { projectIds: string[] };
}> {
  return apiFetch("/community/my/shared");
}

/** Admin-only: toggle the featured flag on a public project. */
export async function apiSetProjectFeatured(
  projectId: string,
  featured: boolean
): Promise<{ data: ApiPublicProject }> {
  return apiFetch(`/community/${projectId}/featured`, {
    method: "PUT",
    body: JSON.stringify({ featured }),
  });
}

/** @deprecated use `apiShareProject` — kept for in-flight callers. */
export const apiPublishProject = apiShareProject;

// ─── Custom Domain Types & API Methods ───────────────────

export interface ApiCustomDomain {
  id: string;
  project_id: string;
  domain: string;
  status: "pending" | "verifying" | "ssl_pending" | "active" | "failed" | "removing";
  cloudflare_hostname_id: string | null;
  ssl_status: string | null;
  verification_txt_name: string | null;
  verification_txt_value: string | null;
  cname_target: string;
  verification_errors: string | null;
  last_checked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function apiListCustomDomains(
  projectId: string
): Promise<{ data: ApiCustomDomain[] }> {
  return apiFetch(`/domains/project/${projectId}`);
}

export async function apiAddCustomDomain(
  projectId: string,
  domain: string
): Promise<{ data: ApiCustomDomain }> {
  return apiFetch(`/domains/project/${projectId}`, {
    method: "POST",
    body: JSON.stringify({ domain }),
  });
}

export async function apiRemoveCustomDomain(
  domainId: string
): Promise<{ data: { id: string; removed: boolean } }> {
  return apiFetch(`/domains/${domainId}`, {
    method: "DELETE",
  });
}

export async function apiVerifyCustomDomain(
  domainId: string
): Promise<{ data: ApiCustomDomain }> {
  return apiFetch(`/domains/${domainId}/verify`, {
    method: "POST",
  });
}
