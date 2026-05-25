// Tracing must initialize BEFORE any other instrumented module so the OTel
// SDK can register its global providers and the kill-switch (TRACING_LEVEL=off)
// can short-circuit with zero overhead.
import { initTracing } from "./tracing/instrumentation.js";
initTracing({ serviceName: "doable-api" });

// Warn if .env is group/world-readable in production (non-fatal).
import { checkEnvFilePerms } from "@doable/shared/security/env-perms-check.js";
checkEnvFilePerms();

// Fail-closed at boot if DOABLE_KEK is missing/malformed. Without this guard
// the API would start fine and only 500 on the first MFA enroll / KEK-decrypt
// path — exactly the R10 evidence from 2026-05-14. Eagerly calling loadKek()
// surfaces "not set", "not valid base64", and "wrong length" at startup
// instead of in user-facing requests. Skipped in test (loadKek auto-generates
// an ephemeral KEK when NODE_ENV=test).
if (process.env.NODE_ENV !== "test") {
  const { loadKek } = await import("./lib/envelope-crypto.js");
  try {
    loadKek();
  } catch (e) {
    console.error(`[api] FATAL: ${(e as Error).message}`);
    console.error(
      "[api] Generate one with: openssl rand -base64 32 → DOABLE_KEK=... in services/api/.env",
    );
    process.exit(1);
  }
}

// Register framework adapters into the process-wide registry BEFORE any
// module that resolves a framework by id is imported (project create, dev
// start, build, AI file tools). Idempotent.
import { initFrameworks } from "./frameworks/init.js";
import { startIdleEvictionSweeper } from "./projects/dev-server.js";
import { startDataPoolSweeper } from "./data-worker/pool.js";
import { DOABLE_APP_DB_ENABLED } from "./data-worker/config.js";
initFrameworks();
// Per-app DB worker pool idle reaper (PRD per-app-db 07). No-op unless enabled.
if (DOABLE_APP_DB_ENABLED) startDataPoolSweeper();
// Idle dev servers eat ~666 MB each (next-server + launcher). Start a
// 5-minute sweeper that kills sessions with no preview-proxy traffic in
// the last DEV_SERVER_IDLE_MS (default 15 min). Safe to call once at boot;
// idempotent and gated by DEV_SERVER_IDLE_MS=0.
startIdleEvictionSweeper();

// Per-app runtime supervisor (Phase 5 — PRD 06 §4.4). Subscribes to
// systemd journal so project_runtime.state reflects real unit health.
// No-op on Windows/macOS dev hosts.
import { startSupervisor, startHealthCheckLoop, startIdleDetection } from "./runtime/supervisor.js";
const _supervisor = startSupervisor();
const _healthLoop = startHealthCheckLoop();
const _idleDetector = startIdleDetection();

import { serve } from "@hono/node-server";
import { initDocore, shutdownDocore } from "./ai/docore-bridge.js";
import { initEmailService, stopEmailService } from "./lib/email/index.js";
import { backfillBuiltinConnectors } from "./mcp/builtin-connectors.js";
import { seedAiProviderFromEnv } from "./lib/seedAiProviderFromEnv.js";
import { startMarketplaceFeaturedRefresher } from "./jobs/marketplace-featured-refresher.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { sql } from "./db/index.js";
import { handleWebSocketUpgrade } from "./routes/preview-proxy/ws-proxy.js";
import { rateLimiter, getTrustedClientIp } from "./middleware/rate-limit.js";
import { getConnectorManager } from "./mcp/connector-manager.js";
import { getCopilotManager } from "./ai/providers/copilot-manager.js";
import { getOAuthRedirectUri } from "./integrations/oauth2.js";
import { mountRoutes } from "./routes.js";
import { tracingMiddleware } from "./tracing/middleware.js";
import { startTracingRetention } from "./tracing/retention.js";
import { startThumbnailBackfillSweeper } from "./ai/thumbnail.js";
import { sandboxBootProbe } from "./sandbox/boot-probe.js";

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

// BUG-R10-TRAILING-SLASH-AUTH-DROP-001: register the app with `strict: false`
// so Hono matches BOTH `/foo` and `/foo/` against the same handler. Removes
// the need for the 308-redirect normalization middleware that previously
// caused some clients (curl without --location-trusted, older undici, some
// SDKs) to drop the Authorization header on the followed request and 401.
// See tracer evidence in testcases/evidence/dev/r12-trailing-slash-trace.md.
const app = new Hono({ strict: false });

async function ensureProjectFilesTableExists(): Promise<void> {
  // Probe first so we don't issue CREATE under the runtime role
  // (doable_app — see deployment/docker/02-roles.sh) which would 42501.
  // The table itself is owned by the migrate role via migration 075.
  const probe = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_files'
    ) AS exists
  `;
  if (probe[0]?.exists) return;

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
}

// Pre-create middleware instances (avoid re-instantiating on every request)
const secureHeadersMw = secureHeaders();
// Rate limit is env-configurable so operators can tune for their workload
// without redeploying source. **Defaults to OFF (max=0)** because Doable
// production runs behind Cloudflare Tunnel which already provides DDoS /
// bot protection upstream — the in-process limiter mostly punishes bursty
// legit users (OAuth flows, dashboard polls) without adding much defence.
// To turn it back on for hosts not behind a CDN: set RATE_LIMIT_MAX=200
// (or any positive integer) in .env.
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "0", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10);
const apiRateLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  // BUG-CORPUS-SEC-001: never trust client-supplied XFF for IP keying.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyGenerator: (c: any) => {
    // Use Authorization token (per-user) or fall back to trusted IP
    const auth = c.req.header("authorization");
    if (auth) return `auth:${auth.slice(-16)}`;
    return getTrustedClientIp(c);
  },
});

// ─── Global Middleware ──────────────────────────────────────
// Tracing first — establishes request_id + trace context that every other
// middleware and route handler will inherit via AsyncLocalStorage. When
// TRACING_LEVEL=off, the inner `getTracer()` returns the API-level no-op
// tracer so this is effectively free.
app.use("*", tracingMiddleware);

// Custom logger that suppresses high-frequency polling endpoints
const QUIET_PATHS = ["/admin/copilot-sessions", "/analytics/track"];
app.use("*", async (c, next) => {
  if (QUIET_PATHS.some((p) => c.req.path === p)) return next();
  return logger()(c, next);
});
app.use("*", timing());

// BUG-ADMIN-010: admin API responses must not be cached by browsers or
// shared proxies, and the admin panel HTML must never render inside an
// iframe. Registered BEFORE secureHeaders so its post-next code runs
// LAST on the response — secureHeaders sets X-Frame-Options: SAMEORIGIN
// on the way out, so this override needs to be the final writer.
app.use("*", async (c, next) => {
  await next();
  if (c.req.path === "/admin" || c.req.path.startsWith("/admin/")) {
    c.res.headers.set("Cache-Control", "no-store, private");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("Referrer-Policy", "same-origin");
    c.res.headers.set("Pragma", "no-cache");
  }
});

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

// Resolve whether a request's Origin is in the allowlist for CORS purposes.
// Shared by the cors() origin callback and the post-CORS strip so
// the two stay in lockstep — a future change to the allowlist logic
// can never re-introduce the BUG-012 mismatch where ACAC was emitted
// for origins that did NOT receive an ACAO header.
function resolveAllowedCorsOrigin(c: { req: { path: string; header(name: string): string | undefined } }, origin: string): string | null {
  if (c.req.path.startsWith("/preview/")) return "";
  if (c.req.path.startsWith("/__doable/connector-proxy")) {
    return origin || "*";
  }

  const allowed = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) return origin;

  if (allowed.length === 0 && process.env.NODE_ENV !== "production") {
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  }

  return null;
}

// BUG-012: hono/cors emits `Access-Control-Allow-Credentials: true`
// unconditionally when `credentials: true` is set — even when the origin
// callback returns null and ACAO is absent. Prior attempts to strip ACAC
// in a post-cors finaliser failed because hono/cors's synthesized OPTIONS
// preflight Response uses an immutable Headers init that resists both
// `headers.delete()` and `c.res = new Response(...)` rebuilds.
//
// The reliable fix is to short-circuit disallowed-origin OPTIONS preflight
// BEFORE cors() runs at all. We return our own 204 with no CORS headers,
// so cors() never gets a chance to emit ACAC for that request. Real
// (non-OPTIONS) cross-origin requests still flow through cors() — if the
// origin is disallowed, cors() omits ACAO and the browser blocks the
// response anyway (ACAC alone is harmless without ACAO).
app.use("*", async (c, next) => {
  if (c.req.method !== "OPTIONS") return next();
  const origin = c.req.header("origin") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolved = resolveAllowedCorsOrigin(c as any, origin);
  if (resolved === null) {
    return c.body(null, 204);
  }
  return next();
});

app.use(
  "*",
  cors({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    origin: (origin, c) => resolveAllowedCorsOrigin(c as any, origin),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // hono/cors synthesizes the OPTIONS preflight response itself and short-
    // circuits before any route-level OPTIONS handler runs, so this global
    // allow-list — NOT the per-router options() handlers — is what the browser
    // sees for cross-origin preflights. The per-app-DB data plane requires
    // `x-doable-data-api` on EVERY call (and the settings-UI Database tab adds
    // `x-doable-surface`); the AI proxy + data plane forward `x-doable-app-user`.
    // Omitting them here made cross-origin (dev.doable.me → dev-api.doable.me)
    // data calls fail the preflight → browser "Failed to fetch" on the Database
    // tab. Same-origin preview-iframe calls were unaffected (no preflight).
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-doable-project-id",
      "x-doable-data-api",
      "x-doable-app-user",
      "x-doable-surface",
    ],
    maxAge: 86400,
  })
);

// BUG-R10-TRAILING-SLASH-AUTH-DROP-001: the previous 308-redirect approach
// to trailing-slash normalization caused some clients (curl without
// --location-trusted, older undici, some SDKs) to drop the Authorization
// header on the followed request — yielding a 401 even with a valid JWT.
// The fix is structural: the top-level `app` is now `new Hono({ strict: false })`
// and every sub-router that matters has `strict: false` too, so `/foo` and
// `/foo/` route to the same handler with no redirect round-trip. No 308 is
// emitted, no client header policy comes into play, and all clients work.
//
// `/preview/:projectId/` and `/thumbnails/` keep their trailing-slash
// semantics through their own sub-routers (Vite dev server is served at the
// trailing-slash path; preview-proxy does its own URL rewriting).

// Rate limiter for all routes EXCEPT:
//   - /preview/* : a single Vite page load triggers many subrequests
//     (HTML + JS chunks + CSS + assets) which would quickly exhaust 200/min
//   - /thumbnails/* : dashboard polls these continuously
//   - /analytics/* : telemetry beacons fire on every navigation
//   - /admin/*    : platform-admin views auto-refresh every 5s
//   - /health     : liveness/readiness probes from Docker/K8s/monitoring
//                   should never rate-limit (Wave 31-D fix)
//   - /visual-edit-bridge.js : cached but loaded inside every iframe
//   - /auth/*     : OAuth flows (Google/GitHub) issue many subrequests
//                   per login (initiate → provider redirect → callback →
//                   token exchange → user info → frontend bounces). The
//                   keyGenerator falls back to client IP for unauthed
//                   requests, so a single user retrying login from one
//                   tab can blow 200/min. Auth has its own per-flow
//                   nonce/state checks; rate-limit at upstream (Cloudflare)
//                   if you need brute-force protection there.
app.use("*", async (c, next) => {
  const p = c.req.path;
  if (
    p === "/health" ||
    p === "/visual-edit-bridge.js" ||
    p.startsWith("/preview/") ||
    p.startsWith("/thumbnails/") ||
    p.startsWith("/analytics/") ||
    p.startsWith("/admin/") ||
    p.startsWith("/auth/") ||
    p === "/auth"
  ) {
    await next();
    return;
  }
  // Localhost bypass — explicit loopback IPs only. Direct localhost dev
  // connections never set XFF/XRI, so we also bypass when neither header
  // is present AND we're not in production. Production must always come
  // through a known proxy that sets XFF, so missing XFF in prod is a
  // misconfiguration rather than a localhost connection — fail closed.
  const xff = c.req.header("x-forwarded-for") ?? "";
  const xri = c.req.header("x-real-ip") ?? "";
  const firstHop = xff.split(",")[0]?.trim() ?? "";
  const isLoopback =
    firstHop === "127.0.0.1" || firstHop === "::1" || firstHop === "localhost" ||
    xri === "127.0.0.1" || xri === "::1";
  const isUnannotatedDev =
    process.env.NODE_ENV !== "production" && firstHop === "" && xri === "";
  if (isLoopback || isUnannotatedDev) {
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

// ─── Sandbox boot probe (PRD ch 10 — observability) ────────
// Logs the resolved sandbox matrix and fail-closes in prod/staging
// when no isolating backend is available. In dev/off the throw is
// caught so local devs without bubblewrap/psroot can still boot.
const _hardening = (process.env.DOABLE_HARDENING_LEVEL ?? "dev").trim().toLowerCase();
if (_hardening === "prod" || _hardening === "staging") {
  await sandboxBootProbe();
} else {
  try {
    await sandboxBootProbe();
  } catch (err) {
    console.warn(
      `[sandbox] WARNING: boot probe threw in dev/off mode: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

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
  // Sanitize 5xx envelopes: never echo Postgres constraint names, query
  // fragments, or stack frames to API clients. The raw error is logged
  // above for operators. In development we still surface a generic
  // hint (the JS error class name) to help local debugging without
  // leaking schema details like `users_email_key`.
  const errAny = err as { code?: unknown } | null;
  const isPgError =
    typeof errAny?.code === "string" && /^[0-9A-Z]{5}$/.test(errAny.code);
  const devHint =
    process.env.NODE_ENV === "development" && !isPgError
      ? err.constructor?.name ?? "Error"
      : undefined;
  return c.json(
    {
      error: "Internal Server Error",
      message: devHint,
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

// Refresh framework cache from platform_config (admin-configurable).
// Falls back to DOABLE_ENABLED_FRAMEWORKS env var if table doesn't exist yet.
import { refreshFrameworkCache } from "./routes/admin-frameworks.js";
await refreshFrameworkCache();

// Initialize email service (provider + queue worker)
await initEmailService(sql).catch((err) => {
  console.error("[Email] init failed:", err);
});

// Provision built-in MCP Apps for any workspace that doesn't have them yet.
// Runs once per startup; per-workspace state is tracked in
// workspace_builtin_provisioned so user deletions are respected.
void backfillBuiltinConnectors();

// Bootstrap the setup wizard from env vars when the admin exported a key
// before starting the API (e.g. MINIMAX_API_KEY=... docker compose up). Never
// overwrites an existing platform_config.setup.ai_provider_key.
void seedAiProviderFromEnv();

// Refresh the featured-listings/discover materialised views every 5 min.
// Cheap (sub-second on small datasets) and avoids stale featured strips.
startMarketplaceFeaturedRefresher({ intervalMs: 5 * 60 * 1000 });

// Daily retention sweep for spans/trace_logs/traces. No-op when no
// data exists yet (e.g. before migration 053 applied).
startTracingRetention();

// Backfill thumbnails for projects whose initial capture missed (e.g.
// Chrome libs not yet installed on the box, or a transient launch
// failure). Sweeps every 10 minutes; per-project debounce in
// scheduleThumbnailCapture prevents duplicate work.
startThumbnailBackfillSweeper();

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

// ─── WebSocket Proxy for Preview HMR ──────────────────────────
// Proxies WebSocket upgrade requests on /preview/:projectId/...
// to the project's dev server so HMR works through any reverse
// proxy (Cloudflare, nginx, etc.) without special config.
// Covers Vite (/__vite_hmr), Next.js (/_next/webpack-hmr), and
// any other framework whose HMR rides a WebSocket upgrade —
// per devframeworkPRD/STATUS-2026-05-02.md gap #1.
server.on("upgrade", (req, socket, head) => {
  if ((req.url ?? "").startsWith("/preview/")) {
    handleWebSocketUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Server] ${signal} received, shutting down...`);
  try {
    const { shutdownDataPool } = await import("./data-worker/pool.js");
    await Promise.all([
      getConnectorManager().shutdown(),
      getCopilotManager().stopAll(),
      shutdownDocore(),
      stopEmailService(),
      shutdownDataPool(),
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
