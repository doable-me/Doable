import type postgres from "postgres";
import type { DeploymentRow, DeploymentArtifactRow } from "../types.js";

export function deploymentQueries(sql: postgres.Sql) {
  return {
    async create(data: {
      projectId: string;
      environment: string;
      adapter: string;
      deployedBy: string;
      versionNumber?: number;
    }): Promise<DeploymentRow> {
      const [row] = await sql<DeploymentRow[]>`
        INSERT INTO deployments (project_id, environment, adapter, deployed_by, version_number)
        VALUES (
          ${data.projectId},
          ${data.environment},
          ${data.adapter},
          ${data.deployedBy},
          ${data.versionNumber ?? null}
        )
        RETURNING *
      `;
      return row!;
    },

    async findById(id: string): Promise<DeploymentRow | undefined> {
      const [row] = await sql<DeploymentRow[]>`
        SELECT * FROM deployments WHERE id = ${id}
      `;
      return row;
    },

    async listByProject(
      projectId: string,
      opts?: { limit?: number; offset?: number; environment?: string }
    ): Promise<{ rows: DeploymentRow[]; total: number }> {
      const limit = opts?.limit ?? 20;
      const offset = opts?.offset ?? 0;
      const envFilter = opts?.environment
        ? sql`AND environment = ${opts.environment}`
        : sql``;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM deployments
        WHERE project_id = ${projectId} ${envFilter}
      `;

      const rows = await sql<DeploymentRow[]>`
        SELECT * FROM deployments
        WHERE project_id = ${projectId} ${envFilter}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    async updateStatus(
      id: string,
      status: string,
      extra?: {
        url?: string;
        buildLog?: string;
        errorMessage?: string;
        buildTimeMs?: number;
        deployTimeMs?: number;
      }
    ): Promise<DeploymentRow | undefined> {
      const now = new Date();
      const startedAt = status === "building" ? now : undefined;
      const completedAt =
        status === "live" || status === "failed" ? now : undefined;

      const [row] = await sql<DeploymentRow[]>`
        UPDATE deployments
        SET status = ${status},
            url = COALESCE(${extra?.url ?? null}, url),
            build_log = COALESCE(${extra?.buildLog ?? null}, build_log),
            error_message = COALESCE(${extra?.errorMessage ?? null}, error_message),
            build_time_ms = COALESCE(${extra?.buildTimeMs ?? null}, build_time_ms),
            deploy_time_ms = COALESCE(${extra?.deployTimeMs ?? null}, deploy_time_ms),
            started_at = COALESCE(${startedAt ?? null}, started_at),
            completed_at = COALESCE(${completedAt ?? null}, completed_at)
        WHERE id = ${id}
        RETURNING *
      `;
      return row;
    },

    async getLatestLive(
      projectId: string,
      environment: string = "production"
    ): Promise<DeploymentRow | undefined> {
      const [row] = await sql<DeploymentRow[]>`
        SELECT * FROM deployments
        WHERE project_id = ${projectId}
          AND environment = ${environment}
          AND status = 'live'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return row;
    },

    /** Check if there's already a build/deploy in progress for this project. */
    async findInProgress(projectId: string): Promise<DeploymentRow | undefined> {
      const [row] = await sql<DeploymentRow[]>`
        SELECT * FROM deployments
        WHERE project_id = ${projectId}
          AND status IN ('queued', 'building', 'deploying')
          AND created_at > now() - interval '30 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return row;
    },

    async rollback(
      deploymentId: string,
      _rolledBackBy: string
    ): Promise<DeploymentRow | undefined> {
      const [row] = await sql<DeploymentRow[]>`
        UPDATE deployments
        SET status = 'rolled_back'
        WHERE id = ${deploymentId}
        RETURNING *
      `;
      return row;
    },

    // ─── Artifact Tracking ──────────────────────────────────

    async createArtifacts(
      deploymentId: string,
      files: Array<{ path: string; size: number; hash: string }>
    ): Promise<void> {
      if (files.length === 0) return;

      // Batch insert artifacts
      await sql`
        INSERT INTO deployment_artifacts ${sql(
          files.map((f) => ({
            deployment_id: deploymentId,
            file_path: f.path,
            file_size: f.size,
            content_hash: f.hash,
          }))
        )}
      `;
    },

    async listArtifacts(
      deploymentId: string
    ): Promise<DeploymentArtifactRow[]> {
      return sql<DeploymentArtifactRow[]>`
        SELECT * FROM deployment_artifacts
        WHERE deployment_id = ${deploymentId}
        ORDER BY file_path
      `;
    },
  };
}
