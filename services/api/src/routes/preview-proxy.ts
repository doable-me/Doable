/**
 * Preview Proxy Routes
 *
 * Reverse proxy that forwards requests from /preview/:projectId/*
 * to the project's Vite dev server running on localhost. This allows
 * the preview to work from ANY machine — the browser only needs to
 * reach the API server, not the individual Vite ports.
 *
 * HTTP requests (HTML, JS, CSS, images, fonts) are proxied normally.
 * Vite HMR WebSocket is NOT proxied — the preview relies on manual
 * refresh (which matches how Lovable-style editors work: the preview
 * refreshes after the AI finishes writing code, not in real-time).
 *
 * For HTML responses, the analytics tracking script is injected before
 * </head> so visitor metrics are collected automatically.
 */

import { Hono } from "hono";
import {
  getDevServerInternalUrl,
  startDevServer,
  isRunning,
} from "../projects/dev-server.js";
import { isProjectScaffolded, ensureDependencies } from "../projects/file-manager.js";

const apiUrl =
  process.env.API_URL ??
  `http://localhost:${process.env.API_PORT ?? "4000"}`;

export const previewRoutes = new Hono();

/**
 * Proxy ALL requests under /preview/:projectId/* to the Vite dev server.
 */
previewRoutes.all("/preview/:projectId/*", async (c) => {
  const projectId = c.req.param("projectId");

  // Ensure the dev server is running (auto-start if scaffolded)
  if (!isRunning(projectId) && isProjectScaffolded(projectId)) {
    try {
      await ensureDependencies(projectId);
      await startDevServer(projectId);
    } catch {
      // Fall through — getDevServerInternalUrl will return null
    }
  }

  const devUrl = getDevServerInternalUrl(projectId);
  if (!devUrl) {
    return c.text("Preview not available. Project may still be starting.", 503);
  }

  // Build the target URL — keep the full /preview/{projectId}/... path
  // because Vite is started with --base /preview/{projectId}/ and expects
  // requests to arrive with that prefix intact.
  const originalPath = c.req.path;
  const prefix = `/preview/${projectId}`;
  const targetUrl = `${devUrl}${originalPath}`;

  // Preserve query string
  const qsIndex = c.req.url.indexOf("?");
  const queryString = qsIndex !== -1 ? c.req.url.slice(qsIndex + 1) : "";
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  try {
    // Build headers — copy everything except Host (which must target the Vite server)
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

    // Inject analytics tracking script into HTML responses
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const html = await resp.text();
      const analyticsSnippet =
        `<meta name="doable-project-id" content="${projectId}">` +
        `<script src="${apiUrl}/analytics/script.js"></script>`;
      const injected = html.includes("</head>")
        ? html.replace("</head>", `${analyticsSnippet}</head>`)
        : html.replace("</body>", `${analyticsSnippet}</body>`);

      return new Response(injected, {
        status: resp.status,
        headers: responseHeaders,
      });
    }

    return new Response(resp.body, {
      status: resp.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return c.text(
      `Preview proxy error: ${err instanceof Error ? err.message : "Unknown error"}`,
      502,
    );
  }
});

/**
 * Handle /preview/:projectId (without trailing slash) — redirect to add
 * the trailing slash so that relative paths in the HTML (e.g. ./src/main.tsx)
 * resolve correctly.
 */
previewRoutes.all("/preview/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  return c.redirect(`/preview/${projectId}/`);
});
