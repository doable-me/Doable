import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { projectQueries } from "@doable/db";
import { starQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from "@doable/shared";

const projects = projectQueries(sql);
const stars = starQueries(sql);

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require authentication
projectRoutes.use("*", authMiddleware);

// ─── List Projects ──────────────────────────────────────────
projectRoutes.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");
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

  if (!workspaceId) {
    return c.json({ error: "workspaceId query parameter is required" }, 400);
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

  const userId = c.get("userId");
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
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_REGEX),
  description: z.string().max(500).optional(),
  templateId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  prompt: z.string().max(5000).optional(),
});

projectRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const { workspaceId, prompt, ...data } = parsed.data;

  const existing = await projects.findByWorkspaceAndSlug(workspaceId, data.slug);
  if (existing) {
    return c.json({ error: "A project with this slug already exists" }, 409);
  }

  const project = await projects.create({ ...data, workspaceId });

  return c.json({ data: project }, 201);
});

// ─── Get Project ────────────────────────────────────────────
projectRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const project = await projects.findById(id);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const userId = c.get("userId");
  const starred = await stars.isStarred(userId, id);

  return c.json({ data: { ...project, starred } });
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

// ─── Delete Project (Soft) ──────────────────────────────────
projectRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await projects.softDelete(id);

  if (!deleted) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json({ data: { id, deleted: true } });
});

// ─── Duplicate Project ──────────────────────────────────────
projectRoutes.post("/:id/duplicate", async (c) => {
  const id = c.req.param("id");
  const original = await projects.findById(id);

  if (!original) {
    return c.json({ error: "Project not found" }, 404);
  }

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

  const project = await projects.findById(id);
  if (!project) {
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
