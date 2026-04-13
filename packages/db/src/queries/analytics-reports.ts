import type postgres from "postgres";
import type { AnalyticsTopPage, AnalyticsReferrer, AnalyticsBreakdownItem } from "./analytics-types.js";

export function analyticsReportQueries(sql: postgres.Sql) {
  return {
    // ─── Top Pages ─────────────────────────────────────────

    async getTopPages(
      projectId: string,
      startDate: Date,
      endDate: Date,
      limit: number = 10
    ): Promise<AnalyticsTopPage[]> {
      // Try page_views first
      const [check] = await sql<[{ cnt: string }]>`
        SELECT COUNT(*)::text AS cnt FROM page_views
        WHERE project_id = ${projectId}
          AND created_at >= ${startDate}
          AND created_at < ${endDate}
        LIMIT 1
      `;

      if (parseInt(check?.cnt || "0", 10) > 0) {
        const rows = await sql<
          Array<{
            path: string;
            views: string;
            visitors: string;
            avg_duration: string;
          }>
        >`
          SELECT
            path,
            COUNT(*)::text AS views,
            COUNT(DISTINCT visitor_id)::text AS visitors,
            COALESCE(ROUND(AVG(NULLIF(duration_ms, 0))), 0)::text AS avg_duration
          FROM page_views
          WHERE project_id = ${projectId}
            AND created_at >= ${startDate}
            AND created_at < ${endDate}
          GROUP BY path
          ORDER BY views DESC
          LIMIT ${limit}
        `;

        return rows.map((r) => ({
          path: r.path,
          views: parseInt(r.views, 10),
          visitors: parseInt(r.visitors, 10),
          avgDuration: parseInt(r.avg_duration, 10),
        }));
      }

      // Fallback to analytics_events
      const rows = await sql<
        Array<{
          path: string;
          views: string;
          visitors: string;
          avg_duration: string;
        }>
      >`
        SELECT
          path,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::text AS views,
          COUNT(DISTINCT session_id)::text AS visitors,
          COALESCE(ROUND(AVG(duration)), 0)::text AS avg_duration
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp >= ${startDate}
          AND timestamp < ${endDate}
        GROUP BY path
        ORDER BY views DESC
        LIMIT ${limit}
      `;

      return rows.map((r) => ({
        path: r.path,
        views: parseInt(r.views, 10),
        visitors: parseInt(r.visitors, 10),
        avgDuration: parseInt(r.avg_duration, 10),
      }));
    },

    // ─── Top Referrers ─────────────────────────────────────

    async getTopReferrers(
      projectId: string,
      startDate: Date,
      endDate: Date,
      limit: number = 20
    ): Promise<AnalyticsReferrer[]> {
      // Try page_views first
      const [check] = await sql<[{ cnt: string }]>`
        SELECT COUNT(*)::text AS cnt FROM page_views
        WHERE project_id = ${projectId}
          AND created_at >= ${startDate}
          AND created_at < ${endDate}
          AND referrer IS NOT NULL
          AND referrer != ''
        LIMIT 1
      `;

      const usePageViews = parseInt(check?.cnt || "0", 10) > 0;

      const rows = usePageViews
        ? await sql<
            Array<{ source: string; source_type: string; visits: string }>
          >`
          WITH classified AS (
            SELECT
              CASE
                WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                WHEN referrer ~* '(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\\.\\w' THEN
                  CASE
                    WHEN referrer ~* 'google' THEN 'Google'
                    WHEN referrer ~* 'bing' THEN 'Bing'
                    WHEN referrer ~* 'yahoo' THEN 'Yahoo'
                    WHEN referrer ~* 'duckduckgo' THEN 'DuckDuckGo'
                    WHEN referrer ~* 'baidu' THEN 'Baidu'
                    WHEN referrer ~* 'yandex' THEN 'Yandex'
                    WHEN referrer ~* 'ecosia' THEN 'Ecosia'
                    ELSE 'Other Search'
                  END
                WHEN referrer ~* '(twitter|x)\\.com' THEN 'Twitter/X'
                WHEN referrer ~* 'facebook\\.com|fb\\.com' THEN 'Facebook'
                WHEN referrer ~* 'instagram\\.com' THEN 'Instagram'
                WHEN referrer ~* 'linkedin\\.com' THEN 'LinkedIn'
                WHEN referrer ~* 'reddit\\.com' THEN 'Reddit'
                WHEN referrer ~* 'youtube\\.com' THEN 'YouTube'
                WHEN referrer ~* 'tiktok\\.com' THEN 'TikTok'
                WHEN referrer ~* 'pinterest\\.com' THEN 'Pinterest'
                WHEN referrer ~* 'github\\.com' THEN 'GitHub'
                ELSE SUBSTRING(referrer FROM '(?:https?://)?(?:www\\.)?([^/]+)')
              END AS source,
              CASE
                WHEN referrer IS NULL OR referrer = '' THEN 'direct'
                WHEN referrer ~* '(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\\.\\w' THEN 'search'
                WHEN referrer ~* '(twitter|x)\\.com|facebook\\.com|fb\\.com|instagram\\.com|linkedin\\.com|reddit\\.com|youtube\\.com|tiktok\\.com|pinterest\\.com' THEN 'social'
                ELSE 'referral'
              END AS source_type
            FROM page_views
            WHERE project_id = ${projectId}
              AND created_at >= ${startDate}
              AND created_at < ${endDate}
          )
          SELECT
            source,
            source_type,
            COUNT(*)::text AS visits
          FROM classified
          GROUP BY source, source_type
          ORDER BY visits DESC
          LIMIT ${limit}
        `
        : await sql<
            Array<{ source: string; source_type: string; visits: string }>
          >`
          WITH classified AS (
            SELECT
              CASE
                WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                WHEN referrer ~* '(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\\.\\w' THEN
                  CASE
                    WHEN referrer ~* 'google' THEN 'Google'
                    WHEN referrer ~* 'bing' THEN 'Bing'
                    WHEN referrer ~* 'yahoo' THEN 'Yahoo'
                    WHEN referrer ~* 'duckduckgo' THEN 'DuckDuckGo'
                    WHEN referrer ~* 'baidu' THEN 'Baidu'
                    WHEN referrer ~* 'yandex' THEN 'Yandex'
                    WHEN referrer ~* 'ecosia' THEN 'Ecosia'
                    ELSE 'Other Search'
                  END
                WHEN referrer ~* '(twitter|x)\\.com' THEN 'Twitter/X'
                WHEN referrer ~* 'facebook\\.com|fb\\.com' THEN 'Facebook'
                WHEN referrer ~* 'instagram\\.com' THEN 'Instagram'
                WHEN referrer ~* 'linkedin\\.com' THEN 'LinkedIn'
                WHEN referrer ~* 'reddit\\.com' THEN 'Reddit'
                WHEN referrer ~* 'youtube\\.com' THEN 'YouTube'
                WHEN referrer ~* 'tiktok\\.com' THEN 'TikTok'
                WHEN referrer ~* 'pinterest\\.com' THEN 'Pinterest'
                WHEN referrer ~* 'github\\.com' THEN 'GitHub'
                ELSE SUBSTRING(referrer FROM '(?:https?://)?(?:www\\.)?([^/]+)')
              END AS source,
              CASE
                WHEN referrer IS NULL OR referrer = '' THEN 'direct'
                WHEN referrer ~* '(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\\.\\w' THEN 'search'
                WHEN referrer ~* '(twitter|x)\\.com|facebook\\.com|fb\\.com|instagram\\.com|linkedin\\.com|reddit\\.com|youtube\\.com|tiktok\\.com|pinterest\\.com' THEN 'social'
                ELSE 'referral'
              END AS source_type
            FROM analytics_events
            WHERE project_id = ${projectId}
              AND timestamp >= ${startDate}
              AND timestamp < ${endDate}
              AND event_type = 'page_view'
          )
          SELECT
            source,
            source_type,
            COUNT(*)::text AS visits
          FROM classified
          GROUP BY source, source_type
          ORDER BY visits DESC
          LIMIT ${limit}
        `;

      const totalVisits = rows.reduce(
        (sum, r) => sum + parseInt(r.visits, 10),
        0
      );

      return rows.map((r) => {
        const visits = parseInt(r.visits, 10);
        return {
          source: r.source,
          type: r.source_type,
          visits,
          percent:
            totalVisits > 0
              ? Math.round((visits / totalVisits) * 100 * 100) / 100
              : 0,
        };
      });
    },

    // Keep the old getReferrers method as an alias
    async getReferrers(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsReferrer[]> {
      return this.getTopReferrers(projectId, startDate, endDate);
    },

    // ─── Device Breakdown ──────────────────────────────────

    async getDeviceBreakdown(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsBreakdownItem[]> {
      // Try page_views first
      const [check] = await sql<[{ cnt: string }]>`
        SELECT COUNT(*)::text AS cnt FROM page_views
        WHERE project_id = ${projectId}
          AND created_at >= ${startDate}
          AND created_at < ${endDate}
        LIMIT 1
      `;

      if (parseInt(check?.cnt || "0", 10) > 0) {
        const rows = await sql<Array<{ device: string; count: string }>>`
          SELECT
            COALESCE(device_type, 'Unknown') AS device,
            COUNT(DISTINCT visitor_id)::text AS count
          FROM page_views
          WHERE project_id = ${projectId}
            AND created_at >= ${startDate}
            AND created_at < ${endDate}
          GROUP BY device_type
          ORDER BY count DESC
        `;

        const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

        return rows.map((r) => {
          const count = parseInt(r.count, 10);
          return {
            name: r.device,
            count,
            percent:
              total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
          };
        });
      }

      // Fallback to analytics_events
      return this.getDevices(projectId, startDate, endDate);
    },

    // Keep original getDevices for backward compatibility
    async getDevices(
      projectId: string,
      startDate: Date,
      endDate: Date
    ): Promise<AnalyticsBreakdownItem[]> {
      const rows = await sql<Array<{ device: string; count: string }>>`
        SELECT
          COALESCE(device_type, 'Unknown') AS device,
          COUNT(DISTINCT session_id)::text AS count
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND timestamp >= ${startDate}
          AND timestamp < ${endDate}
        GROUP BY device_type
        ORDER BY count DESC
      `;

      const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

      return rows.map((r) => {
        const count = parseInt(r.count, 10);
        return {
          name: r.device,
          count,
          percent:
            total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
        };
      });
    },

  };
}