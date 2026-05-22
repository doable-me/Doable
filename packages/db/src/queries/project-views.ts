import type postgres from "postgres";
import type { ProjectRow } from "../types.js";

export function projectViewQueries(sql: postgres.Sql) {
  return {
    /** Upsert a view record (updates viewed_at if already exists) */
    async recordView(userId: string, projectId: string): Promise<void> {
      await sql`
        INSERT INTO project_views (user_id, project_id, viewed_at)
        VALUES (${userId}, ${projectId}, NOW())
        ON CONFLICT (user_id, project_id)
        DO UPDATE SET viewed_at = NOW()
      `;
    },

    /** Get recently viewed projects for a user, with pagination */
    async listRecentlyViewed(
      userId: string,
      workspaceId: string,
      opts: { page?: number; pageSize?: number } = {}
    ): Promise<{ rows: ProjectRow[]; total: number }> {
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 12;
      const offset = (page - 1) * pageSize;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM project_views pv
        JOIN projects p ON p.id = pv.project_id
        WHERE pv.user_id = ${userId}
          AND p.workspace_id = ${workspaceId}
          AND p.deleted_at IS NULL
      `;

      const rows = await sql<(ProjectRow & { viewed_at: Date })[]>`
        SELECT p.*, pv.viewed_at
        FROM project_views pv
        JOIN projects p ON p.id = pv.project_id
        WHERE pv.user_id = ${userId}
          AND p.workspace_id = ${workspaceId}
          AND p.deleted_at IS NULL
        ORDER BY pv.viewed_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },
  };
}
