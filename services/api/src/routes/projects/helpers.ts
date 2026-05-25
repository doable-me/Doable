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
// (BUG-CORPUS-PROJ-002, BUG-CORPUS-PROJ-003). Mirrors the
// workspace-role.ts guard.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nil UUID — RFC 4122 §4.1.7 reserves all-zeros as the "nil" UUID. Treat it
// as invalid for project ids so a placeholder/test row keyed on it can't be
// silently created or mutated (BUG-CORPUS-PROJ-004 — PATCH/DELETE on
// `00000000-0000-0000-0000-000000000000` was returning 200 because a stub
// row existed, having been auto-created by the chat `createIfMissing` flow
// in a prior run).
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function isProjectIdValid(id: string | undefined): boolean {
  return !!id && UUID_REGEX.test(id) && id.toLowerCase() !== NIL_UUID;
}

/**
 * Hono middleware that returns 400 if a UUID-shaped path param is missing,
 * malformed, or the nil UUID. Apply via
 * `routes.use("/:id", validateProjectIdParam())` and
 * `routes.use("/:id/*", validateProjectIdParam())` so all handlers under
 * that mount get the guard for free.
 *
 * @param paramName - which Hono path param to read. Defaults to `id`. Pass
 *   `"projectId"` for routers that capture the id under a different name
 *   (e.g. versions, env-vars, file-routes).
 */
// Sibling collection routes mounted next to /:id (in projectListRoutes).
// When Hono's TrieRouter sees /projects/starred it can route the *handler*
// to the specific /starred route in projectListRoutes, but the middleware
// from projectItemRoutes.use("/:id", ...) still fires because :id matches
// "starred". Without this skip-list, calls to /projects/starred etc. were
// being rejected with `{error:"Invalid project id"}` 400.
const RESERVED_LIST_SEGMENTS = new Set([
  "starred",
  "shared",
  "recently-viewed",
  "trash",
]);

export function validateProjectIdParam(paramName: string = "id") {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const id = c.req.param(paramName);
    if (id && RESERVED_LIST_SEGMENTS.has(id.toLowerCase())) {
      await next();
      return;
    }
    if (!id || !UUID_REGEX.test(id)) {
      return c.json({ error: "Invalid project id" }, 400);
    }
    // BUG-API-003: the nil UUID is a syntactically valid UUID. For GET
    // requests, return 404 (not found) rather than 400 (malformed input) —
    // REST convention. For write methods (PATCH/PUT/DELETE/POST) we still
    // return 400 because BUG-CORPUS-PROJ-004 showed a stub row keyed on the
    // nil UUID could be silently created/mutated by the chat
    // `createIfMissing` flow. Keeping writes hard-blocked closes that.
    if (id.toLowerCase() === NIL_UUID) {
      if (c.req.method === "GET") {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.json({ error: "Invalid project id" }, 400);
    }
    await next();
  });
}

/**
 * Hono middleware that validates a UUID-shaped *query* parameter (e.g.
 * `GET /projects?workspaceId=…`). Returns 400 if the param is present but
 * not a UUID. Missing params are allowed through — handlers fall back to
 * defaults.
 */
export function validateUuidQueryParam(queryName: string, label?: string) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const v = c.req.query(queryName);
    if (v !== undefined && v !== "" && !UUID_REGEX.test(v)) {
      return c.json({ error: `Invalid ${label ?? queryName}` }, 400);
    }
    await next();
  });
}

// ─── Role hierarchy helper ──────────────────────────────────
const ROLES = WORKSPACE_ROLES as readonly string[];

// BUG-FOLDER-006: `project_collaborators` uses its own role vocabulary
// (`owner | admin | editor | viewer`) — `editor` is NOT in
// `WORKSPACE_ROLES` (`viewer | member | admin | owner`). Without
// normalization, `isRoleAtLeast("editor", "member")` returns `-1 >= 1`
// (false), which mis-routes project-collaborator editors into the
// "Viewers cannot edit projects" 403 branch on PATCH /projects/:id.
// Map `editor` to the workspace-role equivalent `member` before the
// hierarchy comparison.
function normalizeRole(role: string): string {
  if (role === "editor") return "member";
  return role;
}

export function isRoleAtLeast(role: string, minRole: WorkspaceRole): boolean {
  return ROLES.indexOf(normalizeRole(role)) >= ROLES.indexOf(minRole);
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

// ─── Helper: READ access to a workspace-scoped resource ──────
// Grants when the caller is a workspace member (preserves existing behavior
// exactly) OR — least-privilege fallback for project collaborators — when the
// caller has project access (requireProjectAccess) to a project that lives in
// THIS workspace. The latter is intended only for READ endpoints the editor
// needs to load (effective AI settings, providers list, skills manifest) so a
// user shared into a private project can run AI chat on that shared project.
//
// It must NEVER be used to authorize writes or to expose other projects /
// workspaces: it confirms project.workspace_id === workspaceId before granting,
// so a collaborator cannot pivot to an unrelated workspace by passing a
// projectId from a different one. Fails closed (returns false) on any mismatch
// or missing access.
export async function hasWorkspaceReadAccessViaProject(
  userId: string,
  workspaceId: string,
  projectId: string | undefined,
): Promise<boolean> {
  // 1. Workspace member — unchanged path.
  const wsRole = await workspacesQ.getMemberRole(workspaceId, userId);
  if (wsRole) return true;

  // 2. Project-collaborator fallback. Requires an explicit projectId scoping
  //    the read to a single shared project.
  if (!projectId || !isProjectIdValid(projectId)) return false;
  const access = await requireProjectAccess(userId, projectId);
  if (!access) return false;
  // The project the caller can access MUST belong to the workspace in the
  // path, otherwise this would leak another workspace's settings.
  return access.project.workspace_id === workspaceId;
}
