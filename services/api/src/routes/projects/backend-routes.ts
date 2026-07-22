/**
 * Session-JWT proxy for app-runtime tooling (editor + settings Database panes).
 * Mounted at `/projects` AFTER chatRoutes (same RLS-deadlock reason as dataTokenRoutes).
 *
 * Routes:
 *   GET  /projects/:id/backend/queries
 *   GET  /projects/:id/backend/queries/:name
 *   POST /projects/:id/backend/queries/:name/test
 *   GET  /projects/:id/backend/workflows
 *   POST /projects/:id/backend/workflows/:workflowId/test
 *   GET  /projects/:id/backend/runs/:runId
 *   GET  /projects/:id/backend/data-templates
 *   POST /projects/:id/backend/data-templates/:slug/apply
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls } from "../../middleware/rls.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";
import { listQueries, loadQuery } from "../../app-runtime/queries/loader.js";
import {
  runtimeTestQuery,
  runtimeTestWorkflow,
  runtimeApplyDataTemplate,
} from "../../app-runtime/mcp-handlers.js";
import {
  enqueueWorkflowRun,
  getRun,
  resolveProjectOwner,
  readWorkflowSource,
} from "../../app-runtime/workflows/runner.js";
import { listDataTemplates } from "../../app-runtime/templates/apply.js";
import { BACKEND_DIR } from "../../app-runtime/config.js";
import { getProjectPath } from "../../projects/file-manager.js";

export const projectBackendRoutes = new Hono<AuthEnv>({ strict: false });

projectBackendRoutes.use("*", authMiddlewareWithRls);
projectBackendRoutes.use("/:id", validateProjectIdParam());
projectBackendRoutes.use("/:id/*", validateProjectIdParam());

async function requireAccess(c: { get: (k: "userId") => string; req: { param: (k: string) => string } }) {
  const id = c.req.param("id");
  const access = await requireProjectAccess(c.get("userId"), id);
  return access ? { id, access } : null;
}

// ─── Named queries ──────────────────────────────────────────

projectBackendRoutes.get("/:id/backend/queries", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const queries = await listQueries(ctx.id);
  return c.json({ data: queries });
});

projectBackendRoutes.get("/:id/backend/queries/:name", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const name = c.req.param("name");
  const def = await loadQuery(ctx.id, name);
  if (!def) return c.json({ error: "Query not found" }, 404);
  return c.json({
    data: {
      name: def.name,
      description: def.meta?.description,
      params: def.meta?.params ?? {},
      allow: def.meta?.allow,
      sqlPreview: def.sqlSource.slice(0, 2000),
    },
  });
});

projectBackendRoutes.post("/:id/backend/queries/:name/test", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const name = c.req.param("name");
  const body = (await c.req.json().catch(() => ({}))) as {
    params?: Record<string, unknown>;
    app_user_id?: string;
  };
  const result = await runtimeTestQuery(ctx.id, {
    name,
    params: body.params ?? {},
    app_user_id: body.app_user_id,
  });
  return c.json({ data: result });
});

// ─── Workflows ──────────────────────────────────────────────

async function listWorkflows(projectId: string): Promise<Array<{ id: string; hasSource: boolean }>> {
  const dir = path.join(getProjectPath(projectId), BACKEND_DIR, "workflows");
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries
    .filter((e) => e.endsWith(".workflow.js"))
    .map((e) => ({ id: e.replace(/\.workflow\.js$/, ""), hasSource: true }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

projectBackendRoutes.get("/:id/backend/workflows", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  return c.json({ data: await listWorkflows(ctx.id) });
});

projectBackendRoutes.post("/:id/backend/workflows/:workflowId/test", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const workflowId = c.req.param("workflowId");
  const body = (await c.req.json().catch(() => ({}))) as {
    payload?: Record<string, unknown>;
    dryRun?: boolean;
  };
  const dryRun = body.dryRun !== false;
  const source = await readWorkflowSource(ctx.id, workflowId);
  if (!source) return c.json({ error: "Workflow not found" }, 404);

  if (dryRun) {
    const result = await runtimeTestWorkflow(ctx.id, {
      workflow: workflowId,
      payload: body.payload ?? {},
    });
    return c.json({ data: result });
  }

  const owner = await resolveProjectOwner(ctx.id);
  if (!owner) return c.json({ error: "Project not found" }, 404);
  const { runId } = await enqueueWorkflowRun({
    projectId: ctx.id,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    workflowId,
    triggerType: "manual",
    payload: body.payload ?? {},
    dryRun: false,
  });
  return c.json({ data: { ok: true, runId } });
});

projectBackendRoutes.get("/:id/backend/runs/:runId", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const runId = c.req.param("runId");
  const run = await getRun(ctx.id, runId);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json({ data: run });
});

// ─── Data templates ─────────────────────────────────────────

async function readAppliedTemplates(projectId: string): Promise<string[]> {
  const lockPath = path.join(getProjectPath(projectId), BACKEND_DIR, "data-templates.lock.json");
  if (!existsSync(lockPath)) return [];
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf-8")) as { applied?: string[] };
    return Array.isArray(lock.applied) ? lock.applied : [];
  } catch {
    return [];
  }
}

projectBackendRoutes.get("/:id/backend/data-templates", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const available = listDataTemplates();
  const applied = await readAppliedTemplates(ctx.id);
  return c.json({
    data: {
      available: available.map((slug) => ({
        slug,
        applied: applied.includes(slug),
      })),
      applied,
    },
  });
});

projectBackendRoutes.post("/:id/backend/data-templates/:slug/apply", async (c) => {
  const ctx = await requireAccess(c);
  if (!ctx) return c.json({ error: "Project not found" }, 404);
  const slug = c.req.param("slug");
  const result = await runtimeApplyDataTemplate(ctx.id, { slug });
  return c.json({ data: result });
});
