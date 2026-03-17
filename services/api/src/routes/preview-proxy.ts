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
import { VISUAL_EDIT_BRIDGE_INLINE } from "../visual-edit-bridge-inline.js";

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
    // Return a styled HTML page that auto-retries instead of plain text.
    // This prevents the "blank page" experience — the user sees a loading
    // indicator and the page refreshes automatically when the server is ready.
    const retryHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Starting preview...</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           background:linear-gradient(135deg,#faf5ff,#eff6ff); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    .box { text-align:center; background:#fff; border-radius:16px; padding:40px 32px; max-width:380px;
           box-shadow:0 4px 24px rgba(0,0,0,.08); border:1px solid rgba(0,0,0,.06); }
    .spinner { width:36px; height:36px; border:3px solid #e5e7eb; border-top-color:#6366f1;
               border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    h2 { font-size:18px; font-weight:600; color:#1f2937; margin:0 0 8px; }
    p  { font-size:14px; color:#6b7280; margin:0; line-height:1.5; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>Starting preview...</h2>
    <p>The dev server is warming up. This page will refresh automatically.</p>
  </div>
  <script>setTimeout(function(){ window.location.reload(); }, 3000);</script>
</body>
</html>`;
    return c.html(retryHtml, 503, {
      "Retry-After": "3",
      "Cache-Control": "no-store",
    });
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

    // Inject error capture, analytics, and visual edit bridge scripts into HTML responses
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const html = await resp.text();

      // Error capture script — injected FIRST so it catches errors from all subsequent scripts.
      // Catches uncaught errors, unhandled promise rejections, console.error calls,
      // and Vite error overlays, then batches them to the parent frame via postMessage.
      const errorCaptureSnippet = `<script>
(function() {
  var errors = [];
  var DEBOUNCE_MS = 500;
  var debounceTimer = null;

  function reportErrors() {
    if (errors.length === 0) return;
    var batch = errors.splice(0, errors.length);
    window.parent.postMessage({
      type: 'doable-preview-error',
      errors: batch
    }, '*');
  }

  function captureError(msg, source, line, col, stack) {
    if (msg && (msg.includes('ResizeObserver') || msg.includes('Script error') && !source)) return;
    errors.push({
      message: String(msg || 'Unknown error'),
      source: source || '',
      line: line || 0,
      column: col || 0,
      stack: stack || '',
      timestamp: Date.now()
    });
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportErrors, DEBOUNCE_MS);
  }

  window.onerror = function(msg, source, line, col, error) {
    captureError(msg, source, line, col, error ? error.stack : '');
  };

  window.onunhandledrejection = function(event) {
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : '';
    captureError('Unhandled Promise: ' + msg, '', 0, 0, stack);
  };

  var origError = console.error;
  console.error = function() {
    var args = Array.from(arguments);
    var msg = args.map(function(a) {
      if (a instanceof Error) return a.message;
      if (typeof a === 'object') try { return JSON.stringify(a).slice(0, 200); } catch(e) { return String(a); }
      return String(a);
    }).join(' ');
    if (!msg.includes('Warning:') && !msg.includes('Download the React DevTools')) {
      captureError('Console Error: ' + msg.slice(0, 500), '', 0, 0, '');
    }
    origError.apply(console, arguments);
  };

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName === 'VITE-ERROR-OVERLAY' || (node.shadowRoot && node.tagName && node.tagName.toLowerCase().includes('error'))) {
          var text = node.shadowRoot ? node.shadowRoot.textContent : node.textContent;
          if (text) {
            captureError('Vite Error: ' + text.slice(0, 800), '', 0, 0, '');
          }
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'doable-refresh') {
      window.location.reload();
    }
  });

  window.addEventListener('load', function() {
    window.parent.postMessage({ type: 'doable-preview-loaded' }, '*');
  });
})();
</script>`;

      // Analytics meta + script go in <head>
      const headSnippet =
        `<meta name="doable-project-id" content="${projectId}">` +
        `<script src="${apiUrl}/analytics/script.js"></script>`;
      // Visual edit bridge must go before </body> so document.body exists.
      // Inlined to avoid cross-origin script loading issues in sandboxed iframes.
      const bodySnippet = `<script>${VISUAL_EDIT_BRIDGE_INLINE}</script>`;

      let injected = html;
      if (injected.includes("</head>")) {
        injected = injected.replace("</head>", `${errorCaptureSnippet}${headSnippet}</head>`);
      } else if (injected.includes("<body")) {
        // No </head> tag — inject head snippets right before <body>
        injected = injected.replace(/<body/i, `${errorCaptureSnippet}${headSnippet}<body`);
      } else {
        // No </head> or <body> — prepend head snippets at the very start
        injected = `${errorCaptureSnippet}${headSnippet}${injected}`;
      }
      if (injected.includes("</body>")) {
        injected = injected.replace("</body>", `${bodySnippet}</body>`);
      } else {
        // Fallback: append at end
        injected += bodySnippet;
      }

      // Remove old content-length since we changed the body size
      responseHeaders.delete("content-length");
      responseHeaders.set("content-type", "text/html; charset=utf-8");
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
