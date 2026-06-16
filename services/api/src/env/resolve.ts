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

    // Always consult the vault. Connector creds connected at WORKSPACE or
    // PROJECT scope (e.g. a Supabase project connected to THIS project) are
    // user-independent, so they MUST resolve even without a userId — the lazy
    // preview-proxy auto-start path has none, and gating on userId there was
    // the reason a connected Supabase app showed no data until restarted from a
    // user-scoped route. getEffective only adds user-scoped connections when a
    // userId is supplied, so passing undefined never leaks another user's creds.
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

    // Resolve vault env regardless of userId (workspace/project-scoped
    // connections are user-independent). See resolveProjectEnvVars above.
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

    return { env: userEnvVars, manifest: [] };
  } catch (err) {
    console.error(`[env-vars] Failed to resolve vars for project ${projectId}:`, err);
    return { env: {}, manifest: [] };
  }
}
