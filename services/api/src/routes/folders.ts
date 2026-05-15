import { Hono, type Context } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { folderQueries, workspaceQueries } from "@doable/db";
import type { FolderRow } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const folders = folderQueries(sql);
const workspaces = workspaceQueries(sql);

export const folderRoutes = new Hono<AuthEnv>({ strict: false });

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
/** Strip HTML/script tags from user-supplied names to prevent stored XSS */
const safeName = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1, "Name cannot be empty after sanitization")),
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

  // BUG-FOLDER-002: a parentId from a different workspace caused a 500
  // (FK/constraint surfaced as an unhandled error). Validate that the
  // parent belongs to the SAME workspace and return 400 instead.
  if (parsed.data.parentId) {
    const parent = await folders.findById(parsed.data.parentId);
    if (!parent || parent.workspace_id !== parsed.data.workspaceId) {
      return c.json(
        { error: "parentId must belong to the same workspace" },
        400
      );
    }
  }

  const folder = await folders.create(parsed.data);

  return c.json({ data: folder }, 201);
});

// BUG-FOLDER-005: GET/PATCH/DELETE /folders/:id had no workspace-membership
// check — an IDOR vulnerability. Shared helper loads the folder and verifies
// the caller is a member of the owning workspace, returning 404 (rather than
// 403) to avoid existence-disclosure. Each handler calls this up front.
type FolderLoadResult =
  | { folder: FolderRow; response: null }
  | { folder: null; response: Response };

async function loadFolderForUser(c: Context<AuthEnv>): Promise<FolderLoadResult> {
  const id = c.req.param("id");
  const userId = c.get("userId");
  if (!id) {
    return { folder: null, response: c.json({ error: "Folder not found" }, 404) };
  }
  const folder = await folders.findById(id);
  if (!folder) {
    return { folder: null, response: c.json({ error: "Folder not found" }, 404) };
  }
  const role = await workspaces.getMemberRole(folder.workspace_id, userId);
  if (!role) {
    return { folder: null, response: c.json({ error: "Folder not found" }, 404) };
  }
  return { folder, response: null };
}

// ─── Get Folder ─────────────────────────────────────────────
folderRoutes.get("/:id", async (c) => {
  const result = await loadFolderForUser(c);
  if (result.response) return result.response;
  const { folder } = result;
  const children = await folders.listChildren(folder.id);
  return c.json({ data: { ...folder, children } });
});

// ─── Update Folder ──────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1)).optional(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

folderRoutes.patch("/:id", async (c) => {
  const result = await loadFolderForUser(c);
  if (result.response) return result.response;
  const { folder: existing } = result;

  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  // BUG-FOLDER-001: cycle detection — a folder cannot be its own parent.
  // Without this guard, recursive tree traversal in clients/servers can
  // stack-overflow or infinite-loop.
  if (parsed.data.parentId !== undefined && parsed.data.parentId === existing.id) {
    return c.json(
      { error: "A folder cannot be its own parent" },
      400
    );
  }

  // BUG-FOLDER-002: reject parentId that belongs to a different workspace.
  if (parsed.data.parentId) {
    const parent = await folders.findById(parsed.data.parentId);
    if (!parent || parent.workspace_id !== existing.workspace_id) {
      return c.json(
        { error: "parentId must belong to the same workspace" },
        400
      );
    }
  }

  const folder = await folders.update(existing.id, parsed.data);

  if (!folder) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json({ data: folder });
});

// ─── Delete Folder ──────────────────────────────────────────
folderRoutes.delete("/:id", async (c) => {
  const result = await loadFolderForUser(c);
  if (result.response) return result.response;
  const { folder } = result;

  const deleted = await folders.delete(folder.id);

  if (!deleted) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json({ data: { id: folder.id, deleted: true } });
});
