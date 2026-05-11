import { Hono } from "hono";
import { z } from "zod";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "../../db/index.js";
import { starQueries } from "@doable/db";
import { shareTrackingQueries } from "@doable/db";
import { projectViewQueries } from "@doable/db";
import { userQueries } from "@doable/db";
import type { AuthEnv } from "../../middleware/auth.js";
import { getProjectPath } from "../../ai/project-files.js";
import { getThumbnailPath } from "../../thumbnails/capture.js";
import { stopDevServer } from "../../projects/dev-server.js";
import { projects, workspacesQ, requireProjectAccess, isRoleAtLeast, validateProjectIdParam } from "./helpers.js";
import { signProjectJwt } from "../../auth/project-jwt.js";

const PROJECT_JWT_SECRET =
  process.env.PROJECT_JWT_SECRET ??
  process.env.JWT_SECRET ??
  "DEVELOPMENT_PROJECT_JWT_SECRET_DO_NOT_USE_IN_PROD";

const stars = starQueries(sql);
const shareTracking = shareTrackingQueries(sql);
const projectViews = projectViewQueries(sql);
const users = userQueries(sql);

export const projectItemRoutes = new Hono<AuthEnv>();

// Reject non-UUID `:id` params with 400 before any handler hits Postgres
// (BUG-CORPUS-PROJ-002). Every route in this group is `/:id...` so the
// guard is safe to apply globally here.
projectItemRoutes.use("/:id", validateProjectIdParam());
projectItemRoutes.use("/:id/*", validateProjectIdParam());

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

// ─── Connector-Proxy Token (PRD 10) ─────────────────────────
// Issues a short-lived (15 min) JWT the editor can postMessage to a
// scaffolded SPA running inside the preview iframe. The SPA uses it
// as Authorization: Bearer when calling /__doable/connector-proxy/...
// Auth via the standard user-session middleware on this routes group.
projectItemRoutes.post("/:id/connector-proxy-token", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const token = await signProjectJwt(
    {
      projectId: id,
      workspaceId: access.project.workspace_id,
      userId,
      kind: "connector-proxy",
    },
    PROJECT_JWT_SECRET,
  );

  return c.json({ token, expiresIn: 15 * 60 });
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
      SET request_count           = dst.request_count           + src.request_count,
          total_prompt_tokens     = dst.total_prompt_tokens     + src.total_prompt_tokens,
          total_completion_tokens = dst.total_completion_tokens + src.total_completion_tokens,
          total_thinking_tokens   = dst.total_thinking_tokens   + src.total_thinking_tokens,
          total_tokens            = dst.total_tokens            + src.total_tokens,
          total_cost_usd          = dst.total_cost_usd          + src.total_cost_usd,
          total_credits           = dst.total_credits           + src.total_credits,
          total_duration_ms       = dst.total_duration_ms       + src.total_duration_ms,
          tool_call_count         = dst.tool_call_count         + src.tool_call_count
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
      SET request_count           = dst.request_count           + src.request_count,
          total_prompt_tokens     = dst.total_prompt_tokens     + src.total_prompt_tokens,
          total_completion_tokens = dst.total_completion_tokens + src.total_completion_tokens,
          total_thinking_tokens   = dst.total_thinking_tokens   + src.total_thinking_tokens,
          total_tokens            = dst.total_tokens            + src.total_tokens,
          total_cost_usd          = dst.total_cost_usd          + src.total_cost_usd,
          total_credits           = dst.total_credits           + src.total_credits,
          total_duration_ms       = dst.total_duration_ms       + src.total_duration_ms,
          tool_call_count         = dst.tool_call_count         + src.tool_call_count
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

// ─── List Project Collaborators ─────────────────────────────
projectItemRoutes.get("/:id/collaborators", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const collaborators = await sql<{
    user_id: string;
    role: string;
    added_at: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  }[]>`
    SELECT pc.user_id, pc.role, pc.added_at,
           u.email, u.display_name, u.avatar_url
    FROM project_collaborators pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.project_id = ${id}
    ORDER BY pc.added_at ASC
  `;

  return c.json({ data: collaborators });
});

// ─── Add Project Collaborator ───────────────────────────────
// BUG-CORPUS-PROJ-005: POST handler was missing — only GET / DELETE were
// mounted, so `POST /projects/:id/collaborators` returned 404. The TC
// corpus (testcases/03-projects/TC-PROJ-COLLAB.md TC-PROJ-COLLAB-021..024)
// documented this endpoint as the canonical add-collaborator path.
//
// Contract:
//   - Caller must have at least workspace `member` role on the project's
//     workspace (collab-only callers cannot grant access — same as DELETE).
//   - `email` must resolve to an existing user; otherwise 404.
//   - Workspace members of this workspace are not added as collaborators
//     (they already have access); request returns 409.
//   - Idempotent on `(project_id, user_id)` — a duplicate request returns
//     409, not a duplicate row.
const addCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "editor", "viewer"]).default("editor"),
});

projectItemRoutes.post("/:id/collaborators", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Only workspace members (project owners) can grant access — mirrors the
  // DELETE handler below.  Project_collaborators-only callers get 403.
  const wsRole = await workspacesQ.getMemberRole(access.project.workspace_id, userId);
  if (!wsRole) {
    return c.json({ error: "Only the project owner can add collaborators" }, 403);
  }
  if (!isRoleAtLeast(wsRole, "member")) {
    return c.json({ error: "Viewers cannot add collaborators" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = addCollaboratorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  const targetUser = await users.findByEmail(parsed.data.email);
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // If the target is already a workspace member, they already have access —
  // 409 makes this distinguishable from "user not found" and "already a
  // collaborator".
  const targetWsRole = await workspacesQ.getMemberRole(access.project.workspace_id, targetUser.id);
  if (targetWsRole) {
    return c.json({ error: "User is already a workspace member with access to this project" }, 409);
  }

  // Insert with ON CONFLICT so a duplicate add returns the canonical 409.
  const [inserted] = await sql<{
    id: string;
    project_id: string;
    user_id: string;
    role: string;
    added_at: string;
  }[]>`
    INSERT INTO project_collaborators (project_id, user_id, role)
    VALUES (${id}, ${targetUser.id}, ${parsed.data.role})
    ON CONFLICT (project_id, user_id) DO NOTHING
    RETURNING id, project_id, user_id, role, added_at
  `;
  if (!inserted) {
    return c.json({ error: "User is already a collaborator on this project" }, 409);
  }

  return c.json({
    data: {
      user_id: inserted.user_id,
      role: inserted.role,
      added_at: inserted.added_at,
      email: targetUser.email,
      display_name: targetUser.display_name ?? null,
      avatar_url: targetUser.avatar_url ?? null,
    },
  }, 201);
});

// ─── Remove Project Collaborator ────────────────────────────
projectItemRoutes.delete("/:id/collaborators/:userId", async (c) => {
  const id = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Only workspace members (project owners) can remove collaborators
  const wsRole = await workspacesQ.getMemberRole(access.project.workspace_id, userId);
  if (!wsRole) {
    return c.json({ error: "Only the project owner can remove collaborators" }, 403);
  }

  const result = await sql`
    DELETE FROM project_collaborators
    WHERE project_id = ${id} AND user_id = ${targetUserId}
  `;

  if (result.count === 0) {
    return c.json({ error: "Collaborator not found" }, 404);
  }

  return c.json({ data: { removed: true } });
});

// ─── GET /:id/connector-settings — Get connector/MCP rate limit settings ───
projectItemRoutes.get("/:id/connector-settings", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(id, userId);
  if (!access) return c.json({ error: "Not found" }, 404);

  const [row] = await sql<{ connector_settings: Record<string, unknown> }[]>`
    SELECT connector_settings FROM projects WHERE id = ${id} LIMIT 1
  `;

  const settings = row?.connector_settings ?? {};
  return c.json({
    data: {
      rateLimitPerMinute: typeof settings.rateLimitPerMinute === "number" ? settings.rateLimitPerMinute : null,
    },
  });
});

// ─── PUT /:id/connector-settings — Update connector/MCP rate limit settings ───
const connectorSettingsSchema = z.object({
  rateLimitPerMinute: z.number().int().min(0).max(10000).nullable(),
});

projectItemRoutes.put("/:id/connector-settings", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(id, userId);
  if (!access) return c.json({ error: "Not found" }, 404);
  if (!isRoleAtLeast(access.role, "member")) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = connectorSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid settings", details: parsed.error.issues }, 400);
  }

  const newSettings = { rateLimitPerMinute: parsed.data.rateLimitPerMinute };

  await sql`
    UPDATE projects
    SET connector_settings = ${JSON.stringify(newSettings)}::jsonb,
        updated_at = now()
    WHERE id = ${id}
  `;

  return c.json({ data: newSettings });
});
