import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { designCommentQueries } from "@doable/db/queries/design-comments";
import { projectQueries } from "@doable/db/queries/projects";
import { INTERNAL_SECRET } from "../lib/secrets.js";
import { isProjectIdValid } from "./projects/helpers.js";

const comments = designCommentQueries(sql);
const projects = projectQueries(sql);

// BUG-CORPUS-DC-001: previously the POST handler forwarded the request body
// straight into the DB with no validation, accepting xPercent=1.5 (off-canvas
// pin), empty content (junk rows), and surfacing 500 ISE for {} (missing
// required fields). Both the auth-protected POST and the internal POST share
// this schema so neither can poison rows.
const CreateCommentSchema = z.object({
  xPercent: z.number().min(0).max(1),
  yPercent: z.number().min(0).max(1),
  content: z.string().trim().min(1).max(4096),
  pagePath: z.string().trim().max(512).optional(),
  selector: z.string().max(2048).nullish(),
  parentId: z.string().uuid().nullish(),
  displayName: z.string().max(120).nullish(),
  userColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  // Internal-only fields (ignored on the auth-protected route, used by the
  // WS bridge endpoint).
  id: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});
type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

function safeParseCommentBody(raw: unknown):
  | { ok: true; data: CreateCommentInput }
  | { ok: false; status: 400; error: string; issues: z.ZodIssue[] } {
  const parsed = CreateCommentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid input", issues: parsed.error.issues };
  }
  return { ok: true, data: parsed.data };
}

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

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = safeParseCommentBody(raw);
  if (!parsed.ok) return c.json({ error: parsed.error, issues: parsed.issues }, parsed.status);
  const body = parsed.data;
  if (!body.userId) return c.json({ error: "userId is required" }, 400);

  try {
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
  } catch (err) {
    console.warn("[design-comments] internal create failed:", err instanceof Error ? err.message : err);
    return c.json({ error: "Failed to persist comment" }, 500);
  }
});

// ─── Auth-protected endpoints ─────────────────────────────────────────
designCommentRoutes.use("/*", authMiddleware);

// GET /design-comments/:projectId — list comments for a project
designCommentRoutes.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  // BUG-R25-API-002: same fix as team-chat — guard the uuid before findById
  // so a non-UUID returns 400, not 500 ISE.
  if (!isProjectIdValid(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const pagePath = c.req.query("page") ?? undefined;

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const rows = await comments.listByProject(projectId, pagePath);
  return c.json({ data: rows });
});

// POST /design-comments/:projectId — create a comment
designCommentRoutes.post("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!isProjectIdValid(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const userId = c.get("userId");

  // BUG-CORPUS-DC-001: validate body BEFORE the project lookup so a malformed
  // request never burns a DB roundtrip and never reaches the unhandled SQL
  // path that surfaced as 500 ISE on `{}`.
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = safeParseCommentBody(raw);
  if (!parsed.ok) return c.json({ error: parsed.error, issues: parsed.issues }, parsed.status);
  const body = parsed.data;

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  let comment: Awaited<ReturnType<typeof comments.create>>;
  try {
    comment = await comments.create({
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
  } catch (err) {
    // Should never fire post-validation, but guards against e.g. FK violations
    // from a parentId pointing at a comment in another project.
    console.warn("[design-comments] create failed:", err instanceof Error ? err.message : err);
    return c.json({ error: "Failed to persist comment" }, 500);
  }

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
