import { sql } from "../../db/index.js";
import { projectQueries } from "@doable/db";
import { workspaceQueries } from "@doable/db";

const projects = projectQueries(sql);
const workspacesQ = workspaceQueries(sql);

export { projects, workspacesQ };

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

// ─── Helper: verify user can access a project ────────────────
// Checks workspace membership first, then project_collaborators.
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

  return null;
}
