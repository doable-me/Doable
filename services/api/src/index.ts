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
import { contextRoutes } from "./routes/context.js";
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
import { communityRoutes } from "./routes/community.js";
import { directSaveRoutes } from "./direct-save/index.js";
import { rateLimiter } from "./middleware/rate-limit.js";

// ─── Visual Edit Bridge Script ───────────────────────────────
// This script is loaded by preview iframes to enable visual editing.
// It communicates with the parent editor via postMessage.
const VISUAL_EDIT_BRIDGE_JS = `
(function() {
  if (window.__visualEditBridge) return;
  window.__visualEditBridge = true;

  var selectionEnabled = false;
  var selectedElement = null;
  var hoveredElement = null;

  // Overlay elements
  var hoverOverlay = document.createElement('div');
  hoverOverlay.id = '__ve-hover-overlay';
  hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99998;border:2px solid rgba(99,102,241,0.6);background:rgba(99,102,241,0.08);display:none;transition:all 0.1s ease;border-radius:2px;';
  document.body.appendChild(hoverOverlay);

  var selectOverlay = document.createElement('div');
  selectOverlay.id = '__ve-select-overlay';
  selectOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #6366f1;background:rgba(99,102,241,0.05);display:none;border-radius:2px;';
  document.body.appendChild(selectOverlay);

  var tagLabel = document.createElement('div');
  tagLabel.id = '__ve-tag-label';
  tagLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:100000;background:#6366f1;color:white;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;font-family:ui-monospace,monospace;display:none;white-space:nowrap;';
  document.body.appendChild(tagLabel);

  function generateSelector(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var current = el;
    var depth = 0;
    while (current && current !== document.body && depth < 5) {
      var selector = current.tagName.toLowerCase();
      if (current.id) { parts.unshift('#' + current.id); break; }
      if (current.className && typeof current.className === 'string') {
        var classes = current.className.trim().split(/\\s+/).filter(function(c) { return !c.startsWith('__ve-'); }).slice(0, 3);
        if (classes.length > 0) selector += '.' + classes.join('.');
      }
      if (current.parentElement) {
        var siblings = Array.from(current.parentElement.children).filter(function(s) { return s.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + idx + ')';
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function extractElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var tag = el.tagName.toLowerCase();
    var textTags = ['p','h1','h2','h3','h4','h5','h6','span','a','label','li','td','th','figcaption','caption','blockquote','em','strong','b','i','u','small','code','pre'];
    var isText = textTags.indexOf(tag) !== -1;
    var isSvg = tag === 'svg' || el.closest('svg') !== null;
    var isIcon = isSvg || (el.children.length === 1 && el.children[0] && el.children[0].tagName && el.children[0].tagName.toLowerCase() === 'svg');
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += el.childNodes[i].textContent.trim() + ' ';
    }
    text = text.trim().slice(0, 200);
    if (!text) text = (el.textContent || '').slice(0, 200);

    return {
      tagName: tag,
      className: typeof el.className === 'string' ? el.className : '',
      textContent: text,
      selector: generateSelector(el),
      boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right },
      computedStyles: {
        color: cs.color, backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
        textAlign: cs.textAlign, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
        marginTop: cs.marginTop, marginRight: cs.marginRight, marginBottom: cs.marginBottom, marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
        width: cs.width, height: cs.height,
        borderWidth: cs.borderWidth, borderColor: cs.borderColor, borderStyle: cs.borderStyle, borderRadius: cs.borderRadius,
        display: cs.display, flexDirection: cs.flexDirection, alignItems: cs.alignItems, justifyContent: cs.justifyContent, gap: cs.gap
      },
      isTextElement: isText || (text.length > 0 && el.children.length === 0),
      isIconElement: isIcon,
      hasChildren: el.children.length > 0,
      childCount: el.children.length
    };
  }

  function positionOverlay(overlay, rect) {
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  function positionTagLabel(rect, tagText) {
    tagLabel.textContent = tagText;
    tagLabel.style.display = 'block';
    var labelTop = rect.top - 22;
    tagLabel.style.top = (labelTop < 4 ? rect.bottom + 4 : labelTop) + 'px';
    tagLabel.style.left = rect.left + 'px';
  }

  function hideOverlays() { hoverOverlay.style.display = 'none'; }
  function hideSelection() { selectOverlay.style.display = 'none'; tagLabel.style.display = 'none'; }

  function shouldIgnore(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (el.id && el.id.startsWith('__ve-')) return true;
    return false;
  }

  function onMouseMove(e) {
    if (!selectionEnabled) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el) || el === hoveredElement) return;
    hoveredElement = el;
    if (el === selectedElement) { hideOverlays(); return; }
    positionOverlay(hoverOverlay, el.getBoundingClientRect());
  }

  function onMouseLeave() { hoveredElement = null; hideOverlays(); }

  function onClick(e) {
    if (!selectionEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (shouldIgnore(el)) return;
    selectedElement = el;
    hoveredElement = null;
    hideOverlays();
    var rect = el.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    var info = extractElementInfo(el);
    positionTagLabel(rect, info.tagName);
    window.parent.postMessage({ type: 'visual-edit:element-selected', element: info }, '*');
  }

  function updateSelectedOverlay() {
    if (!selectedElement || !document.contains(selectedElement)) { hideSelection(); return; }
    var rect = selectedElement.getBoundingClientRect();
    positionOverlay(selectOverlay, rect);
    positionTagLabel(rect, selectedElement.tagName.toLowerCase());
  }

  window.addEventListener('scroll', updateSelectedOverlay, true);
  window.addEventListener('resize', updateSelectedOverlay);

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.type || msg.type.indexOf('visual-edit:') !== 0) return;
    switch(msg.type) {
      case 'visual-edit:enable-selection':
        selectionEnabled = true;
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseleave', onMouseLeave, true);
        document.addEventListener('click', onClick, true);
        break;
      case 'visual-edit:disable-selection':
        selectionEnabled = false;
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('mouseleave', onMouseLeave, true);
        document.removeEventListener('click', onClick, true);
        hoveredElement = null;
        hideOverlays();
        hideSelection();
        selectedElement = null;
        break;
      case 'visual-edit:select-parent':
        if (selectedElement && selectedElement.parentElement && selectedElement.parentElement !== document.body) {
          selectedElement = selectedElement.parentElement;
          var rect = selectedElement.getBoundingClientRect();
          positionOverlay(selectOverlay, rect);
          var info = extractElementInfo(selectedElement);
          positionTagLabel(rect, info.tagName);
          window.parent.postMessage({ type: 'visual-edit:parent-selected', element: info }, '*');
        }
        break;
      case 'visual-edit:deselect':
        selectedElement = null;
        hideSelection();
        window.parent.postMessage({ type: 'visual-edit:element-deselected' }, '*');
        break;
    }
  });

  window.parent.postMessage({ type: 'visual-edit:ready' }, '*');
})();
`;

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
app.route("/community", communityRoutes);

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

export default app;
export type AppType = typeof app;
