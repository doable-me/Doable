import type postgres from "postgres";
import type { AnalyticsOverview, AnalyticsOverviewComparison, AnalyticsTimeseriesPoint } from "./analytics-types.js";

export function analyticsOverviewQueries(sql: postgres.Sql) {
  return {
    // ─── Overview Metrics ──────────────────────────────────

    /**
     * Get overview stats using the page_views table for page view metrics
     * and analytics_events for session/bounce data.
     */
    async getOverview(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsOverview> {
      // Try page_views table first; fall back to analytics_events if empty
      const [pvResult] = await sql<
        [{ total_views: string; unique_visitors: string; avg_duration: string }]
      >`
        SELECT
          COUNT(*)::text AS total_views,
          COUNT(DISTINCT visitor_id)::text AS unique_visitors,
          COALESCE(ROUND(AVG(NULLIF(duration_ms, 0))), 0)::text AS avg_duration
        FROM page_views
        WHERE project_id = ${projectId}
          AND created_at >= ${startDate}
          AND created_at < ${endDate}
      `;

      const pvCount = parseInt(pvResult?.total_views || "0", 10);

      // If page_views table has data, use it for page view metrics
      if (pvCount > 0) {
        const [sessionResult] = await sql<
          [{ sessions: string; bounces: string }]
        >`
          WITH session_stats AS (
            SELECT session_id, COUNT(*) AS pv_count
            FROM page_views
            WHERE project_id = ${projectId}
              AND created_at >= ${startDate}
              AND created_at < ${endDate}
            GROUP BY session_id
          )
          SELECT
            COUNT(*)::text AS sessions,
            COUNT(*) FILTER (WHERE pv_count = 1)::text AS bounces
          FROM session_stats
        `;

        const visitors = parseInt(pvResult?.unique_visitors || "0", 10);
        const pageViews = pvCount;
        const sessions = parseInt(sessionResult?.sessions || "0", 10);
        const bounces = parseInt(sessionResult?.bounces || "0", 10);
        const avgDuration = parseInt(pvResult?.avg_duration || "0", 10);
        const bounceRate = sessions > 0 ? (bounces / sessions) * 100 : 0;

        return { visitors, pageViews, sessions, bounces, avgDuration, bounceRate };
      }

      // Fallback to analytics_events table (backward compatibility)
      const [result] = await sql<
        [
          {
            visitors: string;
            page_views: string;
            sessions: string;
            bounces: string;
            avg_duration: string;
          },
        ]
      >`
        WITH session_stats AS (
          SELECT
            session_id,
            COUNT(*) FILTER (WHERE event_type = 'page_view') AS pv_count,
            AVG(duration) AS avg_dur
          FROM analytics_events
          WHERE project_id = ${projectId}
            AND timestamp >= ${startDate}
            AND timestamp < ${endDate}
          GROUP BY session_id
        )
        SELECT
          COUNT(DISTINCT session_id)::text AS visitors,
          COALESCE(SUM(pv_count), 0)::text AS page_views,
          COUNT(DISTINCT session_id)::text AS sessions,
          COUNT(*) FILTER (WHERE pv_count = 1)::text AS bounces,
          COALESCE(ROUND(AVG(avg_dur)), 0)::text AS avg_duration
        FROM session_stats
      `;

      const visitors = parseInt(result?.visitors || "0", 10);
      const pageViews = parseInt(result?.page_views || "0", 10);
      const sessions = parseInt(result?.sessions || "0", 10);
      const bounces = parseInt(result?.bounces || "0", 10);
      const avgDuration = parseInt(result?.avg_duration || "0", 10);
      const bounceRate = sessions > 0 ? (bounces / sessions) * 100 : 0;

      return { visitors, pageViews, sessions, bounces, avgDuration, bounceRate };
    },

    async getOverviewComparison(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsOverviewComparison> {
      const rangeMs = endDate.getTime() - startDate.getTime();
      const previousStart = new Date(startDate.getTime() - rangeMs);
      const previousEnd = startDate;

      const [current, previous] = await Promise.all([
        this.getOverview(projectId, startDate, endDate),
        this.getOverview(projectId, previousStart, previousEnd),
      ]);

      const pctChange = (curr: number, prev: number): number => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100 * 100) / 100;
      };

      const changes: AnalyticsOverview = {
        visitors: pctChange(current.visitors, previous.visitors),
        pageViews: pctChange(current.pageViews, previous.pageViews),
        sessions: pctChange(current.sessions, previous.sessions),
        bounces: pctChange(current.bounces, previous.bounces),
        avgDuration: pctChange(current.avgDuration, previous.avgDuration),
        bounceRate: pctChange(current.bounceRate, previous.bounceRate),
      };

      return { current, previous, changes };
    },

    // ─── Page View Timeline ─────────────────────────────

    /**
     * Daily page view counts for charting.
     * Uses page_views table if it has data, falls back to analytics_events.
     */
    async getPageViewTimeline(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsTimeseriesPoint[]> {
      // Check if page_views has data for this range
      const [check] = await sql<[{ cnt: string }]>`
        SELECT COUNT(*)::text AS cnt FROM page_views
        WHERE project_id = ${projectId}
          AND created_at >= ${startDate}
          AND created_at < ${endDate}
        LIMIT 1
      `;

      if (parseInt(check?.cnt || "0", 10) > 0) {
        const rows = await sql<
          Array<{ date: string; visitors: string; page_views: string }>
        >`
          WITH date_series AS (
            SELECT d::date AS date
            FROM generate_series(
              ${startDate}::date,
              ${endDate}::date,
              '1 day'::interval
            ) AS d
          ),
          daily AS (
            SELECT
              (created_at AT TIME ZONE 'UTC')::date AS date,
              COUNT(DISTINCT visitor_id)::text AS visitors,
              COUNT(*)::text AS page_views
            FROM page_views
            WHERE project_id = ${projectId}
              AND created_at >= ${startDate}
              AND created_at < ${endDate}
            GROUP BY (created_at AT TIME ZONE 'UTC')::date
          )
          SELECT
            ds.date::text AS date,
            COALESCE(d.visitors, '0') AS visitors,
            COALESCE(d.page_views, '0') AS page_views
          FROM date_series ds
          LEFT JOIN daily d ON ds.date = d.date
          ORDER BY ds.date ASC
        `;

        return rows.map((r) => ({
          date: r.date,
          visitors: parseInt(r.visitors, 10),
          pageViews: parseInt(r.page_views, 10),
        }));
      }

      // Fallback to analytics_events
      return this.getTimeseries(projectId, startDate, endDate);
    },

    // ─── Timeseries (legacy, from analytics_events) ─────

    async getTimeseries(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsTimeseriesPoint[]> {
      const rows = await sql<
        Array<{ date: string; visitors: string; page_views: string }>
      >`
        WITH date_series AS (
          SELECT d::date AS date
          FROM generate_series(
            ${startDate}::date,
            ${endDate}::date,
            '1 day'::interval
          ) AS d
        ),
        daily AS (
          SELECT
            (timestamp AT TIME ZONE 'UTC')::date AS date,
            COUNT(DISTINCT session_id)::text AS visitors,
            COUNT(*) FILTER (WHERE event_type = 'page_view')::text AS page_views
          FROM analytics_events
          WHERE project_id = ${projectId}
            AND timestamp >= ${startDate}
            AND timestamp < ${endDate}
          GROUP BY (timestamp AT TIME ZONE 'UTC')::date
        )
        SELECT
          ds.date::text AS date,
          COALESCE(d.visitors, '0') AS visitors,
          COALESCE(d.page_views, '0') AS page_views
        FROM date_series ds
        LEFT JOIN daily d ON ds.date = d.date
        ORDER BY ds.date ASC
      `;

      return rows.map((r) => ({
        date: r.date,
        visitors: parseInt(r.visitors, 10),
        pageViews: parseInt(r.page_views, 10),
      }));
    },

  };
}