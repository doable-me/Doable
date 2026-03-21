import { serve } from "@hono/node-server";
import { request as httpRequest } from "node:http";
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
import { contextRoutes, workspaceContextRoutes } from "./routes/context.js";
import { templateRoutes } from "./routes/templates.js";
import { versionRoutes } from "./routes/versions.js";
import { githubRoutes } from "./routes/github.js";
import { projectFileRoutes } from "./routes/project-files.js";
import { previewRoutes } from "./routes/preview-proxy.js";
import { getDevServerInternalUrl } from "./projects/dev-server.js";
import { thumbnailRoutes } from "./routes/thumbnails.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { aiSettingsRoutes } from "./routes/ai-settings.js";
import { adminRoutes } from "./routes/admin.js";
import { securityRoutes } from "./routes/security.js";
import { communityRoutes } from "./routes/community.js";
import { connectorRoutes } from "./routes/connectors.js";
import { skillsRoutes } from "./routes/skills.js";
import { teamChatRoutes } from "./routes/team-chat.js";
import { directSaveRoutes } from "./direct-save/index.js";
import { rateLimiter } from "./middleware/rate-limit.js";
import { getConnectorManager } from "./mcp/connector-manager.js";

// ─── Visual Edit Bridge Script ───────────────────────────────
// This script is loaded by preview iframes at /visual-edit-bridge.js
// as a fallback for when the inline bridge cannot be injected.
// The primary bridge is the inline version in visual-edit-bridge-inline.ts.
// This must stay in sync with that inline version.
import { VISUAL_EDIT_BRIDGE_INLINE } from "./visual-edit-bridge-inline.js";
const VISUAL_EDIT_BRIDGE_JS = VISUAL_EDIT_BRIDGE_INLINE;

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
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/thumbnails/") || c.req.path.startsWith("/analytics/") || c.req.path.match(/^\/templates\/[^/]+\/preview/) || c.req.path === "/visual-edit-bridge.js") {
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
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/analytics/") || c.req.path === "/visual-edit-bridge.js") {
    await next();
    return;
  }
  return apiRateLimiter(c, next);
});

// ─── Visual Edit Bridge Script (served to preview iframes) ───
app.get("/visual-edit-bridge.js", (c) => {
  c.header("Content-Type", "application/javascript");
  c.header("Cache-Control", "no-cache");
  c.header("Access-Control-Allow-Origin", "*");
  return c.body(VISUAL_EDIT_BRIDGE_JS);
});

// ─── Routes ─────────────────────────────────────────────────
app.route("/health", healthRoutes);
app.route("/auth", authRoutes);
// Preview reverse proxy — forwards /preview/:projectId/* to the Vite dev server.
// Must be before other catch-all routes.
app.route("/", previewRoutes);
// Project file routes (no auth — filesystem-backed, powers live preview)
app.route("/", projectFileRoutes);
// Direct save — AST-based visual edit saves (no AI, no auth — filesystem-backed)
app.route("/", directSaveRoutes);
// Chat & editor routes BEFORE project routes (projectRoutes has wildcard auth middleware)
app.route("/", chatRoutes);
app.route("/", editorRoutes);
app.route("/projects", projectRoutes);
app.route("/workspaces", workspaceRoutes);
app.route("/workspaces", aiSettingsRoutes);
app.route("/folders", folderRoutes);
app.route("/billing", billingRoutes);
app.route("/deploy", deployRoutes);
app.route("/projects/:id/context", contextRoutes);
app.route("/templates", templateRoutes);
app.route("/projects", versionRoutes);
app.route("/", githubRoutes);
app.route("/thumbnails", thumbnailRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/admin", adminRoutes);
app.route("/projects", securityRoutes);
app.route("/community", communityRoutes);
app.route("/workspaces", connectorRoutes);
app.route("/workspaces", skillsRoutes);
app.route("/workspaces/:wid/context", workspaceContextRoutes);
app.route("/team-chat", teamChatRoutes);

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
const host = process.env.API_HOST ?? "127.0.0.1";

console.log(`Doable API starting on ${host}:${port}`);

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

// ─── WebSocket Proxy for Vite HMR ─────────────────────────────
// Proxies WebSocket upgrade requests on /preview/:projectId/...
// to the project's Vite dev server so HMR works through any
// reverse proxy (Cloudflare, nginx, etc.) without special config.
server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  const match = url.match(/^\/preview\/([^/]+)\//);
  if (!match) return socket.destroy();

  const projectId = match[1];
  const devUrl = getDevServerInternalUrl(projectId);
  if (!devUrl) return socket.destroy();

  // Parse the Vite dev server's host:port
  const target = new URL(devUrl);

  const proxyReq = httpRequest({
    hostname: target.hostname,
    port: target.port,
    path: url,
    method: "GET",
    headers: req.headers,
  });

  proxyReq.on("upgrade", (_proxyRes, proxySocket, proxyHead) => {
    // Send the 101 Switching Protocols response back to the client
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${_proxyRes.headers["sec-websocket-accept"]}\r\n` +
      (_proxyRes.headers["sec-websocket-protocol"]
        ? `Sec-WebSocket-Protocol: ${_proxyRes.headers["sec-websocket-protocol"]}\r\n`
        : "") +
      "\r\n"
    );

    // Write any buffered data
    if (proxyHead.length > 0) socket.write(proxyHead);
    if (head.length > 0) proxySocket.write(head);

    // Pipe bidirectionally
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });

  proxyReq.on("error", () => socket.destroy());
  proxyReq.end();
});

// ─── Graceful Shutdown ──────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, shutting down...");
  try {
    await getConnectorManager().shutdown();
  } catch (err) {
    console.error("[Server] Error during MCP shutdown:", err);
  }
  process.exit(0);
});

export default app;
export type AppType = typeof app;
