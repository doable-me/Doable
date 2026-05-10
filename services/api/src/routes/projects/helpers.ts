import { sql } from "../../db/index.js";
import { projectQueries } from "@doable/db";
import { workspaceQueries } from "@doable/db";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@doable/shared";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "../../middleware/auth.js";

const projects = projectQueries(sql);
const workspacesQ = workspaceQueries(sql);

export { projects, workspacesQ };

// ─── Project-id UUID guard ──────────────────────────────────
// RFC 4122 (any version, any variant). Validates :id at the route boundary
// so callers passing malformed ids get a clean 400 instead of postgres.js
// throwing `invalid input syntax for type uuid` and surfacing as 500
// (BUG-CORPUS-PROJ-002). Mirrors the workspace-role.ts guard.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectIdValid(id: string | undefined): boolean {
  return !!id && UUID_REGEX.test(id);
}

/**
 * Hono middleware that returns 400 if the `:id` param is missing or not a UUID.
 * Apply via `routes.use("/:id", validateProjectIdParam)` and
 * `routes.use("/:id/*", validateProjectIdParam)` so ALL handlers under that
 * mount get the guard for free.
 */
export const validateProjectIdParam = createMiddleware<AuthEnv>(async (c, next) => {
  const id = c.req.param("id");
  if (!id || !UUID_REGEX.test(id)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  await next();
});

// ─── Role hierarchy helper ──────────────────────────────────
const ROLES = WORKSPACE_ROLES as readonly string[];
export function isRoleAtLeast(role: string, minRole: WorkspaceRole): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(minRole);
}

// ─── Helper: get user's workspace (with membership check) ───
export async function getUserWorkspaceId(userId: string, explicit?: string): Promise<string | null> {
  if (explicit) {
    // Verify the user is actually a member of the requested workspace
    const role = await workspacesQ.getMemberRole(explicit, userId);
    if (!role) return null;
    return explicit;
  }
  const userWorkspaces = await workspacesQ.listByUser(userId);
  return userWorkspaces.length > 0 ? userWorkspaces[0]!.id : null;
}

// ─── Helper: get workspace ID with minimum role requirement ──
export async function getUserWorkspaceIdWithMinRole(
  userId: string,
  minRole: WorkspaceRole,
  explicit?: string
): Promise<string | null> {
  if (explicit) {
    const role = await workspacesQ.getMemberRole(explicit, userId);
    if (!role || !isRoleAtLeast(role, minRole)) return null;
    return explicit;
  }
  const userWorkspaces = await workspacesQ.listByUser(userId);
  return userWorkspaces.length > 0 ? userWorkspaces[0]!.id : null;
}

// ─── Helper: verify user can access a project ────────────────
// Checks workspace membership first, then project_collaborators.
// For public projects, auto-joins the user as a collaborator if they don't have access yet.
// Platform admins bypass all checks and get owner-level access.
// Returns the role from whichever grants access (workspace role takes priority).
export async function requireProjectAccess(
  userId: string,
  projectId: string
): Promise<{ project: NonNullable<Awaited<ReturnType<typeof projects.findById>>>; role: string } | null> {
  const project = await projects.findById(projectId);
  if (!project) return null;

  // 1. Workspace member — has access to all projects in the workspace
  const wsRole = await workspacesQ.getMemberRole(project.workspace_id, userId);
  if (wsRole) return { project, role: wsRole };

  // 2. Project collaborator — has access to this specific project only
  const [collab] = await sql<{ role: string }[]>`
    SELECT role FROM project_collaborators
    WHERE project_id = ${projectId} AND user_id = ${userId}
  `;
  if (collab) return { project, role: collab.role };

  // 3. Platform admin — full access to all projects for moderation/support
  const [adminCheck] = await sql<{ is_platform_admin: boolean }[]>`
    SELECT is_platform_admin FROM users WHERE id = ${userId}
  `;
  if (adminCheck?.is_platform_admin) return { project, role: "owner" };

  // 4. Auto-join: if project has link sharing enabled (public), add as collaborator
  if (project.visibility === "public") {
    try {
      await sql`
        INSERT INTO project_collaborators (project_id, user_id, role)
        VALUES (${projectId}, ${userId}, 'editor')
        ON CONFLICT DO NOTHING
      `;
      return { project, role: "editor" };
    } catch {
      // Failed to auto-join — fall through to deny access
    }
  }

  return null;
}
