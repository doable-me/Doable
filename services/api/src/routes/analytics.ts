import { Hono } from "hono";
import { z } from "zod";
import { analyticsQueries } from "@doable/db";
import { projectQueries } from "@doable/db";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import {
  getTrackingScript,
  getTrackingSnippet,
  generateVisitorId,
  parseUserAgent,
} from "../analytics/tracker.js";

const analytics = analyticsQueries(sql);
const projects = projectQueries(sql);

export const analyticsRoutes = new Hono<AuthEnv>();

// Public URL — this gets embedded in the tracking script served to browsers
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.CORS_ORIGINS?.split(",")[0]?.replace(/\/$/, "") ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

// ─── Helpers ──────────────────────────────────────────────────

function parseDateRange(range?: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
      break;
  }

  return { startDate, endDate };
}

// ─── Rate Limiter for Track Endpoint ──────────────────────────

const trackRateLimits = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup
const trackCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of trackRateLimits) {
    if (entry.resetAt <= now) {
      trackRateLimits.delete(key);
    }
  }
}, 120_000);
if (trackCleanupInterval.unref) {
  trackCleanupInterval.unref();
}

function isTrackRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = trackRateLimits.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + 60_000 };
    trackRateLimits.set(ip, entry);
  }

  entry.count++;
  return entry.count > 100;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth required)
// ══════════════════════════════════════════════════════════════

// ─── GET /script.js — Serve tracking script ──────────────────
analyticsRoutes.get("/script.js", async (c) => {
  const script = getTrackingScript(apiUrl);
  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(script);
});

// ─── POST /track — Track analytics event (no auth) ───────────
// This endpoint must be FAST: no auth, minimal processing, async DB writes.

const trackEventSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: z.string().min(1).default("page_view"),
  path: z.string().default("/"),
  referrer: z.string().nullable().optional(),
  userAgent: z.string().optional(),
  deviceType: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  screenWidth: z.number().int().optional(),
  screenHeight: z.number().int().optional(),
  duration: z.number().int().min(0).optional(),
  eventData: z.record(z.unknown()).nullable().optional(),
});

const trackBatchSchema = z.object({
  events: z.array(trackEventSchema).min(1).max(50),
});

analyticsRoutes.post("/track", async (c) => {
  try {
    // Rate limit by IP — fast check before any processing
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    if (isTrackRateLimited(ip)) {
      return c.body(null, 429);
    }

    // Parse body — sendBeacon sends text/plain by default
    const contentType = c.req.header("content-type") ?? "";
    let payload: unknown;

    if (contentType.includes("application/json")) {
      payload = await c.req.json();
    } else {
      const text = await c.req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }
    }

    const body = payload as Record<string, unknown>;

    // Generate anonymous visitor ID server-side (privacy-friendly, no cookies)
    const serverUA = c.req.header("user-agent") ?? "";
    const visitorId = generateVisitorId({ ip, userAgent: serverUA });

    // Determine if batch or single event
    if (body.events && Array.isArray(body.events)) {
      // Batch mode
      const parsed = trackBatchSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Validation failed" }, 400);
      }

      // Validate all project IDs exist and have analytics enabled
      const projectIds = [...new Set(parsed.data.events.map((e) => e.projectId))];
      for (const pid of projectIds) {
        const project = await projects.findById(pid);
        if (!project) {
          return c.json({ error: `Project ${pid} not found` }, 400);
        }
        const settings = await analytics.getSettings(pid);
        if (settings && !settings.enabled) {
          return c.json({ error: `Analytics disabled for project ${pid}` }, 403);
        }
      }

      // Process events: insert page_views + analytics_events
      const analyticsEvents = [];
      for (const e of parsed.data.events) {
        const ua = e.userAgent || serverUA;
        const uaParsed = ua ? parseUserAgent(ua) : { deviceType: "desktop" as const, browser: "Unknown", os: "Unknown" };

        if (e.eventType === "page_view") {
          // Insert into page_views table (fast path)
          analytics.insertPageView({
            projectId: e.projectId,
            visitorId,
            sessionId: e.sessionId,
            path: e.path,
            referrer: e.referrer,
            userAgent: ua || undefined,
            deviceType: e.deviceType || uaParsed.deviceType,
            durationMs: e.duration ?? 0,
          }).catch((err) => {
            console.error("[analytics] Failed to insert page view:", err);
          });
        } else if (e.eventType === "page_leave") {
          // Update duration on the existing page_view record
          analytics.updatePageViewDuration({
            sessionId: e.sessionId,
            path: e.path,
            durationMs: e.duration ?? 0,
          }).catch((err) => {
            console.error("[analytics] Failed to update page view duration:", err);
          });
        }

        // Always record in analytics_events for full event history
        analyticsEvents.push({
          projectId: e.projectId,
          visitorId,
          sessionId: e.sessionId,
          eventType: e.eventType,
          path: e.path,
          referrer: e.referrer ?? undefined,
          userAgent: ua || undefined,
          deviceType: e.deviceType || uaParsed.deviceType,
          browser: e.browser || uaParsed.browser,
          os: e.os || uaParsed.os,
          screenWidth: e.screenWidth ?? undefined,
          screenHeight: e.screenHeight ?? undefined,
          duration: e.duration ?? 0,
          eventData: e.eventData ?? undefined,
        });
      }

      // Batch insert analytics_events (fire-and-forget for speed)
      analytics.trackEvents(analyticsEvents).catch((err) => {
        console.error("[analytics] Failed to batch insert events:", err);
      });

      return c.body(null, 204);
    } else {
      // Single event mode
      const parsed = trackEventSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Validation failed" }, 400);
      }

      const event = parsed.data;

      // Validate project exists
      const project = await projects.findById(event.projectId);
      if (!project) {
        return c.json({ error: "Project not found" }, 400);
      }

      // Check analytics is enabled
      const settings = await analytics.getSettings(event.projectId);
      if (settings && !settings.enabled) {
        return c.json({ error: "Analytics disabled for this project" }, 403);
      }

      // Parse user-agent server-side
      const ua = event.userAgent || serverUA;
      const uaParsed = ua ? parseUserAgent(ua) : { deviceType: "desktop" as const, browser: "Unknown", os: "Unknown" };

      // Insert into page_views table for page_view events
      if (event.eventType === "page_view") {
        analytics.insertPageView({
          projectId: event.projectId,
          visitorId,
          sessionId: event.sessionId,
          path: event.path,
          referrer: event.referrer,
          userAgent: ua || undefined,
          deviceType: event.deviceType || uaParsed.deviceType,
          durationMs: event.duration ?? 0,
        }).catch((err) => {
          console.error("[analytics] Failed to insert page view:", err);
        });
      } else if (event.eventType === "page_leave") {
        // Update duration on the existing page_view record
        analytics.updatePageViewDuration({
          sessionId: event.sessionId,
          path: event.path,
          durationMs: event.duration ?? 0,
        }).catch((err) => {
          console.error("[analytics] Failed to update page view duration:", err);
        });
      }

      // Always record in analytics_events (fire-and-forget for speed)
      analytics.trackEvent({
        projectId: event.projectId,
        visitorId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        path: event.path,
        referrer: event.referrer ?? undefined,
        userAgent: ua || undefined,
        deviceType: event.deviceType || uaParsed.deviceType,
        browser: event.browser || uaParsed.browser,
        os: event.os || uaParsed.os,
        screenWidth: event.screenWidth ?? undefined,
        screenHeight: event.screenHeight ?? undefined,
        duration: event.duration ?? 0,
        eventData: event.eventData ?? undefined,
      }).catch((err) => {
        console.error("[analytics] Failed to insert event:", err);
      });

      return c.body(null, 204);
    }
  } catch (err) {
    console.error("[analytics] Failed to process tracking event:", err);
    return c.json({ error: "Failed to process event" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES (auth required for all below)
// ══════════════════════════════════════════════════════════════

analyticsRoutes.use("/projects/*", authMiddleware);

// ─── GET /projects/:id/overview — Overview metrics ───────────
analyticsRoutes.get("/projects/:id/overview", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const comparison = await analytics.getOverviewComparison(
      projectId,
      startDate,
      endDate
    );

    return c.json({
      data: {
        visitors: comparison.current.visitors,
        pageViews: comparison.current.pageViews,
        sessions: comparison.current.sessions,
        avgDuration: comparison.current.avgDuration,
        bounceRate: comparison.current.bounceRate,
        changes: {
          visitors: comparison.changes.visitors,
          pageViews: comparison.changes.pageViews,
          sessions: comparison.changes.sessions,
          avgDuration: comparison.changes.avgDuration,
          bounceRate: comparison.changes.bounceRate,
        },
      },
    });
  } catch (err) {
    console.error("[analytics] Overview query failed:", err);
    return c.json({ error: "Failed to fetch overview" }, 500);
  }
});

// ─── GET /projects/:id/timeseries — Daily data for charts ────
analyticsRoutes.get("/projects/:id/timeseries", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const data = await analytics.getPageViewTimeline(projectId, startDate, endDate);
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Timeseries query failed:", err);
    return c.json({ error: "Failed to fetch timeseries" }, 500);
  }
});

// ─── GET /projects/:id/pageviews — Page views with date range filter
analyticsRoutes.get("/projects/:id/pageviews", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const data = await analytics.getPageViewTimeline(projectId, startDate, endDate);
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Pageviews query failed:", err);
    return c.json({ error: "Failed to fetch pageviews" }, 500);
  }
});

// ─── GET /projects/:id/events — Custom events ────────────────
analyticsRoutes.get("/projects/:id/events", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)));

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const data = await analytics.getCustomEvents(projectId, startDate, endDate, limit);
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Events query failed:", err);
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// ─── GET /projects/:id/pages — Top pages ─────────────────────
analyticsRoutes.get("/projects/:id/pages", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "10", 10)));

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const data = await analytics.getTopPages(projectId, startDate, endDate, limit);
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Pages query failed:", err);
    return c.json({ error: "Failed to fetch pages" }, 500);
  }
});

// ─── GET /projects/:id/referrers — Traffic sources ───────────
analyticsRoutes.get("/projects/:id/referrers", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const data = await analytics.getTopReferrers(projectId, startDate, endDate);
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Referrers query failed:", err);
    return c.json({ error: "Failed to fetch referrers" }, 500);
  }
});

// ─── GET /projects/:id/devices — Device breakdown ────────────
analyticsRoutes.get("/projects/:id/devices", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const items = await analytics.getDeviceBreakdown(projectId, startDate, endDate);
    const data = items.map((item) => ({
      device: item.name,
      count: item.count,
      percent: item.percent,
    }));
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Devices query failed:", err);
    return c.json({ error: "Failed to fetch devices" }, 500);
  }
});

// ─── GET /projects/:id/browsers — Browser breakdown ──────────
analyticsRoutes.get("/projects/:id/browsers", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const items = await analytics.getBrowsers(projectId, startDate, endDate);
    const data = items.map((item) => ({
      browser: item.name,
      count: item.count,
      percent: item.percent,
    }));
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] Browsers query failed:", err);
    return c.json({ error: "Failed to fetch browsers" }, 500);
  }
});

// ─── GET /projects/:id/os — OS breakdown ─────────────────────
analyticsRoutes.get("/projects/:id/os", async (c) => {
  const projectId = c.req.param("id");
  const range = c.req.query("range");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const { startDate, endDate } = parseDateRange(range);

  try {
    const items = await analytics.getOperatingSystems(projectId, startDate, endDate);
    const data = items.map((item) => ({
      os: item.name,
      count: item.count,
      percent: item.percent,
    }));
    return c.json({ data });
  } catch (err) {
    console.error("[analytics] OS query failed:", err);
    return c.json({ error: "Failed to fetch OS data" }, 500);
  }
});

// ─── GET /projects/:id/realtime — Active visitors ────────────
analyticsRoutes.get("/projects/:id/realtime", async (c) => {
  const projectId = c.req.param("id");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    const [activeVisitors, pages] = await Promise.all([
      analytics.getRealtimeVisitors(projectId),
      analytics.getRealtimePages(projectId),
    ]);

    return c.json({
      data: {
        activeVisitors,
        pages,
      },
    });
  } catch (err) {
    console.error("[analytics] Realtime query failed:", err);
    return c.json({ error: "Failed to fetch realtime data" }, 500);
  }
});

// ─── GET /projects/:id/settings — Get analytics settings ─────
analyticsRoutes.get("/projects/:id/settings", async (c) => {
  const projectId = c.req.param("id");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    const settings = await analytics.getSettings(projectId);
    return c.json({
      data: {
        enabled: settings?.enabled ?? false,
        trackingSnippet: getTrackingSnippet(apiUrl, projectId),
      },
    });
  } catch (err) {
    console.error("[analytics] Settings query failed:", err);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

// ─── PUT /projects/:id/settings — Update analytics settings ──

const settingsSchema = z.object({
  enabled: z.boolean(),
});

analyticsRoutes.put("/projects/:id/settings", async (c) => {
  const projectId = c.req.param("id");

  const project = await projects.findById(projectId);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const body = await c.req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  try {
    const settings = await analytics.updateSettings(
      projectId,
      parsed.data.enabled
    );
    return c.json({
      data: {
        enabled: settings.enabled,
        updatedAt: settings.updated_at.toISOString(),
      },
    });
  } catch (err) {
    console.error("[analytics] Settings update failed:", err);
    return c.json({ error: "Failed to update settings" }, 500);
  }
});
