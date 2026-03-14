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
import { rateLimiter } from "./middleware/rate-limit.js";

const app = new Hono();

// ─── Global Middleware ──────────────────────────────────────
app.use("*", logger());
app.use("*", timing());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);
app.use("*", rateLimiter({ windowMs: 60_000, max: 100 }));

// ─── Routes ─────────────────────────────────────────────────
app.route("/health", healthRoutes);
app.route("/auth", authRoutes);
app.route("/projects", projectRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/folders", folderRoutes);
app.route("/", editorRoutes);
app.route("/", chatRoutes);
app.route("/billing", billingRoutes);
app.route("/deploy", deployRoutes);
app.route("/projects/:id/context", contextRoutes);
app.route("/templates", templateRoutes);
app.route("/projects", versionRoutes);
app.route("/", githubRoutes);

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
