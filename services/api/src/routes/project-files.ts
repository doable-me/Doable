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

export const projectFileRoutes = new Hono<AuthEnv>();

// Require authentication for all project file operations
// UUID regex — skip middleware for non-UUID :id values (e.g. "recently-viewed", "starred")
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

projectFileRoutes.use("/projects/:id/*", authMiddleware);

// ─── Auto-join: add user as collaborator ONLY if project link sharing is enabled ──
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  if (!UUID_RE.test(projectId)) { await next(); return; }
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
// Returns 404 "Project not found" to avoid leaking project existence.
projectFileRoutes.use("/projects/:id/*", async (c, next) => {
  const projectId = c.req.param("id");
  if (!UUID_RE.test(projectId)) { await next(); return; }
  const userId = c.get("userId");

  // Look up the project and verify access
  const [project] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM projects WHERE id = ${projectId}
  `;

  if (!project) {
    // Project doesn't exist in DB — allow through for scaffold (which creates the DB record).
    // The scaffold endpoint handles its own DB record creation.
    await next();
    return;
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

  // No access — return 404 to avoid leaking that the project exists
  return c.json({ error: "Project not found" }, 404);
});

// ─── Mount sub-routers ──────────────────────────────────────
projectFileRoutes.route("/", scaffoldRoutes);
projectFileRoutes.route("/", fileCrudRoutes);
projectFileRoutes.route("/", devServerFileRoutes);
