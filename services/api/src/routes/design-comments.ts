import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { designCommentQueries } from "@doable/db/queries/design-comments";
import { projectQueries } from "@doable/db/queries/projects";
import { INTERNAL_SECRET } from "../lib/secrets.js";

const comments = designCommentQueries(sql);
const projects = projectQueries(sql);

// BUG-WSI-003: `strict: false` makes the router treat `/design-comments/:id`
// and `/design-comments/:id/` as the same route, so external clients that
// build URLs by string concatenation (and inadvertently end up with a
// trailing slash) reach the handler instead of being bounced through the
// global 308 trailing-slash middleware in services/api/src/index.ts —
// which under some edges (Cloudflare/Caddy + auth header propagation) was
// observed to surface as a permanent 308 with no usable Location header.
export const designCommentRoutes = new Hono<AuthEnv>({ strict: false });

// ─── Internal endpoints (for WS server) ───────────────────────────────
// POST /design-comments/:projectId/internal — persist a comment from WS
designCommentRoutes.post("/:projectId/internal", async (c) => {
  const secret = c.req.header("x-internal-secret");
  if (secret !== INTERNAL_SECRET) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const comment = await comments.create({
    id: body.id ?? crypto.randomUUID(),
    projectId: c.req.param("projectId"),
    userId: body.userId,
    displayName: body.displayName ? body.displayName.replace(/<[^>]*>/g, "").trim() || null : null,
    userColor: body.userColor ?? null,
    xPercent: body.xPercent,
    yPercent: body.yPercent,
    selector: body.selector ?? null,
    pagePath: body.pagePath ?? "index.html",
    content: body.content,
    parentId: body.parentId ?? null,
  });
  return c.json({ data: comment });
});

// ─── Auth-protected endpoints ─────────────────────────────────────────
designCommentRoutes.use("/*", authMiddleware);

// GET /design-comments/:projectId — list comments for a project
designCommentRoutes.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const pagePath = c.req.query("page") ?? undefined;

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const rows = await comments.listByProject(projectId, pagePath);
  return c.json({ data: rows });
});

// POST /design-comments/:projectId — create a comment
designCommentRoutes.post("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const comment = await comments.create({
    id: crypto.randomUUID(),
    projectId,
    userId,
    displayName: body.displayName ? body.displayName.replace(/<[^>]*>/g, "").trim() || null : null,
    userColor: body.userColor ?? null,
    xPercent: body.xPercent,
    yPercent: body.yPercent,
    selector: body.selector ?? null,
    pagePath: body.pagePath ?? "index.html",
    content: body.content,
    parentId: body.parentId ?? null,
  });

  // Broadcast to WS room
  const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({
      projectId,
      message: {
        type: "design-comment:added",
        comment: {
          id: comment.id,
          projectId,
          userId,
          displayName: comment.display_name,
          userColor: comment.user_color,
          xPercent: comment.x_percent,
          yPercent: comment.y_percent,
          selector: comment.selector,
          pagePath: comment.page_path,
          content: comment.content,
          parentId: comment.parent_id,
          resolved: comment.resolved,
          createdAt: comment.created_at instanceof Date ? comment.created_at.toISOString() : comment.created_at,
        },
      },
    }),
  }).catch((err) => console.warn("[design-comments] WS broadcast failed:", err));

  return c.json({ data: comment }, 201);
});

// PATCH /design-comments/:projectId/:commentId/resolve — resolve a comment
designCommentRoutes.patch("/:projectId/:commentId/resolve", async (c) => {
  const userId = c.get("userId");
  const commentId = c.req.param("commentId");

  const updated = await comments.resolve(commentId, userId);
  if (!updated) return c.json({ error: "Comment not found" }, 404);

  // Broadcast resolution
  const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
  const projectId = c.req.param("projectId");
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({
      projectId,
      message: { type: "design-comment:resolved", commentId, resolvedBy: userId },
    }),
  }).catch(() => {});

  return c.json({ data: updated });
});

// PATCH /design-comments/:projectId/:commentId/unresolve — unresolve a comment
designCommentRoutes.patch("/:projectId/:commentId/unresolve", async (c) => {
  const commentId = c.req.param("commentId");

  const updated = await comments.unresolve(commentId);
  if (!updated) return c.json({ error: "Comment not found" }, 404);

  const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
  const projectId = c.req.param("projectId");
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({
      projectId,
      message: { type: "design-comment:unresolved", commentId },
    }),
  }).catch(() => {});

  return c.json({ data: updated });
});

// DELETE /design-comments/:projectId/:commentId — delete a comment
designCommentRoutes.delete("/:projectId/:commentId", async (c) => {
  const commentId = c.req.param("commentId");

  const deleted = await comments.deleteComment(commentId);
  if (!deleted) return c.json({ error: "Comment not found" }, 404);

  const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
  const projectId = c.req.param("projectId");
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({
      projectId,
      message: { type: "design-comment:deleted", commentId },
    }),
  }).catch(() => {});

  return c.json({ success: true });
});
