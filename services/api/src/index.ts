import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { folderRoutes } from "./routes/folders.js";
import { editorRoutes } from "./routes/editor.js";
import { chatRoutes } from "./routes/chat.js";
import { billingRoutes } from "./routes/billing.js";
import { deployRoutes } from "./routes/deploy.js";
import { contextRoutes } from "./routes/context.js";
import { templateRoutes } from "./routes/templates.js";
import { versionRoutes } from "./routes/versions.js";
import { githubRoutes } from "./routes/github.js";
import { projectFileRoutes } from "./routes/project-files.js";
import { previewRoutes } from "./routes/preview-proxy.js";
import { thumbnailRoutes } from "./routes/thumbnails.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { rateLimiter } from "./middleware/rate-limit.js";

const app = new Hono();

// Pre-create middleware instances (avoid re-instantiating on every request)
const secureHeadersMw = secureHeaders();
const apiRateLimiter = rateLimiter({ windowMs: 60_000, max: 100 });

// ─── Global Middleware ──────────────────────────────────────
app.use("*", logger());
app.use("*", timing());

// Secure headers for all routes EXCEPT /preview/* and /thumbnails/* —
// the default secureHeaders() sets X-Frame-Options: SAMEORIGIN and
// Cross-Origin-Resource-Policy: same-origin which block cross-origin
// iframe embedding and image loading.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/thumbnails/") || c.req.path.startsWith("/analytics/")) {
    await next();
    return;
  }
  return secureHeadersMw(c, next);
});

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      // Preview proxy routes: allow any origin (iframe embedding)
      if (c.req.path.startsWith("/preview/")) {
        return origin;
      }

      // Allow any localhost origin (any port) for development
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin;
      }

      // Allow any 127.0.0.1 origin (any port) for development
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return origin;
      }

      // Check against explicit allowed origins from env
      const allowed = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);
      if (allowed.length > 0 && allowed.includes(origin)) {
        return origin;
      }

      // Default: allow the origin (in dev mode)
      if (process.env.NODE_ENV !== "production") {
        return origin;
      }

      return allowed[0] ?? "http://localhost:3000";
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Rate limiter for all routes EXCEPT /preview/* — a single Vite page load
// triggers many subrequests (HTML + JS chunks + CSS + assets) which would
// quickly exhaust the limit and cause preview loads to fail with 429.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/analytics/")) {
    await next();
    return;
  }
  return apiRateLimiter(c, next);
});

// ─── Routes ─────────────────────────────────────────────────
app.route("/health", healthRoutes);
app.route("/auth", authRoutes);
// Preview reverse proxy — forwards /preview/:projectId/* to the Vite dev server.
// Must be before other catch-all routes.
app.route("/", previewRoutes);
// Project file routes (no auth — filesystem-backed, powers live preview)
app.route("/", projectFileRoutes);
// Chat & editor routes BEFORE project routes (projectRoutes has wildcard auth middleware)
app.route("/", chatRoutes);
app.route("/", editorRoutes);
app.route("/projects", projectRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/folders", folderRoutes);
app.route("/billing", billingRoutes);
app.route("/deploy", deployRoutes);
app.route("/projects/:id/context", contextRoutes);
app.route("/templates", templateRoutes);
app.route("/projects", versionRoutes);
app.route("/", githubRoutes);
app.route("/thumbnails", thumbnailRoutes);
app.route("/analytics", analyticsRoutes);

// ─── 404 Fallback ───────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

// ─── Global Error Handler ───────────────────────────────────
app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    {
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    },
    500
  );
});

// ─── Start Server ───────────────────────────────────────────
const port = parseInt(process.env.API_PORT ?? "4000", 10);
const host = process.env.API_HOST ?? "0.0.0.0";

console.log(`Doable API starting on ${host}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

export default app;
export type AppType = typeof app;
