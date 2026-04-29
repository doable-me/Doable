import { serve } from "@hono/node-server";
import { initDocore, shutdownDocore } from "./ai/docore-bridge.js";
import { initEmailService, stopEmailService } from "./lib/email/index.js";
import { backfillBuiltinConnectors } from "./mcp/builtin-connectors.js";
import { startMarketplaceFeaturedRefresher } from "./jobs/marketplace-featured-refresher.js";
import { request as httpRequest } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { sql } from "./db/index.js";
import {
  getDevServerInternalUrlWhenReady,
  isRunning,
  startDevServer,
} from "./projects/dev-server.js";
import { ensureDependencies, isProjectScaffolded } from "./projects/file-manager.js";
import { rateLimiter } from "./middleware/rate-limit.js";
import { getConnectorManager } from "./mcp/connector-manager.js";
import { getCopilotManager } from "./ai/providers/copilot-manager.js";
import { getOAuthRedirectUri } from "./integrations/oauth2.js";
import { mountRoutes } from "./routes.js";

// ─── Visual Edit Bridge Script ───────────────────────────────
// This script is loaded by preview iframes at /visual-edit-bridge.js
// as a fallback for when the inline bridge cannot be injected.
// The primary bridge is the inline version in visual-edit-bridge-inline.ts.
// This must stay in sync with that inline version.
import { VISUAL_EDIT_BRIDGE_INLINE } from "./visual-edit-bridge-inline.js";
const VISUAL_EDIT_BRIDGE_JS = VISUAL_EDIT_BRIDGE_INLINE;

// Swallow async socket errors from the preview reverse-proxy that escape
// fetch()'s try/catch. When Vite is restarted by install_package, in-flight
// outgoing sockets to the old Vite process emit `'error' → ECONNRESET` on
// the Node stream layer *after* fetch() has already returned and the
// ReadableStream of `resp.body` is being piped to the Hono response. The
// error fires asynchronously on the raw TCP socket, so neither the proxy's
// try/catch nor the Response stream's error handler catches it. Without
// this guard, a single preview request racing a Vite restart crashes the
// entire API process with `Unhandled 'error' event` — observed during bug-
// 20 verification. ECONNRESET and ECONNREFUSED on the preview forwarder
// are always harmless races, never a symptom of a real bug, so we log and
// continue.
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "EPIPE") {
    console.warn(`[api] swallowed async socket error: ${err.code} — ${err.message}`);
    return;
  }
  // Spawn errors from MCP connectors (e.g. bad command path, missing binary)
  // should never kill the API. They are logged and surfaced to the user via
  // connector status, not as fatal crashes.
  if (err.code === "ENOENT" && err.syscall?.startsWith("spawn")) {
    console.error(`[api] swallowed spawn ENOENT (bad MCP command?): ${err.message} — path: ${err.path}`);
    return;
  }
  // Any other uncaught exception is a real bug — rethrow so the process
  // crashes fast and tsx watch spawns a fresh one.
  console.error("[api] FATAL uncaught exception:", err);
  throw err;
});
process.on("unhandledRejection", (reason) => {
  const err = reason as NodeJS.ErrnoException | undefined;
  if (err?.code === "ECONNRESET" || err?.code === "ECONNREFUSED" || err?.code === "EPIPE") {
    console.warn(`[api] swallowed async rejection: ${err.code} — ${err.message}`);
    return;
  }
  console.error("[api] unhandled rejection:", reason);
});

const app = new Hono();

async function ensureProjectFilesTableExists(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS project_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, file_path)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_project_files_project_id
    ON project_files(project_id)
  `;

  try {
    await sql`GRANT ALL PRIVILEGES ON TABLE project_files TO doable`;
  } catch {
    // In local/dev setups, the `doable` role may not exist.
  }
}

// Pre-create middleware instances (avoid re-instantiating on every request)
const secureHeadersMw = secureHeaders();
const apiRateLimiter = rateLimiter({
  windowMs: 60_000,
  max: 200,
  keyGenerator: (c) => {
    // Use Authorization token (per-user) or fall back to IP
    const auth = c.req.header("authorization");
    if (auth) return `auth:${auth.slice(-16)}`;
    return c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  },
});

// ─── Global Middleware ──────────────────────────────────────
// Custom logger that suppresses high-frequency polling endpoints
const QUIET_PATHS = ["/admin/copilot-sessions", "/analytics/track"];
app.use("*", async (c, next) => {
  if (QUIET_PATHS.some((p) => c.req.path === p)) return next();
  return logger()(c, next);
});
app.use("*", timing());

// Secure headers for all routes EXCEPT /preview/* and /thumbnails/* —
// the default secureHeaders() sets X-Frame-Options: SAMEORIGIN and
// Cross-Origin-Resource-Policy: same-origin which block cross-origin
// iframe embedding and image loading.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/thumbnails/") || c.req.path.startsWith("/artifacts/") || c.req.path.startsWith("/analytics/") || c.req.path.match(/^\/templates\/[^/]+\/preview/) || c.req.path === "/visual-edit-bridge.js") {
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

// Trailing-slash normalization — Hono's router is strict about trailing
// slashes, so `GET /workspaces/` returns 404 while `GET /workspaces` returns
// 200. That caused bugs 7 and 13 where clients that built URLs with a
// base+path concatenation hit 404s inconsistently.
//
// Approach: issue a 308 Permanent Redirect with `Cache-Control: no-store`
// so browsers don't cache the redirect (which would make subsequent
// unrelated path changes behave inconsistently as seen during round-2
// fix-verification). Redirect happens AFTER CORS so the redirect response
// carries `Access-Control-Allow-Origin`. OPTIONS preflight is short-
// circuited to a 204 before the redirect would apply, so there's no
// "redirect on preflight" problem.
//
// EXCEPT: `/preview/:projectId/` is the canonical Vite dev server entry
// point (Vite serves index.html at the trailing-slash path), and
// `/thumbnails/` is a static asset prefix — leave both untouched.
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (
    c.req.method !== "OPTIONS" &&
    path.length > 1 &&
    path.endsWith("/") &&
    !path.startsWith("/preview/") &&
    !path.startsWith("/thumbnails/")
  ) {
    const url = new URL(c.req.url);
    url.pathname = path.replace(/\/+$/, "");
    c.header("Cache-Control", "no-store");
    return c.redirect(url.toString(), 308);
  }
  return next();
});

// Rate limiter for all routes EXCEPT /preview/* — a single Vite page load
// triggers many subrequests (HTML + JS chunks + CSS + assets) which would
// quickly exhaust the limit and cause preview loads to fail with 429.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/preview/") || c.req.path.startsWith("/thumbnails/") || c.req.path.startsWith("/analytics/") || c.req.path.startsWith("/admin/") || c.req.path === "/visual-edit-bridge.js") {
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
mountRoutes(app);

// ─── 404 Fallback ───────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

// ─── Global Error Handler ───────────────────────────────────
app.onError((err, c) => {
  // Honor Hono's HTTPException status (e.g. zValidator's 400 on malformed
  // JSON body, bodyLimit 413, and any explicit throw new HTTPException()).
  // Without this branch those were being masked as 500 (ed4cac5 regression).
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  // Raw SyntaxError from routes that call c.req.json() directly without a
  // zValidator wrapper.
  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }
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
console.log(`[Integrations] OAuth callback URI: ${getOAuthRedirectUri()} — add this to your OAuth providers' allowed redirect URIs`);

await ensureProjectFilesTableExists().catch((err) => {
  console.warn("[startup] ensure project_files table failed:", err);
});

// Initialize docore (AI sandbox + policy engine). Safe to await
// synchronously here — docore engines are created lazily on first
// user acquire, so this only logs configuration.
await initDocore().catch((err) => {
  console.error("[docore] init failed:", err);
});

// Initialize email service (provider + queue worker)
await initEmailService(sql).catch((err) => {
  console.error("[Email] init failed:", err);
});

// Provision built-in MCP Apps for any workspace that doesn't have them yet.
// Runs once per startup; per-workspace state is tracked in
// workspace_builtin_provisioned so user deletions are respected.
void backfillBuiltinConnectors();

// Refresh the featured-listings/discover materialised views every 5 min.
// Cheap (sub-second on small datasets) and avoids stale featured strips.
startMarketplaceFeaturedRefresher({ intervalMs: 5 * 60 * 1000 });

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

// ─── Startup sweep: clear orphaned ai_active_streams rows ───
// Rows older than 10 minutes at boot time are from a prior run's crash
// (a healthy request finishes cleanup within minutes via success/catch
// paths in chat.ts). Without this sweep, a SIGKILL/OOM mid-stream leaves
// a row permanently flagged as "streaming", which can trip concurrency
// gates or stale the /chat/status 5-minute reaper on first read.
sql`DELETE FROM ai_active_streams WHERE started_at < now() - interval '10 minutes'`
  .then((result) => {
    if (result.count > 0) {
      console.log(
        `[startup] cleared ${result.count} orphaned ai_active_streams row(s) from prior run`
      );
    }
  })
  .catch((err: unknown) =>
    console.warn("[startup] ai_active_streams sweep failed:", err)
  );

// ─── Startup sweep: mark stale chat_traces as aborted ───
// Traces stuck in "streaming" from a prior crash will never finalize.
sql`UPDATE chat_traces
    SET status = 'aborted', turn_ended_at = now(),
        error_message = 'Interrupted by API restart'
    WHERE status = 'streaming'
      AND turn_started_at < now() - interval '5 minutes'`
  .then((result) => {
    if (result.count > 0) {
      console.log(
        `[startup] marked ${result.count} stale chat_traces as aborted from prior run`
      );
    }
  })
  .catch((err: unknown) =>
    console.warn("[startup] chat_traces sweep failed:", err)
  );

// ─── WebSocket Proxy for Vite HMR ─────────────────────────────
// Proxies WebSocket upgrade requests on /preview/:projectId/...
// to the project's Vite dev server so HMR works through any
// reverse proxy (Cloudflare, nginx, etc.) without special config.
server.on("upgrade", (req, socket, head) => {
  void (async () => {
  const url = req.url ?? "";
  const match = url.match(/^\/preview\/([^/]+)\//);
  if (!match) {
    socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return;
  }

  const projectId = match[1];
  // Match the HTTP preview proxy behavior: if a project is scaffolded, ensure
  // deps/server are available before returning a WS upgrade failure.
  if (!isRunning(projectId) && isProjectScaffolded(projectId)) {
    try {
      await ensureDependencies(projectId);
      await startDevServer(projectId);
    } catch {
      // Fall through; we'll return 502 below if the server isn't ready.
    }
  }

  const devUrl = await getDevServerInternalUrlWhenReady(projectId);
  if (!devUrl) {
    socket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return;
  }

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
  })().catch(() => {
    try {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    } catch {
      // Ignore write errors during shutdown/race conditions.
    }
    socket.destroy();
  });
});

// ─── Graceful Shutdown ──────────────────────────────────────
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Server] ${signal} received, shutting down...`);
  try {
    await Promise.all([
      getConnectorManager().shutdown(),
      getCopilotManager().stopAll(),
      shutdownDocore(),
      stopEmailService(),
    ]);
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });

export default app;
export type AppType = typeof app;
