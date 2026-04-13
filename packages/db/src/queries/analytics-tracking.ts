import type postgres from "postgres";
import type { AnalyticsSettingsRow } from "./analytics-types.js";

export function analyticsTrackingQueries(sql: postgres.Sql) {
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

  };
}