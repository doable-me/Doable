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
import { projects, workspacesQ, requireProjectAccess } from "./helpers.js";

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
  visibility: z.enum(["public", "restricted"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

projectItemRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
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

  // 1. Delete from database FIRST — instant, guarantees project disappears
  const deleted = await projects.hardDelete(id);
  if (!deleted) {
    return c.json({ error: "Project not found" }, 404);
  }

  // 2. GitHub connection cleanup (fast DB queries, safe to await)
  try {
    await sql`DELETE FROM github_commits WHERE connection_id IN (
      SELECT id FROM github_connections WHERE project_id = ${id}
    )`;
    await sql`DELETE FROM github_connections WHERE project_id = ${id}`;
  } catch { /* non-critical */ }

  // 3. Filesystem + dev server cleanup in background (can be slow)
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
