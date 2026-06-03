import { Hono } from "hono";
import {
  getDevServerInternalUrl,
  getDevServerInternalUrlWhenReady,
  getInstallingPeerDep,
  clearRestartingOverlay,
  startDevServer,
  isRunning,
  touchActivity,
} from "../../projects/dev-server.js";
import { isProjectScaffolded, ensureDependencies } from "../../projects/file-manager.js";
import { VISUAL_EDIT_BRIDGE_INLINE } from "../../visual-edit-bridge-inline.js";
import { getTrackingScript } from "../../analytics/tracker.js";
import type postgres from "postgres";
import { sql, txAls } from "../../db/index.js";
import { defaultRegistry } from "../../frameworks/registry.js";
import type { FrameworkAdapter } from "../../frameworks/types.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../lib/secrets.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import { requireProjectAccess } from "../projects/helpers.js";
import {
  RETRY_HTML,
  getStorageNamespaceSnippet,
  ERROR_CAPTURE_SNIPPET,
  CONNECTOR_BRIDGE_SNIPPET,
} from "./injected-scripts.js";

const publicApiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.CORS_ORIGINS?.split(",")[0]?.replace(/\/$/, "") ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

export const previewRoutes = new Hono({ strict: false });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hop-by-hop headers that MUST be stripped before forwarding the request via
 * `fetch()` (RFC 7230 §6.1). nginx's `/preview/` location adds `Connection:
 * upgrade` + `Upgrade: <hop>` unconditionally to enable the HMR WS handshake;
 * undici (node's fetch) refuses those with `UND_ERR_INVALID_ARG` and the
 * iframe sees a "Preview proxy error: fetch failed" 502. The
 * same set is filtered off the *response* further down — we just need to
 * filter the *request* too.
 */
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Per-project adapter cache so the proxy hot path doesn't SQL on every hit.
// Cached for the process lifetime; stale entries clear when a project's
// framework_id changes (rare; documented in PRD 02 §6.5 convert-framework).
const adapterCache = new Map<string, FrameworkAdapter>();

/**
 * One injection task: looks for a marker in the streamed body and inserts
 * `snippet` either before or after the matched marker. `patterns` is a
 * priority-ordered list of alternatives — the first matching pattern wins
 * (so callers can express fallbacks like "before </head> OR before <body>").
 */
type InjectionTask = {
  patterns: { regex: RegExp; insertBefore: boolean }[];
  snippet: string;
};

/**
 * Build a TransformStream that performs in-stream HTML injection without
 * buffering the entire response body. For each task in order:
 *
 *   - Buffer chunks until ANY of the task's patterns matches, OR the
 *     buffer exceeds 64KiB, OR the upstream stream ends.
 *   - On match: emit (text-before-marker) + snippet, leave the rest in
 *     the buffer, advance to the next task (the next task may match
 *     against the same remaining buffer immediately).
 *   - On overflow / EOF without match: best-effort fallback — emit the
 *     buffered text followed by the snippet (so the snippet is never
 *     silently dropped) and advance.
 *
 * Once all tasks complete, subsequent chunks pass through as raw bytes,
 * preserving streaming SSR semantics.
 */
function makeInjectionStream(
  tasks: InjectionTask[],
): TransformStream<Uint8Array, Uint8Array> {
  let taskIdx = 0;
  let buffered = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const MAX_BUFFER = 64 * 1024;

  function tryInject(
    controller: TransformStreamDefaultController<Uint8Array>,
    atEof: boolean,
  ): void {
    while (taskIdx < tasks.length) {
      const task = tasks[taskIdx];
      if (!task) break;
      let matched: { idx: number; len: number; insertBefore: boolean } | null = null;
      for (const { regex, insertBefore } of task.patterns) {
        const m = buffered.match(regex);
        if (m && typeof m.index === "number") {
          matched = { idx: m.index, len: m[0].length, insertBefore };
          break;
        }
      }
      if (matched) {
        const insertAt = matched.insertBefore ? matched.idx : matched.idx + matched.len;
        const before = buffered.slice(0, insertAt);
        const after = buffered.slice(insertAt);
        controller.enqueue(encoder.encode(before + task.snippet));
        buffered = after;
        taskIdx++;
        continue;
      }
      if (atEof || buffered.length >= MAX_BUFFER) {
        // No marker found — append snippet at the end of what we have so
        // far so it ships rather than being dropped silently.
        controller.enqueue(encoder.encode(buffered + task.snippet));
        buffered = "";
        taskIdx++;
        continue;
      }
      return;
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (taskIdx >= tasks.length) {
        controller.enqueue(chunk);
        return;
      }
      buffered += decoder.decode(chunk, { stream: true });
      tryInject(controller, false);
      if (taskIdx >= tasks.length && buffered.length > 0) {
        controller.enqueue(encoder.encode(buffered));
        buffered = "";
      }
    },
    flush(controller) {
      buffered += decoder.decode();
      tryInject(controller, true);
      if (buffered.length > 0) {
        controller.enqueue(encoder.encode(buffered));
        buffered = "";
      }
    },
  });
}

async function getAdapterForProject(projectId: string): Promise<FrameworkAdapter> {
  const cached = adapterCache.get(projectId);
  if (cached) return cached;
  const rows = await sql<{ framework_id: string }[]>`
    SELECT framework_id FROM projects WHERE id = ${projectId}
  `;
  const frameworkId = rows[0]?.framework_id ?? "vite-react";
  const adapter = defaultRegistry.getAdapter(frameworkId);
  adapterCache.set(projectId, adapter);
  return adapter;
}

/**
 * Token endpoint for standalone preview mode.
 * When the preview is opened directly (not in the editor iframe), the SDK
 * cannot receive a token via postMessage. This endpoint issues a short-lived
 * connector-proxy JWT scoped to the project so MCP calls work standalone.
 * Rate-limited to 10 req/min per project via simple in-memory counter.
 */
const tokenBuckets = new Map<string, { count: number; resetAt: number }>();
previewRoutes.post("/preview/:projectId/__doable/token", async (c) => {
  const projectId = c.req.param("projectId");
  if (!UUID_RE.test(projectId)) {
    return c.json({ error: "Invalid project ID" }, 400);
  }

  // Simple rate limit: 10 tokens/min per project
  const now = Date.now();
  let bucket = tokenBuckets.get(projectId);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    tokenBuckets.set(projectId, bucket);
  }
  if (bucket.count >= 10) {
    return c.json({ error: "Rate limited" }, 429);
  }
  bucket.count++;

  // Look up the project's workspace.
  const [row] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (!row) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Per-app-DB identity (chatbot-infra): stamp the REQUESTER's userId into the
  // connector-proxy JWT so the per-app-DB connection sets `app.user_id =
  // <viewer uuid>`. That makes the self-stamping `created_by` DEFAULT resolve
  // to the viewer and the owner-RLS WITH CHECK pass on INSERT.
  //
  // Identity is established ONLY by proving a real Doable session AND that the
  // session user has access to THIS project (requireProjectAccess). We NEVER
  // default to the workspace owner for an unauthenticated caller: the
  // standalone preview URL (/preview/<uuid>) serves to any URL-holder, so
  // binding their token to the owner would let a leaked restricted-project URL
  // read/write that app's data AS the owner. Fail closed instead — see below.
  //
  // Two equally-trusted sources for the requester's platform access token, in
  // order. Both are validated with verifyAccessToken (HS256, JWT_SECRET):
  //   1. Authorization: Bearer <access-token> — the editor iframe path forwards
  //      this via window.__DOABLE_ACCESS_TOKEN; also any caller that can attach
  //      the header explicitly.
  //   2. The `doable_access_token` cookie — fetchTokenDirect() POSTs this
  //      endpoint with credentials:"include" SAME-ORIGIN to the preview host,
  //      so a logged-in owner's session cookie rides along (web mirrors the
  //      cookie to the registrable parent domain, e.g. .doable.me, so it
  //      reaches dev-api.doable.me; single-host installs share the host so the
  //      host-only cookie already arrives). This is what lets the OWNER's own
  //      standalone preview persist while NOT exposing data to anonymous
  //      URL-holders.
  let viewerUserId: string | undefined;
  let sessionToken: string | undefined;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    sessionToken = authHeader.slice(7).trim();
  }
  if (!sessionToken) {
    const cookieHeader = c.req.header("Cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)doable_access_token=([^;]+)/);
    if (m?.[1]) {
      try { sessionToken = decodeURIComponent(m[1]); } catch { sessionToken = m[1]; }
    }
  }
  if (sessionToken) {
    try {
      const payload = await verifyAccessToken(sessionToken);
      const candidate = payload.sub;
      if (candidate && UUID_RE.test(candidate)) {
        // `projects` and `workspace_members` are FORCE-RLS in the main DB and
        // the API connects as a non-superuser role, so requireProjectAccess()
        // returns nothing unless it runs inside an RLS context for the user
        // being checked. This router is NOT mounted behind authMiddlewareWithRls
        // (auth is optional here), so we set the RLS GUC ourselves — scoped to
        // the *validated* candidate, never the body — exactly as that middleware
        // does (SET LOCAL "doable.current_user_id" + txAls so the global `sql`
        // proxy dispatches into this tx). A caller can only ever assert their
        // own verified identity, so this cannot be used to probe another user's
        // access.
        const escaped = candidate.replace(/'/g, "''");
        const access = await sql.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL "doable.current_user_id" = '${escaped}'`);
          return txAls.run(tx as unknown as postgres.Sql, () =>
            requireProjectAccess(candidate, projectId),
          );
        });
        if (access) viewerUserId = candidate;
      }
    } catch {
      // Invalid/expired platform token — fall through to a fail-closed mint.
    }
  }

  // Fail-closed posture for NON-public projects: if we could not authenticate
  // the requester as someone with access to this project, mint a token with NO
  // userId. The app shell still loads (the SDK gets a token), but every
  // /__doable/data/* call runs with app.user_id='' so owner-RLS INSERTs are
  // rejected (RLS_VIOLATION → 403) and owner-scoped SELECTs return zero rows —
  // no data is exposed to an anonymous URL-holder. PUBLIC projects keep the
  // anonymous mint unchanged so public apps work for everyone (their RLS, if
  // any, is the app author's responsibility, not gated on platform identity).
  // This is GENERAL (any project/table) and PERMANENT (platform source; works
  // on docker, bare metal, and the CLI alike).

  const token = await signProjectJwt(
    {
      projectId,
      workspaceId: row.workspace_id,
      ...(viewerUserId ? { userId: viewerUserId } : {}),
      kind: "connector-proxy",
    },
    PROJECT_JWT_SECRET,
  );

  return c.json({ token, expiresIn: 15 * 60 });
});

/**
 * Proxy ALL requests under /preview/:projectId/* to the Vite dev server.
 *
 * Lazy wake-up (BUG-PREVIEW-EVICTION-001): if the dev-server has been
 * evicted from the registry (memory pressure / idle sweep) but the project
 * files still exist on disk, this route auto-respawns the dev server and
 * waits up to WAKE_TIMEOUT_MS for readiness. If the wake takes longer than
 * the cap, we return a structured 503 (`dev_server_starting`) so the
 * frontend can render a meaningful retry state instead of a stuck spinner.
 */
const WAKE_TIMEOUT_MS = 30_000;

/**
 * Standalone HTML page rendered while `npm install <pkg>` is in flight so the
 * iframe shows progress instead of blank-white for 10–30s. Auto-refreshes
 * every 3s via meta-refresh — when the install finishes, the next refresh
 * falls through to real Vite. The styling mirrors the "Making improvements…"
 * ErrorBoundary card in apps/web (purple-gradient button vibe) for visual
 * consistency with the editor surface.
 */
function renderInstallingDepHTML(pkg: string): string {
  // Defense-in-depth: HTML-encode pkg even though NPM_PKG_NAME_RE already
  // restricts it to a safe alnum/-/_/./@/ subset. Keeps the overlay
  // injection-safe if the validator ever loosens.
  const safePkg = pkg.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
  // "Restarting preview…" is the sticky placeholder set by dev-server-start
  // between an npm-install success and the next vite-ready. It's not a real
  // package name, so render a different copy that owns that state.
  const isRestart = pkg === "Restarting preview…";
  const headerCopy = isRestart ? "Restarting preview" : "Installing dependency";
  const lineHtml = isRestart
    ? `<code>dev server</code>`
    : `<code>npm install ${safePkg}</code>`;
  const titleCopy = isRestart ? "Restarting preview…" : `Installing ${safePkg}…`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>${titleCopy}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
    color: #1f2937;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 32px 40px;
    box-shadow: 0 10px 30px rgba(124, 58, 237, 0.15);
    max-width: 420px;
    text-align: center;
  }
  .spinner {
    width: 48px;
    height: 48px;
    margin: 0 auto 20px;
    border: 4px solid #ede9fe;
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #4c1d95; }
  code {
    display: inline-block;
    margin-top: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    background: #f5f3ff;
    color: #5b21b6;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
  }
  p { margin: 12px 0 0; color: #6b7280; font-size: 13px; }
</style>
</head>
<body>
<div class="card">
  <div class="spinner" aria-hidden="true"></div>
  <h1>${headerCopy}</h1>
  ${lineHtml}
  <p>This page will refresh automatically.</p>
</div>
</body>
</html>`;
}

previewRoutes.all("/preview/:projectId/*", async (c) => {
  const projectId = c.req.param("projectId");

  // Validate UUID to prevent enumeration/probing (Bug-108)
  if (!UUID_RE.test(projectId)) {
    return c.text("Not found", 404);
  }

  // While `npm install <pkg>` is auto-running for this project (triggered by
  // a previous vite stderr line), serve an overlay page instead of blank
  // white for the iframe's top-level HTML request. Only short-circuit the
  // document path — Vite asset paths (/.vite/deps, /src/*, /node_modules/*,
  // /@vite/, /@fs/, /@id/, /@react-refresh) must still proxy upstream so the
  // current vite (which is mid-restart but still running) doesn't hang the
  // iframe on its own asset 504s. The meta-refresh in the overlay re-fetches
  // every 3s, so as soon as the install finishes and Vite reboots with the
  // dep available, the next refresh falls through to the real preview.
  const isRootHtmlReq =
    c.req.method === "GET" &&
    /^\/preview\/[0-9a-f-]{36}\/?$/i.test(new URL(c.req.url).pathname);
  if (isRootHtmlReq) {
    const installing = getInstallingPeerDep(projectId);
    if (installing) {
      // When the overlay is the "Restarting preview…" placeholder set by
      // dev-server-start after an auto-install completes, vite has been
      // SIGTERM'd and won't respawn until someone calls startDevServer.
      // The short-circuit below skips the normal startDevServer path, so
      // we kick it here as fire-and-forget. Once vite is ready, the next
      // overlay meta-refresh falls through to the real preview (markReady
      // clears installingPeerDep). If vite hits ANOTHER missing dep, the
      // new auto-install overwrites the placeholder with a real pkg label.
      if (installing.pkg === "Restarting preview…") {
        if (isRunning(projectId)) {
          // The dev server is already up. The placeholder is STALE: it got
          // (re-)set after an instance had already signaled ready (e.g. a
          // late reactive-install exit handler racing the install_package
          // tool's own restartDevServer), so no further markReady() will
          // ever fire to clear it — and without this branch the proxy would
          // serve "Restarting preview…" forever even though vite serves 200.
          // This was the root cause of @doable/ai (and any auto-installed
          // dep) apps getting stuck on the placeholder. Drop the stale
          // overlay and fall through to the normal proxy path below.
          clearRestartingOverlay(projectId);
        } else {
          // Vite was SIGTERM'd and not yet respawned — kick a fresh start.
          void startDevServer(projectId).catch(() => {
            // ignored — markFailed clears the overlay on real failure
          });
          return c.html(renderInstallingDepHTML(installing.pkg), 200, {
            "Cache-Control": "no-store",
          });
        }
      } else {
        // A genuine `npm install <pkg>` is in flight — show its overlay.
        return c.html(renderInstallingDepHTML(installing.pkg), 200, {
          "Cache-Control": "no-store",
        });
      }
    }
  }

  const alreadyRunning = isRunning(projectId);

  // Truly stale projectId? No registry entry AND no files on disk → 404.
  // (Distinguishes "evicted from memory but disk-resident" — which we can
  // wake — from "deleted / never existed" — which is a hard 404.)
  if (!alreadyRunning && !isProjectScaffolded(projectId)) {
    return c.text("Not found", 404);
  }

  // Ensure the dev server is running (auto-start if scaffolded but not in
  // registry — i.e. evicted/hibernated). Cap the spawn+ready wait at
  // WAKE_TIMEOUT_MS so the proxy never hangs the request indefinitely.
  if (!alreadyRunning) {
    try {
      await ensureDependencies(projectId);
      // Fire-and-forget: startDevServer registers an inflight promise that
      // getDevServerInternalUrlWhenReady will await below. Catching here
      // prevents an unhandledRejection if startup fails synchronously.
      startDevServer(projectId).catch((err) => {
        console.warn(
          `[preview-proxy] startDevServer failed for ${projectId}:`,
          err instanceof Error ? err.message : err,
        );
      });
    } catch (err) {
      console.warn(
        `[preview-proxy] ensureDependencies failed for ${projectId}:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through — readiness wait below will time out and emit 503.
    }
  }

  // Race readiness against the wake-up budget. On timeout we emit a
  // structured 503 so the editor can show a "waking up…" CTA instead of
  // hanging the iframe on the stock retry HTML forever.
  const readyOrTimeout = await Promise.race([
    getDevServerInternalUrlWhenReady(projectId),
    new Promise<"__timeout__">((resolve) =>
      setTimeout(() => resolve("__timeout__"), WAKE_TIMEOUT_MS).unref?.(),
    ),
  ]);

  if (readyOrTimeout === "__timeout__" || !readyOrTimeout) {
    // Structured 503: project files exist but dev-server hasn't bound its
    // port within WAKE_TIMEOUT_MS. Frontend should poll again after 5s.
    // Suppress the iframe's auto-rendered JSON page by negotiating
    // content-type — top-level HTML requests get the friendly RETRY_HTML
    // page (which auto-reloads), API/JSON callers get the structured body.
    const accept = c.req.header("accept") ?? "";
    const wantsJson =
      accept.includes("application/json") || !accept.includes("text/html");
    if (wantsJson) {
      return c.json(
        {
          error: "dev_server_starting",
          projectId,
          etaSeconds: Math.round(WAKE_TIMEOUT_MS / 1000),
        },
        503,
        {
          "Retry-After": "5",
          "Cache-Control": "no-store",
        },
      );
    }
    return c.html(RETRY_HTML, 503, {
      "Retry-After": "5",
      "Cache-Control": "no-store",
    });
  }

  const devUrl = readyOrTimeout;

  // Mark this dev server as recently active so the idle-eviction sweeper
  // (dev-server-core.ts) doesn't kill it. Cheap (Date.now write) and runs
  // on every proxied subrequest — HTML, JS chunks, CSS, HMR pings — so any
  // user with the iframe in view keeps the session warm.
  touchActivity(projectId);

  // Hono's `strict: false` (line 29) normalizes `c.req.path` by stripping
  // trailing slashes, but Vite's `--base /preview/<id>/` middleware uses
  // `path.startsWith(base)` and rejects the slash-stripped form with its
  // stock "did you mean to visit" 404 — which the iframe then renders as
  // a blank white pane with a single hyperlink. Read the pathname off the
  // raw URL so the slash survives the proxy hop intact.
  const originalPath = new URL(c.req.url).pathname;
  const targetUrl = `${devUrl}${originalPath}`;

  // Preserve query string
  const qsIndex = c.req.url.indexOf("?");
  const queryString = qsIndex !== -1 ? c.req.url.slice(qsIndex + 1) : "";
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  try {
    // Build headers — copy everything except Host and hop-by-hop headers.
    //
    // nginx's `/preview/` location block adds
    // `Connection: upgrade` and `Upgrade: $http_upgrade` unconditionally so
    // that the HMR WebSocket handshake can pass through. For *non*-WS GETs
    // (which is everything routed through this Hono handler — true upgrades
    // are caught earlier by ws-proxy.ts) those headers are still attached to
    // the inbound request. Forwarding them via undici's `fetch()` triggers
    // `UND_ERR_INVALID_ARG: invalid connection header` (and similarly for
    // upgrade / transfer-encoding), which surfaces to the iframe as a
    // generic "Preview proxy error: fetch failed" 502. Strip the full
    // hop-by-hop set per RFC 7230 §6.1 — the same set we already filter
    // off the *response* (see `hopByHop` below). Belongs at request build
    // time, not response time.
    const headers = new Headers();
    for (const [key, value] of Object.entries(c.req.header())) {
      const k = key.toLowerCase();
      if (k === "host" || HOP_BY_HOP_REQUEST_HEADERS.has(k) || !value) {
        continue;
      }
      headers.set(key, value);
    }

    // Vite returns 504 while its dep-optimizer is still rewriting a module.
    // For top-level navigations the framework adapter's shouldReloadOnError
    // branch (below) converts that into a window.location.reload() script —
    // which works fine when the resource is consumed via a <script> tag.
    // But for *named* ES-module imports (`import { clsx } from "clsx"`),
    // the engine checks export bindings BEFORE executing the body, so the
    // reload script throws "does not provide an export named 'clsx'" and
    // the importing module dies silently. The cleanest universal fix is to
    // retry on 504 server-side a few times — vite's optimizer typically
    // settles in <500ms — and only fall back to the reload script if it
    // really can't satisfy us.
    const isJsDep =
      c.req.method === "GET" &&
      (/\.(m?js|c?js|tsx?|jsx)(\?|$)/.test(originalPath) ||
        originalPath.includes("/@vite/") ||
        originalPath.includes("/@react-refresh") ||
        originalPath.includes("/@id/") ||
        originalPath.includes("/@fs/") ||
        originalPath.includes("/node_modules/"));
    const maxRetries = isJsDep ? 8 : 0;
    const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
    let resp = await fetch(fullUrl, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      // Node 18+/undici requires duplex:"half" when streaming a body via
      // ReadableStream, otherwise it throws "RequestInit: duplex option is
      // required when sending a body" and the proxy returns 502 — which breaks
      // every POST through the preview catchall (db.auth.signup, db.auth.login,
      // db.data.query, etc.).
      ...(hasBody ? { duplex: "half" as const } : {}),
    } as RequestInit & { duplex?: "half" });
    for (let attempt = 0; attempt < maxRetries && resp.status === 504; attempt++) {
      await new Promise((r) => setTimeout(r, 250));
      resp = await fetch(fullUrl, { method: c.req.method, headers });
    }

    // Build response headers — skip hop-by-hop headers
    const hopByHop = new Set([
      "transfer-encoding",
      "connection",
      "keep-alive",
      "upgrade",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
    ]);

    const responseHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Allow cross-origin for iframe embedding
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    // Prevent browser caching of dev server responses
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
    responseHeaders.delete("etag");
    responseHeaders.delete("last-modified");

    // fetch() auto-decompresses gzip/br/deflate responses, so the body we
    // receive is already uncompressed. Strip content-encoding so the browser
    // doesn't try to decompress again (ERR_CONTENT_DECODING_FAILED).
    responseHeaders.delete("content-encoding");
    // content-length is now stale since the body is decompressed.
    responseHeaders.delete("content-length");

    // CSP: restrict preview content from reaching back to the app's API or
    // navigating the top frame. connect-src is permissive (user code may
    // fetch external APIs), but frame-ancestors prevents re-framing attacks.
    responseHeaders.set(
      "Content-Security-Policy",
      [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://esm.sh",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
        "img-src * data: blob:",
        "connect-src *",
        "media-src * data: blob:",
        // CSP wildcards don't match the parent domain (`*.doable.me` won't
        // allow `doable.me` itself), so when the editor is hosted on the
        // apex (NEXT_PUBLIC_APP_URL=https://doable.me) the iframe was being
        // blocked. List the apex explicitly + the wildcard for subdomains.
        // The apex domain is read from DOABLE_DOMAIN so this stays correct
        // for any environment (doable.me, staging.doable.me, etc).
        `frame-ancestors 'self' https://${process.env.DOABLE_DOMAIN ?? "doable.me"} https://*.${process.env.DOABLE_DOMAIN ?? "doable.me"} http://localhost:* http://127.0.0.1:*`,
        "object-src 'none'",
      ].join("; "),
    );

    // Vite sometimes returns `Content-Type: text/html` for JS modules under
    // /@vite/, /@react-refresh, or paths with explicit script extensions
    // (observed against vite 5.4 — root cause is vite's own mime-detection,
    // not the proxy). Browsers refuse to execute those as modules, so the
    // iframe ends up blank. Override content-type for these paths BEFORE the
    // HTML injection branch so they pass through as plain JS instead of
    // being treated as documents.
    //
    // IMPORTANT: only do this for *successful* responses. Vite returns 504
    // for deps that are still being re-optimized; the framework adapter's
    // shouldReloadOnError branch (below) converts those into a reload
    // script. If we short-circuited 504s here, the iframe would receive an
    // empty 200 body and the app would silently fail to mount.
    const looksLikeJsPath =
      /\.(m?js|c?js|tsx?|jsx)(\?|$)/.test(originalPath) ||
      originalPath.includes("/@vite/") ||
      originalPath.includes("/@react-refresh") ||
      originalPath.includes("/@id/") ||
      originalPath.includes("/@fs/") ||
      originalPath.includes("/node_modules/");
    if (looksLikeJsPath && resp.ok && resp.body) {
      responseHeaders.set(
        "content-type",
        "application/javascript; charset=utf-8",
      );
      return new Response(resp.body, {
        status: resp.status,
        headers: responseHeaders,
      });
    }

    // Inject scripts into HTML responses — STREAMING.
    // Buffer only until we find the next injection marker, then flush and
    // switch to pass-through. Preserves Next.js streaming SSR (RSC chunks).
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") && resp.body) {
      const storageNamespaceSnippet = getStorageNamespaceSnippet(projectId);
      const headSnippet =
        `<meta name="doable-project-id" content="${projectId}">` +
        `<script>${getTrackingScript(publicApiUrl)}</script>`;
      const bodySnippet = `<script>${VISUAL_EDIT_BRIDGE_INLINE}</script>`;

      // Connector-bridge SPA helper goes BEFORE error capture so the helper
      // is available when user code first runs. Token arrives via
      // postMessage from the editor host (PRD 10).
      const headBundle = `${CONNECTOR_BRIDGE_SNIPPET}${ERROR_CAPTURE_SNIPPET}${headSnippet}`;

      const injectionStream = makeInjectionStream([
        // 1. Storage namespacing — at the START of <head> (right after the
        //    open tag) so it runs before any user scripts in <head>.
        {
          patterns: [
            { regex: /<head(?:\s[^>]*)?>/i, insertBefore: false },
            { regex: /<body[^>]*>/i, insertBefore: true },
          ],
          snippet: storageNamespaceSnippet,
        },
        // 2. Connector-bridge + error capture + tracker — at the END of
        //    <head> (before </head>) so they sit after the page's own meta
        //    but before <body>.
        {
          patterns: [
            { regex: /<\/head>/i, insertBefore: true },
            { regex: /<body[^>]*>/i, insertBefore: true },
          ],
          snippet: headBundle,
        },
        // 3. Visual-edit bridge — at the END of <body> (before </body>) so
        //    the DOM has rendered before the bridge wires up.
        {
          patterns: [{ regex: /<\/body>/i, insertBefore: true }],
          snippet: bodySnippet,
        },
      ]);

      responseHeaders.set("content-type", "text/html; charset=utf-8");
      return new Response(resp.body.pipeThrough(injectionStream), {
        status: resp.status,
        headers: responseHeaders,
      });
    }

    // Framework-specific recovery on 502/504. The vite-react adapter recognises
    // .vite/deps and /src/*.{tsx?,jsx?} paths — other adapters can opt in via
    // their own `shouldReloadOnError` predicate. Pre-filter on status so the
    // adapter lookup only runs on actual failures.
    if (resp.status === 502 || resp.status === 504) {
      const adapter = await getAdapterForProject(projectId);
      if (adapter.shouldReloadOnError?.({
        path: originalPath,
        status: resp.status,
        method: c.req.method,
      })) {
        const reloadScript = `
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        `;
        responseHeaders.set("content-type", "application/javascript; charset=utf-8");
        responseHeaders.delete("content-length");
        return new Response(reloadScript, {
          status: 200,
          headers: responseHeaders,
        });
      }
    }

    return new Response(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    });
  } catch (err) {
    // If the fetch itself failed (dev server restarting / not yet bound),
    // ask the framework adapter whether this path is recoverable via a
    // page reload. Treat as 502-equivalent for the predicate.
    const adapter = await getAdapterForProject(projectId);
    if (adapter.shouldReloadOnError?.({
      path: originalPath,
      status: 502,
      method: c.req.method,
    })) {
      const reloadScript = `
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      `;
      return new Response(reloadScript, {
        status: 200,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      });
    }
    return c.text(
      `Preview proxy error: ${err instanceof Error ? err.message : "Unknown error"}`,
      502,
    );
  }
});

/**
 * Handle /preview/:projectId (without trailing slash) — redirect to add
 * the trailing slash so relative paths resolve correctly.
 */
previewRoutes.all("/preview/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  return c.redirect(`/preview/${projectId}/`);
});

/**
 * Vite dev-mode asset fallback proxy.
 *
 * Frameworks like Astro/SvelteKit emit HMR asset paths without the basePath
 * prefix (e.g. /@vite/client, /@fs/..., /src/..., /node_modules/.vite/...).
 * These requests land on the API with no /preview/:id/ prefix, so the main
 * proxy route can't catch them.
 *
 * Strategy: extract the projectId from the Referer header (which will be
 * /preview/:id/...) and forward the request to that project's dev server.
 */
const VITE_DEV_PATH_RE = /^\/((@vite|@fs|@id|__vite_ping|src|node_modules)\b.*)/;

previewRoutes.all("/@vite/*", viteDevAssetFallback);
previewRoutes.all("/@fs/*", viteDevAssetFallback);
previewRoutes.all("/@id/*", viteDevAssetFallback);
previewRoutes.all("/src/*", viteDevAssetFallback);
previewRoutes.all("/node_modules/*", viteDevAssetFallback);
previewRoutes.all("/__vite_ping", viteDevAssetFallback);

async function viteDevAssetFallback(c: import("hono").Context) {
  const referer = c.req.header("referer") ?? "";
  const match = referer.match(/\/preview\/([0-9a-f-]{36})\//i);
  if (!match?.[1]) return c.text("Not found", 404);

  const projectId = match[1]!;
  if (!UUID_RE.test(projectId)) return c.text("Not found", 404);

  const devUrl = getDevServerInternalUrl(projectId);
  if (!devUrl) return c.text("Not found", 404);

  // Same trailing-slash hazard as the main proxy route: Hono's
  // `strict: false` normalizes `c.req.path` and would change the forwarded
  // shape of /@vite/ /@fs/ /__vite_ping etc. Read the pathname off the raw
  // URL so we forward exactly what the browser sent.
  const originalPath = new URL(c.req.url).pathname;
  const qsIndex = c.req.url.indexOf("?");
  const queryString = qsIndex !== -1 ? c.req.url.slice(qsIndex + 1) : "";
  const targetUrl = queryString ? `${devUrl}${originalPath}?${queryString}` : `${devUrl}${originalPath}`;

  try {
    // Same hop-by-hop strip as the main proxy route. Without
    // this, nginx's `Connection: upgrade` injection makes undici refuse the
    // fetch and the fallback path silently 502s.
    const headers = new Headers();
    for (const [key, value] of Object.entries(c.req.header())) {
      const k = key.toLowerCase();
      if (k === "host" || HOP_BY_HOP_REQUEST_HEADERS.has(k) || !value) {
        continue;
      }
      headers.set(key, value);
    }

    const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      // See comment on the main catchall fetch above — Node/undici requires
      // duplex:"half" when streaming a body.
      ...(hasBody ? { duplex: "half" as const } : {}),
    } as RequestInit & { duplex?: "half" });

    const responseHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (!["transfer-encoding", "connection", "keep-alive"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new Response(resp.body, { status: resp.status, headers: responseHeaders });
  } catch {
    return c.text("Bad gateway", 502);
  }
}
