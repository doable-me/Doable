"use client";

import { apiFetch } from "@/lib/api";

export type NamedQuerySummary = { name: string; description?: string };

export type NamedQueryDetail = {
  name: string;
  description?: string;
  params: Record<
    string,
    { type?: string; required?: boolean; default?: unknown; max?: number; min?: number }
  >;
  allow?: string[];
  sqlPreview: string;
};

export type WorkflowSummary = { id: string; hasSource: boolean };

export type DataTemplateItem = { slug: string; applied: boolean };

export type RunRecord = {
  id: string;
  workflow_id: string;
  status: string;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  logs?: Array<{ ts: string; level: string; message: string; data?: unknown }>;
};

export async function fetchNamedQueries(projectId: string) {
  return apiFetch<{ data: NamedQuerySummary[] }>(`/projects/${projectId}/backend/queries`);
}

export async function fetchNamedQuery(projectId: string, name: string) {
  return apiFetch<{ data: NamedQueryDetail }>(`/projects/${projectId}/backend/queries/${name}`);
}

export async function testNamedQuery(
  projectId: string,
  name: string,
  body: { params?: Record<string, unknown>; app_user_id?: string },
) {
  return apiFetch<{ data: { ok: boolean; rows?: unknown[]; rowCount?: number; error?: unknown; message?: string } }>(
    `/projects/${projectId}/backend/queries/${name}/test`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function fetchWorkflows(projectId: string) {
  return apiFetch<{ data: WorkflowSummary[] }>(`/projects/${projectId}/backend/workflows`);
}

export async function testWorkflow(
  projectId: string,
  workflowId: string,
  body: { payload?: Record<string, unknown>; dryRun?: boolean },
) {
  return apiFetch<{ data: { ok: boolean; runId?: string; message?: string } }>(
    `/projects/${projectId}/backend/workflows/${workflowId}/test`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function fetchRun(projectId: string, runId: string) {
  return apiFetch<{ data: RunRecord }>(`/projects/${projectId}/backend/runs/${runId}`);
}

export async function fetchDataTemplates(projectId: string) {
  return apiFetch<{ data: { available: DataTemplateItem[]; applied: string[] } }>(
    `/projects/${projectId}/backend/data-templates`,
  );
}

export async function applyDataTemplate(projectId: string, slug: string) {
  return apiFetch<{ data: { ok: boolean; migrations?: string[]; seeded?: boolean; message?: string } }>(
    `/projects/${projectId}/backend/data-templates/${slug}/apply`,
    { method: "POST", body: "{}" },
  );
}
