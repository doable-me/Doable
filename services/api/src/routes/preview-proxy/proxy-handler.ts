import { Hono } from "hono";
import {
  getDevServerInternalUrl,
  getDevServerInternalUrlWhenReady,
  startDevServer,
  isRunning,
} from "../../projects/dev-server.js";
import { isProjectScaffolded, ensureDependencies } from "../../projects/file-manager.js";
import { VISUAL_EDIT_BRIDGE_INLINE } from "../../visual-edit-bridge-inline.js";
import { getTrackingScript } from "../../analytics/tracker.js";
import {
  RETRY_HTML,
  getStorageNamespaceSnippet,
  ERROR_CAPTURE_SNIPPET,
} from "./injected-scripts.js";

const publicApiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.CORS_ORIGINS?.split(",")[0]?.replace(/\/$/, "") ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

export const previewRoutes = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Inject scripts into HTML responses
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const html = await resp.text();

      const storageNamespaceSnippet = getStorageNamespaceSnippet(projectId);

      const headSnippet =
        `<meta name="doable-project-id" content="${projectId}">` +
        `<script>${getTrackingScript(publicApiUrl)}</script>`;
      const bodySnippet = `<script>${VISUAL_EDIT_BRIDGE_INLINE}</script>`;

      let injected = html;

      // Inject storage namespacing at the START of <head>
      const headOpenMatch = injected.match(/<head(\s[^>]*)?>/i);
      if (headOpenMatch && typeof headOpenMatch.index === "number") {
        const insertAt = headOpenMatch.index + headOpenMatch[0].length;
        injected =
          injected.slice(0, insertAt) +
          storageNamespaceSnippet +
          injected.slice(insertAt);
      } else if (injected.includes("<body")) {
        injected = injected.replace(/<body/i, `${storageNamespaceSnippet}<body`);
      } else {
        injected = `${storageNamespaceSnippet}${injected}`;
      }

      if (injected.includes("</head>")) {
        injected = injected.replace("</head>", `${ERROR_CAPTURE_SNIPPET}${headSnippet}</head>`);
      } else if (injected.includes("<body")) {
        injected = injected.replace(/<body/i, `${ERROR_CAPTURE_SNIPPET}${headSnippet}<body`);
      } else {
        injected = `${ERROR_CAPTURE_SNIPPET}${headSnippet}${injected}`;
      }
      if (injected.includes("</body>")) {
        injected = injected.replace("</body>", `${bodySnippet}</body>`);
      } else {
        injected += bodySnippet;
      }

      responseHeaders.delete("content-length");
      responseHeaders.set("content-type", "text/html; charset=utf-8");
      return new Response(injected, {
        status: resp.status,
        headers: responseHeaders,
      });
    }

    // Intercept 502 or 504 on .vite/deps ("Outdated Optimize Dep") — Vite
    // returns 504 when a pre-bundled dep hash is stale after a server restart,
    // and the proxy returns 502 when the dev server is unreachable during restart.
    // Instead of forwarding the error (which breaks the app), return a small
    // JS module that forces a full page reload so the browser fetches
    // fresh module URLs from the rebuilt index.html.
    if ((resp.status === 504 || resp.status === 502) && originalPath.includes(".vite/deps")) {
      const reloadScript = `
        // Stale Vite dep detected — reload the page to pick up fresh deps
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

    return new Response(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    });
  } catch (err) {
    // If the fetch failed for a .vite/deps or source file request (dev server
    // restarting), return a reload script instead of a hard 502.
    if (originalPath.includes(".vite/deps") || originalPath.match(/\/src\/.*\.(tsx?|jsx?)$/)) {
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
