import type postgres from "postgres";
import type { ShareLinkVisitRow, ProjectRow } from "../types.js";

export function shareTrackingQueries(sql: postgres.Sql) {
  return {
    /**
     * Record a visit to a shared project. Upserts — first visit creates the
     * row, subsequent visits bump the counter and last_visited_at.
     * Skips recording if the visitor is the project's workspace owner.
     */
    async recordVisit(projectId: string, visitorUserId: string): Promise<void> {
      await sql`
        INSERT INTO share_link_visits (project_id, visitor_user_id)
        VALUES (${projectId}, ${visitorUserId})
        ON CONFLICT (project_id, visitor_user_id) DO UPDATE SET
          visit_count = share_link_visits.visit_count + 1,
          last_visited_at = now()
      `;
    },

    /**
     * List projects shared with a user — projects they've visited or been
     * added as a collaborator on, but that don't belong to their own workspace.
     * Returns full project rows ordered by last visited.
     */
    async listSharedWithUser(
      userId: string,
      opts: { page?: number; pageSize?: number } = {}
    ): Promise<{ rows: ProjectRow[]; total: number }> {
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      // Union of: projects visited via share link + projects where user is
      // a collaborator but NOT a workspace member.
      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(DISTINCT p.id)::text
        FROM projects p
        WHERE p.deleted_at IS NULL
          AND (
            -- Visited via share link
            EXISTS (
              SELECT 1 FROM share_link_visits slv
              WHERE slv.project_id = p.id AND slv.visitor_user_id = ${userId}
            )
            OR
            -- Added as project collaborator (not via own workspace)
            EXISTS (
              SELECT 1 FROM project_collaborators pc
              WHERE pc.project_id = p.id AND pc.user_id = ${userId}
            )
          )
          -- Exclude projects from user's own workspaces
          AND NOT EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
          )
      `;

      const rows = await sql<ProjectRow[]>`
        SELECT DISTINCT p.*,
          COALESCE(slv.last_visited_at, pc.added_at, p.updated_at) AS _sort_date
        FROM projects p
        LEFT JOIN share_link_visits slv
          ON slv.project_id = p.id AND slv.visitor_user_id = ${userId}
        LEFT JOIN project_collaborators pc
          ON pc.project_id = p.id AND pc.user_id = ${userId}
        WHERE p.deleted_at IS NULL
          AND (slv.id IS NOT NULL OR pc.id IS NOT NULL)
          -- Exclude projects from user's own workspaces
          AND NOT EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
          )
        ORDER BY _sort_date DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    /**
     * Get share analytics for a project — how many unique visitors,
     * total visits, and the list of visitors with their visit counts.
     */
    async getShareStats(projectId: string): Promise<{
      uniqueVisitors: number;
      totalVisits: number;
      visitors: Array<{
        user_id: string;
        display_name: string | null;
        email: string;
        visit_count: number;
        first_visited_at: Date;
        last_visited_at: Date;
      }>;
    }> {
      const [agg] = await sql<[{ unique_visitors: string; total_visits: string }]>`
        SELECT
          count(*)::text AS unique_visitors,
          COALESCE(sum(visit_count), 0)::text AS total_visits
        FROM share_link_visits
        WHERE project_id = ${projectId}
      `;

      const visitors = await sql<Array<{
        user_id: string;
        display_name: string | null;
        email: string;
        visit_count: number;
        first_visited_at: Date;
        last_visited_at: Date;
      }>>`
        SELECT
          slv.visitor_user_id AS user_id,
          u.display_name,
          u.email,
          slv.visit_count,
          slv.first_visited_at,
          slv.last_visited_at
        FROM share_link_visits slv
        INNER JOIN users u ON u.id = slv.visitor_user_id
        WHERE slv.project_id = ${projectId}
        ORDER BY slv.last_visited_at DESC
      `;

      return {
        uniqueVisitors: parseInt(agg!.unique_visitors, 10),
        totalVisits: parseInt(agg!.total_visits, 10),
        visitors,
      };
    },
  };
}
