import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { envVarQueries, workspaceQueries, projectQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { validateProjectIdParam } from "./projects/helpers.js";

const vars = envVarQueries(sql);
const workspaces = workspaceQueries(sql);
const projects = projectQueries(sql);

// ─── Helpers ────────────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── Schemas ────────────────────────────────────────────────

const createSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a valid env var name"),
  value: z.string().max(10000),
  isSecret: z.boolean().optional().default(true),
  target: z.enum(["development", "preview", "production", "all"]).optional().default("all"),
  description: z.string().max(500).optional().default(""),
});

const updateSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
  value: z.string().max(10000).optional(),
  isSecret: z.boolean().optional(),
  target: z.enum(["development", "preview", "production", "all"]).optional(),
  description: z.string().max(500).optional(),
});

// ─── Workspace-scoped env vars ──────────────────────────────

export const wsEnvVarRoutes = new Hono<AuthEnv>({ strict: false });
wsEnvVarRoutes.use("*", authMiddleware);

// GET /workspaces/:workspaceId/env-vars
wsEnvVarRoutes.get("/:workspaceId/env-vars", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await vars.listForWorkspace(workspaceId);
  return c.json({ data });
});

// POST /workspaces/:workspaceId/env-vars
wsEnvVarRoutes.post(
  "/:workspaceId/env-vars",
  zValidator("json", createSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    try {
      const row = await vars.create({
        workspaceId,
        scope: "workspace",
        key: body.key,
        value: body.value,
        isSecret: body.isSecret,
        target: body.target,
        description: body.description,
        createdBy: userId,
      });
      return c.json({ data: row }, 201);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("duplicate key")) {
        return c.json({ error: `Variable "${body.key}" already exists for target "${body.target}"` }, 409);
      }
      throw e;
    }
  },
);

// PUT /workspaces/:workspaceId/env-vars/:varId
wsEnvVarRoutes.put(
  "/:workspaceId/env-vars/:varId",
  zValidator("json", updateSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const varId = c.req.param("varId");
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await vars.update(varId, body);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  },
);

// DELETE /workspaces/:workspaceId/env-vars/:varId
wsEnvVarRoutes.delete("/:workspaceId/env-vars/:varId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const varId = c.req.param("varId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await vars.remove(varId);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// ─── Project-scoped env vars ────────────────────────────────

export const projEnvVarRoutes = new Hono<AuthEnv>({ strict: false });
projEnvVarRoutes.use("*", authMiddleware);
// BUG-CORPUS-PROJ-003: reject non-UUID :projectId before SQL → 400, not 500.
projEnvVarRoutes.use("/:projectId/env-vars", validateProjectIdParam("projectId"));
projEnvVarRoutes.use("/:projectId/env-vars/*", validateProjectIdParam("projectId"));

// GET /projects/:projectId/env-vars
projEnvVarRoutes.get("/:projectId/env-vars", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  const err = await requireMember(project.workspace_id, userId);
  if (err) return c.json({ error: err }, 403);

  const projectVars = await vars.listForProject(projectId);
  return c.json({ data: projectVars });
});

// POST /projects/:projectId/env-vars
projEnvVarRoutes.post(
  "/:projectId/env-vars",
  zValidator("json", createSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const project = await projects.findById(projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);
    const err = await requireMember(project.workspace_id, userId);
    if (err) return c.json({ error: err }, 403);

    try {
      const row = await vars.create({
        workspaceId: project.workspace_id,
        projectId,
        scope: "project",
        key: body.key,
        value: body.value,
        isSecret: body.isSecret,
        target: body.target,
        description: body.description,
        createdBy: userId,
      });
      return c.json({ data: row }, 201);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("duplicate key")) {
        return c.json({ error: `Variable "${body.key}" already exists for target "${body.target}"` }, 409);
      }
      throw e;
    }
  },
);

// PUT /projects/:projectId/env-vars/:varId
projEnvVarRoutes.put(
  "/:projectId/env-vars/:varId",
  zValidator("json", updateSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const varId = c.req.param("varId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const project = await projects.findById(projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);
    const err = await requireMember(project.workspace_id, userId);
    if (err) return c.json({ error: err }, 403);

    const row = await vars.update(varId, body);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  },
);

// DELETE /projects/:projectId/env-vars/:varId
projEnvVarRoutes.delete("/:projectId/env-vars/:varId", async (c) => {
  const projectId = c.req.param("projectId");
  const varId = c.req.param("varId");
  const userId = c.get("userId");

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  const err = await requireMember(project.workspace_id, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await vars.remove(varId);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// ─── Resolved vars (merged workspace + project for a target) ─

// GET /projects/:projectId/env-vars/resolved?target=development
projEnvVarRoutes.get("/:projectId/env-vars/resolved", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");
  const target = (c.req.query("target") ?? "development") as "development" | "preview" | "production";

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  const err = await requireMember(project.workspace_id, userId);
  if (err) return c.json({ error: err }, 403);

  const resolved = await vars.resolveForProject(project.workspace_id, projectId, target);
  return c.json({ data: resolved });
});

// ─── Reveal non-secret value (standalone) ───────────────────

export const envVarUtilRoutes = new Hono<AuthEnv>({ strict: false });
envVarUtilRoutes.use("*", authMiddleware);

// GET /env-vars/:varId/value
envVarUtilRoutes.get("/:varId/value", async (c) => {
  const varId = c.req.param("varId");
  const userId = c.get("userId");

  // Verify user is a member of the workspace that owns this env var
  const [envVar] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM env_vars WHERE id = ${varId}
  `;
  if (!envVar) return c.json({ error: "Not found" }, 404);

  const err = await requireMember(envVar.workspace_id, userId);
  if (err) return c.json({ error: err }, 403);

  const val = await vars.getDecryptedValue(varId);
  if (val === null) return c.json({ error: "Not found" }, 404);
  return c.json({ data: val });
});
