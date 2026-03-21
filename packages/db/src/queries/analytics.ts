import type postgres from "postgres";

// ─── Row Types ───────────────────────────────────────────────

export interface PageViewRow {
  id: number;
  project_id: string;
  visitor_id: string;
  session_id: string;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  device_type: string | null;
  country: string | null;
  duration_ms: number;
  created_at: Date;
}

export interface AnalyticsEventRow {
  id: string;
  project_id: string;
  visitor_id: string | null;
  session_id: string;
  event_type: string;
  event_name: string | null;
  event_data: Record<string, unknown> | null;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  screen_width: number | null;
  screen_height: number | null;
  duration: number;
  timestamp: Date;
  created_at: Date;
}

export interface AnalyticsSettingsRow {
  project_id: string;
  enabled: boolean;
  updated_at: Date;
}

export interface AnalyticsDailyStatsRow {
  id: number;
  project_id: string;
  date: Date;
  total_visitors: number;
  unique_visitors: number;
  page_views: number;
  bounce_count: number;
  avg_duration_ms: number;
  visitors: number;
  sessions: number;
  bounces: number;
  total_duration: number;
  created_at: Date;
}

// ─── Query Result Types ──────────────────────────────────────

export interface AnalyticsOverview {
  visitors: number;
  pageViews: number;
  sessions: number;
  bounces: number;
  avgDuration: number;
  bounceRate: number;
}

export interface AnalyticsOverviewComparison {
  current: AnalyticsOverview;
  previous: AnalyticsOverview;
  changes: AnalyticsOverview;
}

export interface AnalyticsTimeseriesPoint {
  date: string;
  visitors: number;
  pageViews: number;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
  visitors: number;
  avgDuration: number;
}

export interface AnalyticsReferrer {
  source: string;
  type: string;
  visits: number;
  percent: number;
}

export interface AnalyticsBreakdownItem {
  name: string;
  count: number;
  percent: number;
}

export interface AnalyticsCustomEvent {
  id: string;
  event_name: string;
  event_data: Record<string, unknown> | null;
  path: string;
  visitor_id: string | null;
  session_id: string;
  created_at: Date;
}

// ─── Queries ─────────────────────────────────────────────────

export function analyticsQueries(sql: postgres.Sql) {
  return {
    // ─── Page View Tracking (new page_views table) ──────

    /**
     * Insert a page view record into the dedicated page_views table.
     * This is the fast-path for the tracking endpoint.
     */
    async insertPageView(data: {
      projectId: string;
      visitorId: string;
      sessionId: string;
      path: string;
      referrer?: string | null;
      userAgent?: string | null;
      deviceType?: string | null;
      country?: string | null;
      durationMs?: number;
    }): Promise<void> {
      await sql`
        INSERT INTO page_views (
          project_id, visitor_id, session_id, path, referrer,
          user_agent, device_type, country, duration_ms
        ) VALUES (
          ${data.projectId}, ${data.visitorId}, ${data.sessionId}, ${data.path},
          ${data.referrer ?? null}, ${data.userAgent ?? null},
          ${data.deviceType ?? null}, ${data.country ?? null},
          ${data.durationMs ?? 0}
        )
      `;
    },

    /**
     * Update page view duration when a page_leave event is received.
     * Finds the most recent page view for the session+path and updates its duration.
     */
    async updatePageViewDuration(data: {
      sessionId: string;
      path: string;
      durationMs: number;
    }): Promise<void> {
      await sql`
        UPDATE page_views
        SET duration_ms = ${data.durationMs}
        WHERE id = (
          SELECT id FROM page_views
          WHERE session_id = ${data.sessionId}
            AND path = ${data.path}
          ORDER BY created_at DESC
          LIMIT 1
        )
      `;
    },

    // ─── Event Tracking (analytics_events table) ────────

    async trackEvent(event: {
      projectId: string;
      visitorId?: string;
      sessionId: string;
      eventType: string;
      eventName?: string;
      eventData?: Record<string, unknown> | null;
      path: string;
      referrer?: string;
      userAgent?: string;
      deviceType?: string;
      browser?: string;
      os?: string;
      country?: string;
      screenWidth?: number;
      screenHeight?: number;
      duration?: number;
    }): Promise<void> {
      await sql`
        INSERT INTO analytics_events (
          project_id, visitor_id, session_id, event_type, path, referrer,
          user_agent, device_type, browser, os, country,
          screen_width, screen_height, duration, event_data
        ) VALUES (
          ${event.projectId}, ${event.visitorId ?? null}, ${event.sessionId},
          ${event.eventType}, ${event.path},
          ${event.referrer ?? null}, ${event.userAgent ?? null}, ${event.deviceType ?? null},
          ${event.browser ?? null}, ${event.os ?? null}, ${event.country ?? null},
          ${event.screenWidth ?? null}, ${event.screenHeight ?? null}, ${event.duration ?? 0},
          ${event.eventData ? sql.json(event.eventData as postgres.JSONValue) : null}
        )
      `;
    },

    async trackEvents(
      events: Array<{
        projectId: string;
        visitorId?: string;
        sessionId: string;
        eventType: string;
        eventName?: string;
        eventData?: Record<string, unknown> | null;
        path: string;
        referrer?: string;
        userAgent?: string;
        deviceType?: string;
        browser?: string;
        os?: string;
        country?: string;
        screenWidth?: number;
        screenHeight?: number;
        duration?: number;
      }>
    ): Promise<void> {
      if (events.length === 0) return;

      const rows = events.map((e) => ({
        project_id: e.projectId,
        visitor_id: e.visitorId ?? null,
        session_id: e.sessionId,
        event_type: e.eventType,
        path: e.path,
        referrer: e.referrer ?? null,
        user_agent: e.userAgent ?? null,
        device_type: e.deviceType ?? null,
        browser: e.browser ?? null,
        os: e.os ?? null,
        country: e.country ?? null,
        screen_width: e.screenWidth ?? null,
        screen_height: e.screenHeight ?? null,
        duration: e.duration ?? 0,
        event_data: e.eventData ? JSON.stringify(e.eventData) : null,
      }));

      await sql`
        INSERT INTO analytics_events ${sql(
          rows,
          "project_id",
          "visitor_id",
          "session_id",
          "event_type",
          "path",
          "referrer",
          "user_agent",
          "device_type",
          "browser",
          "os",
          "country",
          "screen_width",
          "screen_height",
          "duration",
          "event_data"
        )}
      `;
    },

    // ─── Custom Events Queries ──────────────────────────

    async getCustomEvents(
      projectId: string,
      startDate: Date,
      endDate: Date,
      limit: number = 50
    ): Promise<Array<{ eventName: string; count: number; lastSeen: string }>> {
      const rows = await sql<
        Array<{ event_name: string; count: string; last_seen: string }>
      >`
        SELECT
          COALESCE(event_data->>'name', event_type) AS event_name,
          COUNT(*)::text AS count,
          MAX(timestamp)::text AS last_seen
        FROM analytics_events
        WHERE project_id = ${projectId}
          AND event_type = 'custom'
          AND timestamp >= ${startDate}
          AND timestamp < ${endDate}
        GROUP BY COALESCE(event_data->>'name', event_type)
        ORDER BY count DESC
        LIMIT ${limit}
      `;

      return rows.map((r) => ({
        eventName: r.event_name,
        count: parseInt(r.count, 10),
        lastSeen: r.last_seen,
      }));
    },

    // ─── Settings ──────────────────────────────────────────

    async getSettings(
      projectId: string
    ): Promise<AnalyticsSettingsRow | undefined> {
      const [row] = await sql<AnalyticsSettingsRow[]>`
        SELECT * FROM analytics_settings WHERE project_id = ${projectId}
      `;
      return row;
    },

    async updateSettings(
      projectId: string,
      enabled: boolean
    ): Promise<AnalyticsSettingsRow> {
      const [row] = await sql<AnalyticsSettingsRow[]>`
        INSERT INTO analytics_settings (project_id, enabled, updated_at)
        VALUES (${projectId}, ${enabled}, NOW())
        ON CONFLICT (project_id) DO UPDATE SET enabled = ${enabled}, updated_at = NOW()
        RETURNING *
      `;
      return row!;
    },

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
