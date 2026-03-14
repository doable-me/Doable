import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { folderQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const folders = folderQueries(sql);
const workspaces = workspaceQueries(sql);

export const folderRoutes = new Hono<AuthEnv>();

// All folder routes require authentication
folderRoutes.use("*", authMiddleware);

// ─── List Folders ───────────────────────────────────────────
folderRoutes.get("/", async (c) => {
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId query parameter is required" }, 400);
  }

  const userId = c.get("userId");
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const rows = await folders.listByWorkspace(workspaceId);

  return c.json({ data: rows });
});

// ─── Create Folder ──────────────────────────────────────────
const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
  position: z.number().int().min(0).optional(),
});

folderRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const userId = c.get("userId");
  const role = await workspaces.getMemberRole(parsed.data.workspaceId, userId);
  if (!role) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const folder = await folders.create(parsed.data);

  return c.json({ data: folder }, 201);
});

// ─── Get Folder ─────────────────────────────────────────────
folderRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const folder = await folders.findById(id);

  if (!folder) {
    return c.json({ error: "Folder not found" }, 404);
  }

  const children = await folders.listChildren(id);

  return c.json({ data: { ...folder, children } });
});

// ─── Update Folder ──────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

folderRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const folder = await folders.update(id, parsed.data);

  if (!folder) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json({ data: folder });
});

// ─── Delete Folder ──────────────────────────────────────────
folderRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await folders.delete(id);

  if (!deleted) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json({ data: { id, deleted: true } });
});
