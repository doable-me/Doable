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
import { stopDevServer, getDevServerInternalUrl } from "../../projects/dev-server.js";
import { projects, workspacesQ, requireProjectAccess, isRoleAtLeast, validateProjectIdParam } from "./helpers.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../lib/secrets.js";

const stars = starQueries(sql);
const shareTracking = shareTrackingQueries(sql);
const projectViews = projectViewQueries(sql);
const users = userQueries(sql);

export const projectItemRoutes = new Hono<AuthEnv>({ strict: false });

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
/** Strip HTML/script tags from user-supplied names to prevent stored XSS */
const safeName = (s: string) => s.replace(/<[^>]*>/g, "").trim();

const updateSchema = z.object({
  name: z.string().min(1).max(100).transform(safeName).pipe(z.string().min(1)).optional(),
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

// ─── Archive / Unarchive Project ───────────────────────────
projectItemRoutes.post("/:id/archive", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!isRoleAtLeast(access.role, "admin")) {
    return c.json({ error: "Only workspace owners and admins can archive projects" }, 403);
  }

  // BUG-API-005: previous code set `deleted_at = now()` on archive, which
  // collided with the soft-delete contract (deleted_at-marked rows are
  // hidden everywhere). 'archived' is now a real enum value (mig 085) and
  // status alone is the canonical signal. The deleted_at IS NULL guard
  // prevents reviving soft-deleted rows via archive/unarchive.
  const [updated] = await sql<{ id: string; status: string }[]>`
    UPDATE projects
    SET status = 'archived', updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, status
  `;
  if (!updated) return c.json({ error: "Project not found" }, 404);
  return c.json({ data: { id: updated.id, status: updated.status } });
});

projectItemRoutes.post("/:id/unarchive", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!isRoleAtLeast(access.role, "admin")) {
    return c.json({ error: "Only workspace owners and admins can unarchive projects" }, 403);
  }

  const [updated] = await sql<{ id: string; status: string }[]>`
    UPDATE projects
    SET status = 'draft', updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, status
  `;
  if (!updated) return c.json({ error: "Project not found" }, 404);
  return c.json({ data: { id: updated.id, status: updated.status } });
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

  // Resolve collaborator display info via the SECURITY DEFINER helper
  // (migration 100) rather than a raw `JOIN users`. Under the users FORCE-RLS
  // policy `users_workspace_visible` (migration 076) the app role `doable_app`
  // only sees users who share a workspace with the caller, so a link-join
  // collaborator (project_collaborators-only, not a workspace member) would be
  // dropped from a plain JOIN — the Share dialog then shows "No collaborators
  // yet" despite the rows existing. The definer helper bypasses that visibility
  // RLS and exposes only public-safe columns. Access to this list is already
  // gated by requireProjectAccess() above; project_collaborators has no RLS.
  const collaborators = await sql<{
    user_id: string;
    role: string;
    added_at: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  }[]>`
    SELECT pc.user_id, pc.role, pc.added_at,
           lu.email, lu.display_name, lu.avatar_url
    FROM project_collaborators pc
    JOIN doable_lookup_users_by_ids(
           ARRAY(SELECT user_id FROM project_collaborators WHERE project_id = ${id})
         ) lu ON lu.id = pc.user_id
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

  // BUG-CORPUS-PROJ-005 (root cause): under `authMiddlewareWithRls`, the
  // `users_workspace_visible` RLS policy (migration 076) hides every user
  // who doesn't already share a workspace with the caller — which is
  // *exactly* the user you'd be adding as a collaborator. Use the
  // SECURITY DEFINER helper that bypasses the visibility RLS but only
  // returns public-safe columns and only for authenticated callers.
  const targetUser = await users.findByEmailForInvite(parsed.data.email);
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

// ─── Speed Audit ─────────────────────────────────────────────
// Transfer-size based performance audit measured from the live preview.
// Does NOT require headless Chrome — pure HTTP fetch + HTML parsing.
projectItemRoutes.get("/:id/speed-audit", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const previewBaseOrNull = getDevServerInternalUrl(id);
  if (!previewBaseOrNull) {
    return c.json({ error: "Preview not running. Open the preview first, then run the audit." }, 409);
  }
  const previewBase: string = previewBaseOrNull;
  // Origin (scheme://host:port) of the preview — used for a strict same-origin
  // SSRF guard. A startsWith(previewBase) check is bypassable via URL userinfo
  // (e.g. http://127.0.0.1:PORT@evil/), so compare parsed origins instead.
  const previewOrigin: string = (() => {
    try { return new URL(previewBase).origin; } catch { return previewBase; }
  })();

  const TIMEOUT_MS = 8_000;
  const MAX_ASSETS = 40;
  const MAX_ASSET_BYTES = 10_000_000; // 10 MB per asset — don't buffer giant responses

  // ── Helper: timed fetch (same-origin guard built in at call sites) ───
  async function timedFetch(url: string): Promise<{ body: string; bytes: number; ttfbMs: number; ok: boolean; contentType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: controller.signal });
      const ttfbMs = Date.now() - t0;
      const contentTypeHdr = res.headers.get("content-type") ?? "";
      // Skip buffering assets that declare a size over the cap (don't OOM on a
      // hostile preview serving huge bodies). Count the declared size only.
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > MAX_ASSET_BYTES) {
        controller.abort();
        clearTimeout(timer);
        return { body: "", bytes: declared, ttfbMs, ok: false, contentType: contentTypeHdr };
      }
      const buf = await res.arrayBuffer();
      clearTimeout(timer);
      const bytes = buf.byteLength;
      const body = new TextDecoder().decode(buf);
      const contentType = res.headers.get("content-type") ?? "";
      return { body, bytes, ttfbMs, ok: res.ok, contentType };
    } catch {
      clearTimeout(timer);
      return { body: "", bytes: 0, ttfbMs: Date.now() - t0, ok: false, contentType: "" };
    }
  }

  // ── Fetch root HTML ───────────────────────────────────────────────────
  const rootUrl = `${previewBase}/`;
  const html = await timedFetch(rootUrl);
  if (!html.ok && html.bytes === 0) {
    return c.json({ error: "Preview did not respond. Make sure the preview is running." }, 409);
  }

  const ttfbMs = html.ttfbMs;

  // ── Parse asset URLs from HTML ────────────────────────────────────────
  type AssetType = "js" | "css" | "html" | "image" | "font" | "other";

  function classifyUrl(href: string, tag: string, rel: string): AssetType {
    const lower = href.toLowerCase().split("?")[0]!;
    if (tag === "script" || lower.endsWith(".js") || lower.endsWith(".mjs")) return "js";
    if (tag === "link" && rel === "stylesheet") return "css";
    if (lower.endsWith(".css")) return "css";
    if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/.test(lower)) return "image";
    if (/\.(woff2?|ttf|otf|eot)$/.test(lower)) return "font";
    if (tag === "img") return "image";
    return "other";
  }

  interface ParsedAsset { url: string; type: AssetType }
  const seen = new Set<string>();
  const assets: ParsedAsset[] = [];

  function addAsset(href: string, tag: string, rel = "") {
    if (!href || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("#")) return;
    // SSRF guard: only same-origin assets (strict origin compare, not a string
    // prefix — see previewOrigin above).
    let parsed: URL;
    try {
      parsed = new URL(href, rootUrl);
    } catch {
      return;
    }
    if (parsed.origin !== previewOrigin) return;
    const resolved = parsed.toString();
    if (seen.has(resolved)) return;
    seen.add(resolved);
    assets.push({ url: resolved, type: classifyUrl(href, tag, rel) });
  }

  const body = html.body;
  // script src
  for (const m of body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) addAsset(m[1]!, "script");
  // link href
  for (const m of body.matchAll(/<link([^>]*)>/gi)) {
    const attrs = m[1]!;
    const hrefM = attrs.match(/href=["']([^"']+)["']/i);
    const relM = attrs.match(/rel=["']([^"']+)["']/i);
    if (hrefM) addAsset(hrefM[1]!, "link", relM?.[1] ?? "");
  }
  // img src
  for (const m of body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) addAsset(m[1]!, "img");

  // ── Fetch assets (capped) ─────────────────────────────────────────────
  const limited = assets.slice(0, MAX_ASSETS);
  const fetched = await Promise.all(
    limited.map(async (a) => {
      const r = await timedFetch(a.url);
      return { ...a, bytes: r.bytes, ok: r.ok, contentType: r.contentType };
    }),
  );

  // ── Aggregate sizes by type ───────────────────────────────────────────
  const sizes: Record<AssetType, number> = { js: 0, css: 0, html: 0, image: 0, font: 0, other: 0 };
  sizes.html += html.bytes;
  for (const f of fetched) {
    if (f.ok) sizes[f.type] += f.bytes;
  }

  const totalBytes = Object.values(sizes).reduce((a, b) => a + b, 0);
  const toKb = (b: number) => Math.round(b / 1024);

  // ── Scoring ───────────────────────────────────────────────────────────
  // Deductions from 100:
  //  - TTFB > 200ms: up to -15
  //  - Total > 500KB: up to -30
  //  - JS > 200KB: up to -25
  //  - Images > 200KB: up to -20
  //  - Requests > 20: up to -10
  const ttfbPenalty = Math.min(15, Math.max(0, ((ttfbMs - 200) / 800) * 15));
  const totalKb = toKb(totalBytes);
  const sizePenalty = Math.min(30, Math.max(0, ((totalKb - 500) / 1500) * 30));
  const jsPenalty = Math.min(25, Math.max(0, ((toKb(sizes.js) - 200) / 600) * 25));
  const imgPenalty = Math.min(20, Math.max(0, ((toKb(sizes.image) - 200) / 800) * 20));
  const reqPenalty = Math.min(10, Math.max(0, ((limited.length - 20) / 20) * 10));
  const score = Math.round(Math.max(0, 100 - ttfbPenalty - sizePenalty - jsPenalty - imgPenalty - reqPenalty));

  type Rating = "good" | "needs-improvement" | "poor";
  function ttfbRating(): Rating {
    if (ttfbMs < 300) return "good";
    if (ttfbMs < 800) return "needs-improvement";
    return "poor";
  }
  function sizeRating(kb: number, good: number, poor: number): Rating {
    if (kb <= good) return "good";
    if (kb <= poor) return "needs-improvement";
    return "poor";
  }

  // ── Build files list ──────────────────────────────────────────────────
  interface BundleFile { name: string; size: number; type: AssetType }
  const files: BundleFile[] = [
    { name: "index.html", size: toKb(html.bytes), type: "html" },
    ...fetched
      .filter((f) => f.ok && f.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .map((f) => ({
        name: decodeURIComponent(f.url.split("/").pop()?.split("?")[0] ?? f.url),
        size: toKb(f.bytes),
        type: f.type,
      })),
  ];

  // ── Recommendations ───────────────────────────────────────────────────
  interface Rec { id: string; title: string; description: string; impact: "high" | "medium" | "low"; savings: string; fixPrompt: string }
  const recs: Rec[] = [];

  const jsKb = toKb(sizes.js);
  if (jsKb > 200) {
    recs.push({
      id: "large-js",
      title: "Reduce JavaScript bundle size",
      description: `JavaScript totals ${jsKb} KB. Large bundles delay interactivity and increase parse time on slower devices.`,
      impact: jsKb > 500 ? "high" : "medium",
      savings: `~${Math.round(jsKb * 0.4)} KB potential`,
      fixPrompt: "Audit all JavaScript files. Use dynamic import() for routes or components not needed on the initial page load. Remove any unused libraries and prefer lighter alternatives.",
    });
  }

  const imgKb = toKb(sizes.image);
  if (imgKb > 100) {
    recs.push({
      id: "large-images",
      title: "Optimize images",
      description: `Images total ${imgKb} KB. Converting to WebP and serving at the correct resolution can significantly reduce transfer size.`,
      impact: imgKb > 300 ? "high" : "medium",
      savings: `~${Math.round(imgKb * 0.5)} KB potential`,
      fixPrompt: "Convert JPEG and PNG images to WebP. Add explicit width and height attributes to all <img> tags to prevent layout shift. Compress images to quality 80.",
    });
  }

  if (ttfbMs > 300) {
    recs.push({
      id: "slow-ttfb",
      title: "Improve server response time",
      description: `The preview page took ${ttfbMs} ms to start responding (TTFB). Fast pages typically respond in under 200 ms.`,
      impact: ttfbMs > 800 ? "high" : "low",
      savings: `${ttfbMs - 200} ms TTFB`,
      fixPrompt: "Check if any server-side work happens before the first byte is sent. For static sites, ensure assets are served from a fast host or CDN close to users.",
    });
  }

  const cssKb = toKb(sizes.css);
  if (cssKb > 50) {
    recs.push({
      id: "large-css",
      title: "Reduce stylesheet size",
      description: `CSS totals ${cssKb} KB. Many apps include unused CSS rules. Removing them reduces render-blocking stylesheet download time.`,
      impact: "medium",
      savings: `~${Math.round(cssKb * 0.4)} KB potential`,
      fixPrompt: "Use Tailwind CSS purge / PurgeCSS to remove unused rules. Audit style sheets for dead selectors. Only import the CSS you actually use.",
    });
  }

  const reqCount = 1 + limited.length; // html + assets
  if (reqCount > 20) {
    recs.push({
      id: "many-requests",
      title: "Reduce number of requests",
      description: `The page makes ${reqCount} requests. Each extra round-trip adds latency, especially on mobile connections.`,
      impact: "low",
      savings: `${reqCount - 10} fewer requests`,
      fixPrompt: "Bundle small scripts and stylesheets together. Use sprite sheets or inline small SVG icons. Lazy-load assets that are not needed immediately.",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "looks-good",
      title: "Transfer size looks good",
      description: `Total transfer is ${totalKb} KB across ${reqCount} requests with a ${ttfbMs} ms TTFB — within reasonable bounds for a preview app.`,
      impact: "low",
      savings: "—",
      fixPrompt: "Continue monitoring as the app grows. Consider adding image lazy-loading and code splitting for larger features.",
    });
  }

  // ── Response ──────────────────────────────────────────────────────────
  return c.json({
    data: {
      score,
      webVitals: [
        {
          name: "Time to First Byte",
          shortName: "TTFB",
          value: ttfbMs,
          unit: "ms",
          target: "< 200ms",
          rating: ttfbRating(),
        },
        {
          name: "Total Transfer Size",
          shortName: "Size",
          value: totalKb,
          unit: "KB",
          target: "< 500 KB",
          rating: sizeRating(totalKb, 500, 1500),
        },
        {
          name: "Request Count",
          shortName: "Reqs",
          value: reqCount,
          unit: "",
          target: "< 20",
          rating: sizeRating(reqCount, 20, 40),
        },
      ],
      additionalMetrics: [
        { name: "JavaScript", value: toKb(sizes.js), unit: "KB", maxValue: 1000, rating: sizeRating(toKb(sizes.js), 200, 500) },
        { name: "CSS", value: toKb(sizes.css), unit: "KB", maxValue: 200, rating: sizeRating(toKb(sizes.css), 50, 150) },
        { name: "Images", value: toKb(sizes.image), unit: "KB", maxValue: 1000, rating: sizeRating(toKb(sizes.image), 200, 600) },
        { name: "Fonts", value: toKb(sizes.font), unit: "KB", maxValue: 200, rating: sizeRating(toKb(sizes.font), 60, 150) },
      ],
      bundle: {
        js: toKb(sizes.js),
        css: toKb(sizes.css),
        html: toKb(sizes.html),
        images: toKb(sizes.image),
        fonts: toKb(sizes.font),
        other: toKb(sizes.other),
        total: totalKb,
        files,
      },
      recommendations: recs,
    },
  });
});
