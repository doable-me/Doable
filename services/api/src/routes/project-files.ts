/**
 * Project Files API Routes
 *
 * Real filesystem-backed endpoints for project scaffolding,
 * file CRUD, and dev server preview URLs. These power the
 * editor's live preview and file tree.
 *
 * All routes require JWT authentication via authMiddleware.
 */

import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { scaffoldRoutes } from "./project-files/scaffold.js";
import { fileCrudRoutes } from "./project-files/file-crud.js";
import { devServerFileRoutes } from "./project-files/dev-server-routes.js";

export const projectFileRoutes = new Hono<AuthEnv>({ strict: false });

// Require authentication for all project file operations
// UUID regex — skip middleware for non-UUID :id values (e.g. "recently-viewed", "starred")
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Hono's `/projects/:id/*` pattern matches `/projects/starred` (with `*`
// expanding to the empty string), which incorrectly routed sibling list
// endpoints into this file-CRUD middleware chain and rejected them with
// `{error:"Invalid project id"}`. Skip the validators when :id is one of
// the reserved collection names that projectListRoutes owns.
const RESERVED_LIST_SEGMENTS = new Set([
  "starred",
  "shared",
  "recently-viewed",
  "trash",
]);

projectFileRoutes.use("/projects/:id/*", authMiddleware);

// BUG-CORPUS-PROJ-003: reject non-UUID :id with 400 (instead of skipping
// auth/access middleware and letting the inner handler 500 on the SQL
// invalid-uuid cast). The previous "skip if non-UUID" behaviour was
// dangerous: it bypassed the access-check below and the inner SQL still
// crashed.
// BUG-CORPUS-PROJ-004: also reject the nil UUID so the all-zeros placeholder
// stops getting reachable through the file CRUD path.
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  if (projectId && RESERVED_LIST_SEGMENTS.has(projectId.toLowerCase())) {
    await next();
    return;
  }
  if (!projectId || !UUID_RE.test(projectId) || projectId.toLowerCase() === NIL_UUID) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  await next();
});

// ─── Auto-join: add user as collaborator ONLY if project link sharing is enabled ──
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  if (projectId && RESERVED_LIST_SEGMENTS.has(projectId.toLowerCase())) {
    await next();
    return;
  }
  // UUID guard already applied at the top mount; defense-in-depth.
  if (!UUID_RE.test(projectId)) { return c.json({ error: "Invalid project id" }, 400); }
  const userId = c.get("userId");
  if (projectId && userId) {
    try {
      // Check if user already has access (owner or collaborator)
      const [existing] = await sql`
        SELECT 1 FROM projects p
        JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
        WHERE p.id = ${projectId}
        UNION ALL
        SELECT 1 FROM project_collaborators
        WHERE project_id = ${projectId} AND user_id = ${userId}
        LIMIT 1
      `;
      if (!existing) {
        // Only auto-add if the project has link sharing enabled (visibility = 'public')
        const [project] = await sql`
          SELECT visibility FROM projects WHERE id = ${projectId}
        `;
        if (project?.visibility === 'public') {
          await sql`
            INSERT INTO project_collaborators (project_id, user_id, role)
            VALUES (${projectId}, ${userId}, 'editor')
            ON CONFLICT DO NOTHING
          `;
        }
        // If private, user can still view but won't be auto-added as collaborator
        // They need to be explicitly invited by the owner
      }
    } catch {
      // Non-critical — don't block the request
    }
  }
  await next();
});

// ─── Authorization: verify the authenticated user can access this project ──
// Checks workspace membership first, then project_collaborators.
// Returns 404 "Project not found" for missing OR unauthorized projects so we
// never leak the existence (or non-existence) of any project id to a caller
// who isn't already a member. See BUG-R10-PROJECT-FILES-EMPTY-200-001 and
// BUG-R11-SEC-RLS-PROJECT-FILES-200 for the original 200-empty disclosure
// findings. After BUG-R14-COLLAB-REJOIN (commit 247d577a), the scaffold POST
// no longer auto-creates rows under the caller's workspace — project rows are
// only created via POST /projects, /templates, /community fork, or the
// explicit /editor/new createIfMissing chat flow. This middleware therefore
// rejects ALL verbs uniformly when the project row is missing.
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  if (projectId && RESERVED_LIST_SEGMENTS.has(projectId.toLowerCase())) {
    await next();
    return;
  }
  // UUID guard already applied at the top mount; defense-in-depth.
  if (!UUID_RE.test(projectId)) { return c.json({ error: "Invalid project id" }, 400); }
  const userId = c.get("userId");

  // Look up the project and verify access
  const [project] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM projects WHERE id = ${projectId}
  `;

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // 1. Workspace member — has access to all projects in the workspace
  const [wsMember] = await sql`
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ${project.workspace_id} AND user_id = ${userId}
    LIMIT 1
  `;
  if (wsMember) {
    await next();
    return;
  }

  // 2. Project collaborator — has access to this specific project only
  const [collab] = await sql`
    SELECT 1 FROM project_collaborators
    WHERE project_id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (collab) {
    await next();
    return;
  }

  // 3. Platform admin — full access for moderation/support
  const [adminCheck] = await sql<{ is_platform_admin: boolean }[]>`
    SELECT is_platform_admin FROM users WHERE id = ${userId}
  `;
  if (adminCheck?.is_platform_admin) {
    await next();
    return;
  }

  // No access — return 404 to avoid leaking that the project exists
  return c.json({ error: "Project not found" }, 404);
});

// ─── Mount sub-routers ──────────────────────────────────────
projectFileRoutes.route("/", scaffoldRoutes);
projectFileRoutes.route("/", fileCrudRoutes);
projectFileRoutes.route("/", devServerFileRoutes);
