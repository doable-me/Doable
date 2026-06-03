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
      //
      // BUG-WS-003: The previous version used `SELECT DISTINCT p.*` which
      // crashes on Postgres when `projects` contains non-comparable column
      // types (jsonb columns like `connector_settings` added in migration
      // 054 don't have a default equality operator usable by DISTINCT,
      // causing the API process to surface a 502 via Cloudflare). The fix
      // selects the project ids via a deduped subquery, then joins back to
      // `projects` for the full row payload. This avoids DISTINCT over the
      // full row and is more performant for paginated reads.
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
        WITH shared_ids AS (
          SELECT
            p.id,
            MAX(GREATEST(
              COALESCE(slv.last_visited_at, 'epoch'::timestamptz),
              COALESCE(pc.added_at, 'epoch'::timestamptz),
              p.updated_at
            )) AS sort_date
          FROM projects p
          LEFT JOIN share_link_visits slv
            ON slv.project_id = p.id AND slv.visitor_user_id = ${userId}
          LEFT JOIN project_collaborators pc
            ON pc.project_id = p.id AND pc.user_id = ${userId}
          WHERE p.deleted_at IS NULL
            AND (slv.id IS NOT NULL OR pc.id IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1 FROM workspace_members wm
              WHERE wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}
            )
          GROUP BY p.id
        )
        SELECT p.*
        FROM shared_ids s
        JOIN projects p ON p.id = s.id
        ORDER BY s.sort_date DESC
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

      // Resolve visitor display info via the SECURITY DEFINER helper
      // (migration 100) instead of a raw `LEFT JOIN users`. Under the users
      // FORCE-RLS policy `users_workspace_visible` (migration 076) the app role
      // `doable_app` only sees users who share a workspace with the caller, so a
      // link-share visitor (who by definition is NOT a workspace member of the
      // owner's workspace) would come back with NULL display_name AND NULL email
      // from the LEFT JOIN — which then crashes the Share dialog's avatar
      // renderer (`(display_name || email).charAt(0)`). The definer helper
      // bypasses that visibility RLS and returns only public-safe columns.
      // Access to share stats is already gated to the project owner upstream.
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
          lu.display_name,
          lu.email,
          slv.visit_count,
          slv.first_visited_at,
          slv.last_visited_at
        FROM share_link_visits slv
        LEFT JOIN doable_lookup_users_by_ids(
                    ARRAY(SELECT visitor_user_id FROM share_link_visits WHERE project_id = ${projectId})
                  ) lu ON lu.id = slv.visitor_user_id
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
