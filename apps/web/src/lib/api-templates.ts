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

export async function apiPublishProject(
  projectId: string,
  data: { title: string; description?: string; category?: string }
): Promise<{ data: ApiPublicProject }> {
  return apiFetch(`/community/${projectId}/publish`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

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
