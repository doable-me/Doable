/**
 * Resolve environment variables for a project + target.
 * Used by dev-server and builder to inject user-defined env vars.
 *
 * Phase 1C of integration↔AI chat bridge: when a workspaceId/userId scope is
 * provided, this also pulls vault-backed integration credentials via
 * `resolveVaultEnv` and merges them UNDER the user's `env_vars` table — so a
 * value the user explicitly set in the env-vars UI always wins over a
 * connector-provided default.
 */
import { sql } from "../db/index.js";
import { envVarQueries, projectQueries } from "@doable/db";
import {
  resolveVaultEnv,
  type IntegrationEnvManifest,
} from "./vault-bridge.js";

const vars = envVarQueries(sql);
const projects = projectQueries(sql);

/**
 * Resolves all env vars for a project, merging workspace-level and project-level
 * user-managed `env_vars`. Project vars override workspace vars for the same key.
 *
 * If `workspaceId` AND `userId` are provided, also merges in vault-backed
 * integration credentials. Merge order is `{ ...vault, ...userEnvVars }` so
 * the user's `env_vars` table always overrides vault-derived values.
 *
 * Returns a flat key-value map ready to spread into process.env.
 *
 * Backwards-compatible: callers that omit `workspaceId`/`userId` get the
 * legacy behavior (env_vars table only).
 */
export async function resolveProjectEnvVars(
  projectId: string,
  target: "development" | "preview" | "production",
  workspaceId?: string,
  userId?: string,
): Promise<Record<string, string>> {
  try {
    const project = await projects.findById(projectId);
    if (!project) return {};

    const userEnvVars = await vars.resolveForProject(
      project.workspace_id,
      projectId,
      target,
    );

    // Use the project's workspace_id when caller didn't pass one explicitly.
    const wsId = workspaceId ?? project.workspace_id;

    // Only consult the vault when we have a userId — vault scoping is
    // (workspace, project, user) and we cannot meaningfully look up
    // user-scoped credentials without it.
    if (userId) {
      try {
        const { env: vaultEnv } = await resolveVaultEnv(wsId, projectId, userId);
        // user env_vars LAST → user wins over vault.
        return { ...vaultEnv, ...userEnvVars };
      } catch (err) {
        console.warn(
          `[env-vars] vault-bridge failed for project ${projectId}, falling back to user env_vars only:`,
          err,
        );
      }
    }

    return userEnvVars;
  } catch (err) {
    console.error(`[env-vars] Failed to resolve vars for project ${projectId}:`, err);
    return {};
  }
}

/**
 * Same as `resolveProjectEnvVars` but also returns the vault manifest so
 * callers (e.g. the system-prompt manifest helper in Phase 1E) can reuse the
 * single decrypt round-trip without redoing the work.
 *
 * `manifest` is empty when no vault lookup happened (no userId, or failure).
 */
export async function resolveProjectEnvWithManifest(
  projectId: string,
  target: "development" | "preview" | "production",
  workspaceId?: string,
  userId?: string,
): Promise<{ env: Record<string, string>; manifest: IntegrationEnvManifest[] }> {
  try {
    const project = await projects.findById(projectId);
    if (!project) return { env: {}, manifest: [] };

    const userEnvVars = await vars.resolveForProject(
      project.workspace_id,
      projectId,
      target,
    );

    const wsId = workspaceId ?? project.workspace_id;

    if (userId) {
      try {
        const { env: vaultEnv, manifest } = await resolveVaultEnv(
          wsId,
          projectId,
          userId,
        );
        return { env: { ...vaultEnv, ...userEnvVars }, manifest };
      } catch (err) {
        console.warn(
          `[env-vars] vault-bridge failed for project ${projectId}, falling back to user env_vars only:`,
          err,
        );
      }
    }

    return { env: userEnvVars, manifest: [] };
  } catch (err) {
    console.error(`[env-vars] Failed to resolve vars for project ${projectId}:`, err);
    return { env: {}, manifest: [] };
  }
}
