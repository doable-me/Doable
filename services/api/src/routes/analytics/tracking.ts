import { Hono } from "hono";
import { z } from "zod";
import { analyticsQueries } from "@doable/db";
import { projectQueries } from "@doable/db";
import { sql } from "../../db/index.js";
import {
  getTrackingScript,
  generateVisitorId,
  parseUserAgent,
} from "../../analytics/tracker.js";

export const trackingRoutes = new Hono({ strict: false });

// Public URL — this gets embedded in the tracking script served to browsers
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.CORS_ORIGINS?.split(",")[0]?.replace(/\/$/, "") ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

const analytics = analyticsQueries(sql);
const projects = projectQueries(sql);

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

// ─── Schemas ──────────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth required)
// ══════════════════════════════════════════════════════════════

// ─── GET /script.js — Serve tracking script ──────────────────
trackingRoutes.get("/script.js", async (c) => {
  const script = getTrackingScript(apiUrl);
  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "public, max-age=300, s-maxage=60");
  return c.body(script);
});

// ─── POST /track — Track analytics event (no auth) ───────────
// This endpoint must be FAST: no auth, minimal processing, async DB writes.

trackingRoutes.post("/track", async (c) => {
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
