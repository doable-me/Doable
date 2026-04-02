import { Hono } from "hono";
import { z } from "zod";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "../db/index.js";
import { projectQueries } from "@doable/db";
import { starQueries } from "@doable/db";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { getProjectPath } from "../ai/project-files.js";
import { getThumbnailPath } from "../thumbnails/capture.js";
import { stopDevServer } from "../projects/dev-server.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from "@doable/shared";

const projects = projectQueries(sql);
const stars = starQueries(sql);
const workspacesQ = workspaceQueries(sql);

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require authentication
projectRoutes.use("*", authMiddleware);

// ─── Helper: get user's workspace (with membership check) ───
async function getUserWorkspaceId(userId: string, explicit?: string): Promise<string | null> {
  if (explicit) {
    // Verify the user is actually a member of the requested workspace
    const role = await workspacesQ.getMemberRole(explicit, userId);
    if (!role) return null;
    return explicit;
  }
  const userWorkspaces = await workspacesQ.listByUser(userId);
  return userWorkspaces.length > 0 ? userWorkspaces[0]!.id : null;
}

// ─── Helper: verify user can access a project ────────────────
// Checks workspace membership first, then project_collaborators.
// Returns the role from whichever grants access (workspace role takes priority).
async function requireProjectAccess(
  userId: string,
  projectId: string
): Promise<{ project: NonNullable<Awaited<ReturnType<typeof projects.findById>>>; role: string } | null> {
  const project = await projects.findById(projectId);
  if (!project) return null;

  // 1. Workspace member — has access to all projects in the workspace
  const wsRole = await workspacesQ.getMemberRole(project.workspace_id, userId);
  if (wsRole) return { project, role: wsRole };

  // 2. Project collaborator — has access to this specific project only
  const [collab] = await sql<{ role: string }[]>`
    SELECT role FROM project_collaborators
    WHERE project_id = ${projectId} AND user_id = ${userId}
  `;
  if (collab) return { project, role: collab.role };

  return null;
}

// ─── List Starred Projects ──────────────────────────────────
// NOTE: This must be defined BEFORE "/:id" to avoid matching "starred" as an id
projectRoutes.get("/starred", async (c) => {
  const userId = c.get("userId");
  const starredIds = await stars.listStarredProjectIds(userId);

  if (starredIds.length === 0) {
    return c.json({ data: [] });
  }

  // Fetch full project details for each starred project, filtering to accessible ones
  const projectPromises = starredIds.map((id) => projects.findById(id));
  const projectResults = await Promise.all(projectPromises);
  const validProjects = projectResults.filter((p): p is NonNullable<typeof p> => p != null);

  // Filter to only projects the user has workspace access to
  const accessChecks = await Promise.all(
    validProjects.map(async (p) => {
      const role = await workspacesQ.getMemberRole(p.workspace_id, userId);
      return role ? p : null;
    })
  );
  const data = accessChecks
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => ({ ...p, starred: true }));

  return c.json({ data });
});

// ─── List Projects ──────────────────────────────────────────
projectRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const explicitWorkspaceId = c.req.query("workspaceId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(c.req.query("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );
  const status = c.req.query("status") as
    | "creating"
    | "draft"
    | "published"
    | "error"
    | undefined;
  const search = c.req.query("search");

  const workspaceId = await getUserWorkspaceId(userId, explicitWorkspaceId ?? undefined);
  if (!workspaceId) {
    // If an explicit workspace was requested but user isn't a member, return 403
    if (explicitWorkspaceId) {
      return c.json({ error: "Access denied to this workspace" }, 403);
    }
    return c.json({ data: [], pagination: { total: 0, page: 1, pageSize, totalPages: 0 } });
  }

  const statusValues = ["creating", "draft", "published", "error"];
  if (status && !statusValues.includes(status)) {
    return c.json({ error: "Invalid status filter" }, 400);
  }

  const { rows, total } = await projects.listByWorkspace(workspaceId, {
    page,
    pageSize,
    status,
  });

  // Apply search filter in-memory for simplicity
  const filtered = search
    ? rows.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const starredIds = await stars.listStarredProjectIds(userId);
  const starredSet = new Set(starredIds);

  const data = filtered.map((p) => ({
    ...p,
    starred: starredSet.has(p.id),
  }));

  return c.json({
    data,
    pagination: {
      total: search ? filtered.length : total,
      page,
      pageSize,
      totalPages: Math.ceil((search ? filtered.length : total) / pageSize),
    },
  });
});

// ─── Create Project ─────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX).optional(),
  description: z.string().max(500).optional(),
  templateId: z.string().min(1).max(128).optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  prompt: z.string().max(5000).optional(),
});

function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
  // Ensure minimum length
  if (slug.length < SLUG_MIN_LENGTH) {
    slug = `${slug}-${Date.now().toString(36)}`.slice(0, SLUG_MAX_LENGTH);
  }
  return slug || "project";
}

projectRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { prompt, ...data } = parsed.data;

  // Resolve workspace — use provided or user's default (with membership check)
  const workspaceId = await getUserWorkspaceId(userId, data.workspaceId);
  if (!workspaceId) {
    if (data.workspaceId) {
      return c.json({ error: "Access denied to this workspace" }, 403);
    }
    return c.json({ error: "No workspace found. Please create a workspace first." }, 400);
  }

  // Auto-generate slug from name if not provided
  let slug = data.slug ?? generateSlug(data.name);

  // Ensure slug uniqueness within workspace
  const existing = await projects.findByWorkspaceAndSlug(workspaceId, slug);
  if (existing) {
    slug = `${slug.slice(0, 38)}-${Date.now().toString(36)}`;
  }

  const project = await projects.create({
    name: data.name,
    slug,
    description: data.description,
    templateId: data.templateId,
    folderId: data.folderId,
    workspaceId,
  });

  return c.json({ data: project }, 201);
});

// ─── Get Project ────────────────────────────────────────────
projectRoutes.get("/:id", async (c) => {
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

projectRoutes.patch("/:id", async (c) => {
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
projectRoutes.put("/:id", async (c) => {
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
projectRoutes.delete("/:id", async (c) => {
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
projectRoutes.post("/:id/duplicate", async (c) => {
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
projectRoutes.post("/:id/star", async (c) => {
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

projectRoutes.post("/:id/move", async (c) => {
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
