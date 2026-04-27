import { Hono } from "hono";
import { z } from "zod";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "../../db/index.js";
import { starQueries } from "@doable/db";
import { shareTrackingQueries } from "@doable/db";
import { projectViewQueries } from "@doable/db";
import type { AuthEnv } from "../../middleware/auth.js";
import { getProjectPath } from "../../ai/project-files.js";
import { getThumbnailPath } from "../../thumbnails/capture.js";
import { stopDevServer } from "../../projects/dev-server.js";
import { projects, workspacesQ, requireProjectAccess, isRoleAtLeast } from "./helpers.js";

const stars = starQueries(sql);
const shareTracking = shareTrackingQueries(sql);
const projectViews = projectViewQueries(sql);

export const projectItemRoutes = new Hono<AuthEnv>();

// ─── Record Project View ────────────────────────────────────
projectItemRoutes.post("/:id/view", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  await projectViews.recordView(userId, id);

  // Track share visit if user is accessing a project outside their own workspace
  if (access.project.visibility === "public") {
    const wsRole = await workspacesQ.getMemberRole(access.project.workspace_id, userId);
    if (!wsRole) {
      await shareTracking.recordVisit(id, userId);
    }
  }

  return c.json({ ok: true });
});

// ─── Share Analytics ────────────────────────────────────────
projectItemRoutes.get("/:id/share-stats", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const project = await projects.findById(id);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Only workspace members can view share stats (they "own" the project)
  const wsRole = await workspacesQ.getMemberRole(project.workspace_id, userId);
  if (!wsRole) {
    return c.json({ error: "Access denied" }, 403);
  }

  const stats = await shareTracking.getShareStats(id);
  return c.json({ data: stats });
});

// ─── Get Project ────────────────────────────────────────────
projectItemRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const starred = await stars.isStarred(userId, id);

  return c.json({ data: { ...access.project, starred } });
});

// ─── Update Project ─────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["creating", "draft", "published", "error"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

projectItemRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!isRoleAtLeast(access.role, "member")) {
    return c.json({ error: "Viewers cannot edit projects" }, 403);
  }

  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const project = await projects.update(id, parsed.data);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ data: project });
});

// PUT also updates the project (some frontends use PUT instead of PATCH)
projectItemRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!isRoleAtLeast(access.role, "member")) {
    return c.json({ error: "Viewers cannot edit projects" }, 403);
  }

  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const project = await projects.update(id, parsed.data);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ data: project });
});

// ─── Delete Project (Hard — removes DB row, files, .git, thumbnail) ─────
projectItemRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Only owners and admins can delete projects
  if (access.role !== "owner" && access.role !== "admin") {
    return c.json({ error: "Only workspace owners and admins can delete projects" }, 403);
  }

  // 1. Merge AI usage rows BEFORE deleting the project.
  //    The ai_usage_daily/monthly tables have ON DELETE SET NULL on project_id,
  //    but also a unique index using COALESCE(project_id, '0000...').
  //    Setting project_id to NULL can violate that unique constraint if a
  //    NULL-project row already exists for the same (date, user, workspace,
  //    provider, model). Fix: merge counts into the existing NULL row, then
  //    delete the project-specific rows so the FK SET NULL never fires.
  try {
    // Daily: merge into existing NULL rows, then delete project rows
    await sql`
      UPDATE ai_usage_daily dst
      SET request_count = dst.request_count + src.request_count,
          input_tokens  = dst.input_tokens  + src.input_tokens,
          output_tokens = dst.output_tokens + src.output_tokens,
          total_cost    = dst.total_cost    + src.total_cost
      FROM ai_usage_daily src
      WHERE src.project_id = ${id}
        AND dst.project_id IS NULL
        AND dst.date         = src.date
        AND dst.user_id      = src.user_id
        AND dst.workspace_id = src.workspace_id
        AND dst.provider     = src.provider
        AND dst.model        = src.model
    `;
    await sql`DELETE FROM ai_usage_daily WHERE project_id = ${id}`;

    // Monthly: same merge-then-delete
    await sql`
      UPDATE ai_usage_monthly dst
      SET request_count = dst.request_count + src.request_count,
          input_tokens  = dst.input_tokens  + src.input_tokens,
          output_tokens = dst.output_tokens + src.output_tokens,
          total_cost    = dst.total_cost    + src.total_cost
      FROM ai_usage_monthly src
      WHERE src.project_id = ${id}
        AND dst.project_id IS NULL
        AND dst.month        = src.month
        AND dst.user_id      = src.user_id
        AND dst.workspace_id = src.workspace_id
        AND dst.provider     = src.provider
        AND dst.model        = src.model
    `;
    await sql`DELETE FROM ai_usage_monthly WHERE project_id = ${id}`;

    // Usage log: just set NULL (no unique constraint on this table)
    await sql`UPDATE ai_usage_log SET project_id = NULL WHERE project_id = ${id}`;
  } catch { /* non-critical — usage stats shouldn't block deletion */ }

  // 2. Delete from database — instant, guarantees project disappears
  const deleted = await projects.hardDelete(id);
  if (!deleted) {
    return c.json({ error: "Project not found" }, 404);
  }

  // 3. GitHub connection cleanup (fast DB queries, safe to await)
  try {
    await sql`DELETE FROM github_commits WHERE connection_id IN (
      SELECT id FROM github_connections WHERE project_id = ${id}
    )`;
    await sql`DELETE FROM github_connections WHERE project_id = ${id}`;
  } catch { /* non-critical */ }

  // 4. Filesystem + dev server cleanup in background (can be slow)
  (async () => {
    try {
      await Promise.race([
        stopDevServer(id),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch { /* non-critical */ }

    try {
      const projectDir = getProjectPath(id);
      if (existsSync(projectDir)) {
        await rm(projectDir, { recursive: true, force: true });
      }
    } catch { /* non-critical */ }

    try {
      const thumbPath = getThumbnailPath(id);
      if (existsSync(thumbPath)) {
        await rm(thumbPath, { force: true });
      }
    } catch { /* non-critical */ }
  })();

  return c.json({ data: { id, deleted: true } });
});

// ─── Duplicate Project ──────────────────────────────────────
projectItemRoutes.post("/:id/duplicate", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!isRoleAtLeast(access.role, "member")) {
    return c.json({ error: "Viewers cannot duplicate projects" }, 403);
  }
  const original = access.project;

  const timestamp = Date.now().toString(36);
  const newSlug = `${original.slug}-copy-${timestamp}`;

  const duplicate = await projects.create({
    workspaceId: original.workspace_id,
    name: `${original.name} (Copy)`,
    slug: newSlug,
    description: original.description ?? undefined,
    templateId: original.template_id ?? undefined,
    folderId: original.folder_id ?? undefined,
  });

  return c.json({ data: duplicate }, 201);
});

// ─── Toggle Star ────────────────────────────────────────────
projectItemRoutes.post("/:id/star", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const starred = await stars.toggle(userId, id);

  return c.json({ data: { projectId: id, starred } });
});

// ─── Move to Folder ─────────────────────────────────────────
const moveSchema = z.object({
  folderId: z.string().uuid().nullable(),
});

projectItemRoutes.post("/:id/move", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json();
  const parsed = moveSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const project = await projects.update(id, { folderId: parsed.data.folderId });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ data: project });
});
