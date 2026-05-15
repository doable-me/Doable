import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/workspace-role.js";
import { sql } from "../db/index.js";
import { contextManager } from "../context/manager.js";
import { getContextStats } from "../context/injector.js";
import { evictProjectSessions } from "./chat/session-state.js";

export const contextRoutes = new Hono<AuthEnv>({ strict: false });
contextRoutes.use("*", authMiddleware);

const ctx = contextManager(sql);

// ─── Validation ─────────────────────────────────────────────

const filenameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9._-]*\.md$/,
    "Filename must be lowercase, end with .md, and use only a-z, 0-9, dots, hyphens, underscores"
  );

const contentSchema = z.string().max(50_000, "Content must be under 50,000 characters");

const updateBody = z.object({ content: contentSchema });
const createBody = z.object({ content: contentSchema.optional() });

// ─── Routes ─────────────────────────────────────────────────

/**
 * POST /projects/:id/context/initialize
 * Initialize context files for a project (creates defaults if missing).
 */
contextRoutes.post("/initialize", async (c) => {
  const projectId = c.req.param("id");
  const files = await ctx.initializeContext(projectId!);
  const stats = getContextStats(files);
  return c.json({ data: { files, stats } }, 201);
});

/**
 * GET /projects/:id/context
 * List all context files for a project, plus stats.
 */
contextRoutes.get("/", async (c) => {
  const projectId = c.req.param("id");

  // Ensure context is initialized
  const files = await ctx.initializeContext(projectId!);
  const stats = getContextStats(files);

  return c.json({ data: { files, stats } });
});

/**
 * GET /projects/:id/context/:filename
 * Read a single context file.
 */
contextRoutes.get("/:filename", async (c) => {
  const projectId = c.req.param("id");
  const filename = c.req.param("filename");

  const file = await ctx.readContextFile(projectId!, filename!);
  if (!file) {
    return c.json({ error: "Context file not found" }, 404);
  }

  return c.json({ data: file });
});

/**
 * PUT /projects/:id/context/:filename
 * Update a context file's content.
 */
contextRoutes.put(
  "/:filename",
  zValidator("json", updateBody),
  async (c) => {
    const projectId = c.req.param("id");
    const filename = c.req.param("filename");
    const { content } = c.req.valid("json");

    const parseResult = filenameSchema.safeParse(filename);
    if (!parseResult.success) {
      return c.json({ error: "Invalid filename", details: parseResult.error.flatten() }, 400);
    }

    const file = await ctx.updateContextFile(projectId!, filename!, content);
    const evicted = evictProjectSessions(projectId!);
    if (evicted > 0) {
      console.log(`[Context] ${filename} updated for ${projectId!.slice(0, 8)}… — evicted ${evicted} cached chat session(s) so changes take effect immediately`);
    }
    return c.json({ data: file });
  }
);

/**
 * POST /projects/:id/context/:filename
 * Create a new custom context file.
 */
contextRoutes.post(
  "/:filename",
  zValidator("json", createBody),
  async (c) => {
    const projectId = c.req.param("id");
    const filename = c.req.param("filename");
    const { content } = c.req.valid("json");

    const parseResult = filenameSchema.safeParse(filename);
    if (!parseResult.success) {
      return c.json({ error: "Invalid filename", details: parseResult.error.flatten() }, 400);
    }

    // Check if file already exists
    const existing = await ctx.readContextFile(projectId!, filename!);
    if (existing) {
      return c.json({ error: "Context file already exists. Use PUT to update." }, 409);
    }

    const file = await ctx.createContextFile(
      projectId!,
      filename!,
      content ?? ""
    );
    evictProjectSessions(projectId!);
    return c.json({ data: file }, 201);
  }
);

/**
 * DELETE /projects/:id/context/:filename
 * Delete a context file (default files get reset instead).
 */
contextRoutes.delete("/:filename", async (c) => {
  const projectId = c.req.param("id");
  const filename = c.req.param("filename");

  const parseResult = filenameSchema.safeParse(filename);
  if (!parseResult.success) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  const deleted = await ctx.deleteContextFile(projectId!, filename!);
  if (!deleted) {
    return c.json({ error: "Context file not found" }, 404);
  }

  evictProjectSessions(projectId!);
  return c.json({ data: { deleted: true } });
});

// ─── Workspace-level context ─────────────────────────────────
// These are mounted separately under /workspaces/:wid/context/...

export const workspaceContextRoutes = new Hono<AuthEnv>({ strict: false });
workspaceContextRoutes.use("*", authMiddleware);
// BUG-CORPUS-CTX-001: workspace context endpoints leaked to ANY authenticated
// user — all routes here only require `viewer` role on the workspace
// identified by `:wid` so non-members get 403 instead of 200. Read paths
// (GET) are gated at viewer; write paths (PUT/DELETE) escalate inline.
workspaceContextRoutes.use("*", requireRole("viewer", "wid"));

/** GET /workspaces/:wid/context — list workspace context files */
workspaceContextRoutes.get("/", async (c) => {
  const workspaceId = c.req.param("wid");
  const files = await ctx.getWorkspaceContext(workspaceId!);
  const stats = getContextStats(files);
  return c.json({ data: { files, stats } });
});

/** GET /workspaces/:wid/context/:filename */
workspaceContextRoutes.get("/:filename", async (c) => {
  const workspaceId = c.req.param("wid");
  const filename = c.req.param("filename");

  const files = await ctx.getWorkspaceContext(workspaceId!);
  const file = files.find((f) => f.filename === filename);
  if (!file) return c.json({ error: "Not found" }, 404);
  return c.json({ data: file });
});

/** PUT /workspaces/:wid/context/:filename — admin-only (workspace-level write) */
workspaceContextRoutes.put(
  "/:filename",
  requireRole("admin", "wid"),
  zValidator("json", updateBody),
  async (c) => {
    const workspaceId = c.req.param("wid");
    const filename = c.req.param("filename");
    const userId = c.get("userId");
    const { content } = c.req.valid("json");

    const parseResult = filenameSchema.safeParse(filename);
    if (!parseResult.success) {
      return c.json({ error: "Invalid filename" }, 400);
    }

    const file = await ctx.setWorkspaceContext(workspaceId!, filename!, content, userId);
    return c.json({ data: file });
  }
);

/** DELETE /workspaces/:wid/context/:filename — admin-only (workspace-level write) */
workspaceContextRoutes.delete("/:filename", requireRole("admin", "wid"), async (c) => {
  const workspaceId = c.req.param("wid");
  const filename = c.req.param("filename");

  const parseResult = filenameSchema.safeParse(filename);
  if (!parseResult.success) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  const deleted = await ctx.deleteWorkspaceContext(workspaceId!, filename!);
  if (!deleted) {
    return c.json({ error: "Context file not found" }, 404);
  }

  return c.json({ data: { deleted: true } });
});

// ─── User-level context overrides ────────────────────────────

/** GET /workspaces/:wid/context/user — list user's overrides for this workspace */
workspaceContextRoutes.get("/user/list", async (c) => {
  const workspaceId = c.req.param("wid");
  const userId = c.get("userId");
  const files = await ctx.getUserContext(userId!, workspaceId!);
  return c.json({ data: { files } });
});

/** PUT /workspaces/:wid/context/user/:filename */
workspaceContextRoutes.put(
  "/user/:filename",
  zValidator("json", updateBody),
  async (c) => {
    const workspaceId = c.req.param("wid");
    const filename = c.req.param("filename");
    const userId = c.get("userId");
    const { content } = c.req.valid("json");

    const parseResult = filenameSchema.safeParse(filename);
    if (!parseResult.success) {
      return c.json({ error: "Invalid filename" }, 400);
    }

    const file = await ctx.setUserContext(userId!, workspaceId!, filename!, content);
    return c.json({ data: file });
  }
);
