import { Hono } from "hono";
import { z } from "zod";
import { analyticsQueries } from "@doable/db";
import { projectQueries } from "@doable/db";
import { sql } from "../../db/index.js";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";
import { getTrackingSnippet } from "../../analytics/tracker.js";

const analytics = analyticsQueries(sql);
const projects = projectQueries(sql);

// Public URL — used for tracking snippet generation
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.CORS_ORIGINS?.split(",")[0]?.replace(/\/$/, "") ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

export const dashboardRoutes = new Hono<AuthEnv>();

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

// ══════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES (auth required for all below)
// ══════════════════════════════════════════════════════════════

dashboardRoutes.use("/projects/*", authMiddleware);

// ─── GET /projects/:id/overview — Overview metrics ───────────
dashboardRoutes.get("/projects/:id/overview", async (c) => {
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
dashboardRoutes.get("/projects/:id/timeseries", async (c) => {
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
dashboardRoutes.get("/projects/:id/pageviews", async (c) => {
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
dashboardRoutes.get("/projects/:id/events", async (c) => {
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
dashboardRoutes.get("/projects/:id/pages", async (c) => {
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
dashboardRoutes.get("/projects/:id/referrers", async (c) => {
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
dashboardRoutes.get("/projects/:id/devices", async (c) => {
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
dashboardRoutes.get("/projects/:id/browsers", async (c) => {
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
dashboardRoutes.get("/projects/:id/os", async (c) => {
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
dashboardRoutes.get("/projects/:id/realtime", async (c) => {
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
dashboardRoutes.get("/projects/:id/settings", async (c) => {
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

dashboardRoutes.put("/projects/:id/settings", async (c) => {
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
