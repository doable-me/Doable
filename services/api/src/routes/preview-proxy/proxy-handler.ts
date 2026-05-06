import { Hono } from "hono";
import {
  getDevServerInternalUrl,
  getDevServerInternalUrlWhenReady,
  startDevServer,
  isRunning,
  touchActivity,
} from "../../projects/dev-server.js";
import { isProjectScaffolded, ensureDependencies } from "../../projects/file-manager.js";
import { VISUAL_EDIT_BRIDGE_INLINE } from "../../visual-edit-bridge-inline.js";
import { getTrackingScript } from "../../analytics/tracker.js";
import { sql } from "../../db/index.js";
import { defaultRegistry } from "../../frameworks/registry.js";
import type { FrameworkAdapter } from "../../frameworks/types.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
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

const PROJECT_JWT_SECRET =
  process.env.PROJECT_JWT_SECRET ??
  "DEVELOPMENT_PROJECT_JWT_SECRET_DO_NOT_USE_IN_PROD";

export const previewRoutes = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Look up the project's workspace
  const [row] = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (!row) {
    return c.json({ error: "Project not found" }, 404);
  }

  const token = await signProjectJwt(
    {
      projectId,
      workspaceId: row.workspace_id,
      kind: "connector-proxy",
    },
    PROJECT_JWT_SECRET,
  );

  return c.json({ token, expiresIn: 15 * 60 });
});

/**
 * Proxy ALL requests under /preview/:projectId/* to the Vite dev server.
 */
previewRoutes.all("/preview/:projectId/*", async (c) => {
  const projectId = c.req.param("projectId");

  // Validate UUID to prevent enumeration/probing (Bug-108)
  if (!UUID_RE.test(projectId)) {
    return c.text("Not found", 404);
  }

  // Ensure the dev server is running (auto-start if scaffolded)
  if (!isRunning(projectId) && isProjectScaffolded(projectId)) {
    try {
      await ensureDependencies(projectId);
      await startDevServer(projectId);
    } catch {
      // Fall through — getDevServerInternalUrlWhenReady will return null
    }
  }

  const devUrl = await getDevServerInternalUrlWhenReady(projectId);
  if (!devUrl) {
    return c.html(RETRY_HTML, 503, {
      "Retry-After": "3",
      "Cache-Control": "no-store",
    });
  }

  // Mark this dev server as recently active so the idle-eviction sweeper
  // (dev-server-core.ts) doesn't kill it. Cheap (Date.now write) and runs
  // on every proxied subrequest — HTML, JS chunks, CSS, HMR pings — so any
  // user with the iframe in view keeps the session warm.
  touchActivity(projectId);

  const originalPath = c.req.path;
  const targetUrl = `${devUrl}${originalPath}`;

  // Preserve query string
  const qsIndex = c.req.url.indexOf("?");
  const queryString = qsIndex !== -1 ? c.req.url.slice(qsIndex + 1) : "";
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  try {
    // Build headers — copy everything except Host
    const headers = new Headers();
    for (const [key, value] of Object.entries(c.req.header())) {
      if (key.toLowerCase() !== "host" && value) {
        headers.set(key, value);
      }
    }

    const resp = await fetch(fullUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

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
        "frame-ancestors 'self' https://*.doable.me http://localhost:* http://127.0.0.1:*",
        "object-src 'none'",
      ].join("; "),
    );

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

  const originalPath = c.req.path;
  const qsIndex = c.req.url.indexOf("?");
  const queryString = qsIndex !== -1 ? c.req.url.slice(qsIndex + 1) : "";
  const targetUrl = queryString ? `${devUrl}${originalPath}?${queryString}` : `${devUrl}${originalPath}`;

  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(c.req.header())) {
      if (key.toLowerCase() !== "host" && value) {
        headers.set(key, value);
      }
    }

    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
    });

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
