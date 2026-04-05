/**
 * Resolve environment variables for a project + target.
 * Used by dev-server and builder to inject user-defined env vars.
 */
import { sql } from "../db/index.js";
import { envVarQueries, projectQueries } from "@doable/db";

const vars = envVarQueries(sql);
const projects = projectQueries(sql);

/**
 * Resolves all env vars for a project, merging workspace-level and project-level.
 * Project vars override workspace vars for the same key.
 *
 * Returns a flat key-value map ready to spread into process.env.
 */
export async function resolveProjectEnvVars(
  projectId: string,
  target: "development" | "preview" | "production",
): Promise<Record<string, string>> {
  try {
    const project = await projects.findById(projectId);
    if (!project) return {};
    return await vars.resolveForProject(project.workspace_id, projectId, target);
  } catch (err) {
    console.error(`[env-vars] Failed to resolve vars for project ${projectId}:`, err);
    return {};
  }
}
