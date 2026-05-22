import type postgres from "postgres";
import type { AnalyticsBreakdownItem } from "./analytics-types.js";

export function analyticsMaintenanceQueries(sql: postgres.Sql) {
  return {
    // ─── Browser Breakdown ─────────────────────────────────

    async getBrowsers(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsBreakdownItem[]> {
      const rows = await sql<Array<{ browser: string; count: string }>>`
        SELECT
          COALESCE(browser, 'Unknown') AS browser,
          COUNT(DISTINCT session_id)::text AS count
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp >= ${startDate}
          AND timestamp < ${endDate}
        GROUP BY browser
        ORDER BY count DESC
      `;

      const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

      return rows.map((r) => {
        const count = parseInt(r.count, 10);
        return {
          name: r.browser,
          count,
          percent:
            total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
        };
      });
    },

    // ─── OS Breakdown ──────────────────────────────────────

    async getOperatingSystems(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsBreakdownItem[]> {
      const rows = await sql<Array<{ os: string; count: string }>>`
        SELECT
          COALESCE(os, 'Unknown') AS os,
          COUNT(DISTINCT session_id)::text AS count
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp >= ${startDate}
          AND timestamp < ${endDate}
        GROUP BY os
        ORDER BY count DESC
      `;

      const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

      return rows.map((r) => {
        const count = parseInt(r.count, 10);
        return {
          name: r.os,
          count,
          percent:
            total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
        };
      });
    },

    // ─── Realtime ──────────────────────────────────────────

    async getRealtimeVisitors(projectId: string): Promise<number> {
      // Check page_views first (last 5 minutes)
      const [pvResult] = await sql<[{ count: string }]>`
        SELECT COUNT(DISTINCT visitor_id)::text AS count
        FROM page_views
        WHERE project_id = ${projectId}
          AND created_at > NOW() - INTERVAL '5 minutes'
      `;
      const pvCount = parseInt(pvResult?.count || "0", 10);

      if (pvCount > 0) return pvCount;

      // Fallback
      const [result] = await sql<[{ count: string }]>`
        SELECT COUNT(DISTINCT session_id)::text AS count
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp > NOW() - INTERVAL '5 minutes'
      `;
      return parseInt(result?.count || "0", 10);
    },

    async getRealtimePages(
      projectId: string
    ): Promise<Array<{ path: string; visitors: number }>> {
      // Check page_views first
      const pvRows = await sql<Array<{ path: string; visitors: string }>>`
        SELECT
          path,
          COUNT(DISTINCT visitor_id)::text AS visitors
        FROM page_views
        WHERE project_id = ${projectId}
          AND created_at > NOW() - INTERVAL '5 minutes'
        GROUP BY path
        ORDER BY visitors DESC
      `;

      if (pvRows.length > 0) {
        return pvRows.map((r) => ({
          path: r.path,
          visitors: parseInt(r.visitors, 10),
        }));
      }

      // Fallback
      const rows = await sql<Array<{ path: string; visitors: string }>>`
        SELECT
          path,
          COUNT(DISTINCT session_id)::text AS visitors
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp > NOW() - INTERVAL '5 minutes'
          AND event_type = 'page_view'
        GROUP BY path
        ORDER BY visitors DESC
      `;

      return rows.map((r) => ({
        path: r.path,
        visitors: parseInt(r.visitors, 10),
      }));
    },

    // ─── Aggregation & Maintenance ─────────────────────────

    /**
     * Compute daily aggregates for a given project + date.
     * Uses page_views table for accurate visitor/pageview counts.
     */
    async aggregateDailyStats(
      projectId: string,
      date: Date
    ): Promise<void> {
      // Check if page_views has data for this date
      const [check] = await sql<[{ cnt: string }]>`
        SELECT COUNT(*)::text AS cnt FROM page_views
        WHERE project_id = ${projectId}
          AND (created_at AT TIME ZONE 'UTC')::date = ${date}::date
        LIMIT 1
      `;

      if (parseInt(check?.cnt || "0", 10) > 0) {
        await sql`
          INSERT INTO analytics_daily_stats (
            project_id, date, visitors, page_views, sessions, bounces, total_duration,
            total_visitors, unique_visitors, bounce_count, avg_duration_ms
          )
          SELECT
            ${projectId} AS project_id,
            ${date}::date AS date,
            COUNT(DISTINCT visitor_id) AS visitors,
            COUNT(*) AS page_views,
            COUNT(DISTINCT session_id) AS sessions,
            (
              SELECT COUNT(*)
              FROM (
                SELECT session_id
                FROM page_views sub
                WHERE sub.project_id = ${projectId}
                  AND (sub.created_at AT TIME ZONE 'UTC')::date = ${date}::date
                GROUP BY sub.session_id
                HAVING COUNT(*) = 1
              ) bounce_sessions
            ) AS bounces,
            COALESCE(SUM(duration_ms), 0) AS total_duration,
            COUNT(*) AS total_visitors,
            COUNT(DISTINCT visitor_id) AS unique_visitors,
            (
              SELECT COUNT(*)
              FROM (
                SELECT session_id
                FROM page_views sub2
                WHERE sub2.project_id = ${projectId}
                  AND (sub2.created_at AT TIME ZONE 'UTC')::date = ${date}::date
                GROUP BY sub2.session_id
                HAVING COUNT(*) = 1
              ) bounce_sessions2
            ) AS bounce_count,
            COALESCE(ROUND(AVG(NULLIF(duration_ms, 0))), 0) AS avg_duration_ms
          FROM page_views
          WHERE project_id = ${projectId}
            AND (created_at AT TIME ZONE 'UTC')::date = ${date}::date
          ON CONFLICT (project_id, date) DO UPDATE SET
            visitors = EXCLUDED.visitors,
            page_views = EXCLUDED.page_views,
            sessions = EXCLUDED.sessions,
            bounces = EXCLUDED.bounces,
            total_duration = EXCLUDED.total_duration,
            total_visitors = EXCLUDED.total_visitors,
            unique_visitors = EXCLUDED.unique_visitors,
            bounce_count = EXCLUDED.bounce_count,
            avg_duration_ms = EXCLUDED.avg_duration_ms
        `;
        return;
      }

      // Fallback to analytics_events
      await sql`
        INSERT INTO analytics_daily_stats (project_id, date, visitors, page_views, sessions, bounces, total_duration)
        SELECT
          ${projectId} AS project_id,
          ${date}::date AS date,
          COUNT(DISTINCT session_id) AS visitors,
          COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_views,
          COUNT(DISTINCT session_id) AS sessions,
          (
            SELECT COUNT(*)
            FROM (
              SELECT session_id
              FROM analytics_events sub
              WHERE sub.project_id = ${projectId}
                AND (sub.timestamp AT TIME ZONE 'UTC')::date = ${date}::date
                AND sub.event_type = 'page_view'
              GROUP BY sub.session_id
              HAVING COUNT(*) = 1
            ) bounce_sessions
          ) AS bounces,
          COALESCE(SUM(duration), 0) AS total_duration
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND (timestamp AT TIME ZONE 'UTC')::date = ${date}::date
        ON CONFLICT (project_id, date) DO UPDATE SET
          visitors = EXCLUDED.visitors,
          page_views = EXCLUDED.page_views,
          sessions = EXCLUDED.sessions,
          bounces = EXCLUDED.bounces,
          total_duration = EXCLUDED.total_duration
      `;
    },

    async cleanupOldEvents(daysToKeep: number): Promise<number> {
      const result = await sql`
        DELETE FROM analytics_events
        WHERE timestamp < NOW() - ${daysToKeep + " days"}::interval
      `;
      // Also clean up old page_views
      await sql`
        DELETE FROM page_views
        WHERE created_at < NOW() - ${daysToKeep + " days"}::interval
      `;
      return result.count;
    },
  };
}