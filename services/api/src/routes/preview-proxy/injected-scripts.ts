/**
 * Injected script snippets for preview proxy HTML responses.
 * Extracted to keep the proxy handler file under 400 lines.
 */

/** Retry page shown when the dev server is not ready yet */
export const RETRY_HTML = `<!doctype html>
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

/**
 * Connector-bridge SPA helper (PRD 10).
 *
 * Injected into preview HTML so a scaffolded static SPA can call the
 * connector-proxy endpoint without manually plumbing a JWT. The editor
 * host page postMessages a token after the iframe loads; this snippet
 * stores it in memory and exposes `window.__doable.callConnector(...)`.
 *
 * The token has a 15-min lifetime — when the SPA's call returns 401
 * (jwt-expired), the helper requests a fresh token via postMessage to
 * `parent` and retries once.
 *
 * Must run BEFORE any user scripts so the SPA's first connector call
 * after page load doesn't race the token arrival.
 */
export const CONNECTOR_BRIDGE_SNIPPET = `<script>
(function() {
  if (window.__doable && window.__doable.callConnector) return;
  var token = null;
  var pendingRequests = [];
  function setToken(t) {
    token = t;
    var queue = pendingRequests; pendingRequests = [];
    queue.forEach(function (resume) { resume(t); });
  }
  function awaitToken() {
    return token ? Promise.resolve(token) : new Promise(function (resolve) { pendingRequests.push(resolve); });
  }
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data !== "object") return;
    if (ev.data.type === "doable:connector-proxy-token" && typeof ev.data.token === "string") {
      setToken(ev.data.token);
    }
  });
  // Tell the host we're ready to receive a token.
  try { window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*"); } catch (e) {}
  async function callConnector(integration, action, props) {
    var t = await awaitToken();
    var doFetch = function (theToken) {
      return fetch("/__doable/connector-proxy/" + encodeURIComponent(integration) + "/" + encodeURIComponent(action), {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + theToken },
        body: JSON.stringify({ props: props || {} }),
      });
    };
    var res = await doFetch(t);
    if (res.status === 401) {
      // token expired — clear and request a fresh one, then retry once
      token = null;
      try { window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*"); } catch (e) {}
      var t2 = await awaitToken();
      res = await doFetch(t2);
    }
    return res.json();
  }
  // ─── MCP Tool Call Support ───
  // Exposes callMcp(toolName, args) and also intercepts self-posted
  // "mcp-call" messages (used by generated apps in published/standalone mode).
  async function callMcp(toolName, args) {
    var t = await awaitToken();
    var doFetch = function (theToken) {
      return fetch("/__doable/connector-proxy/mcp/" + encodeURIComponent(toolName), {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + theToken },
        body: JSON.stringify({ props: args || {} }),
      });
    };
    var res = await doFetch(t);
    if (res.status === 401) {
      token = null;
      try { window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*"); } catch (e) {}
      var t2 = await awaitToken();
      res = await doFetch(t2);
    }
    return res.json();
  }

  // Intercept mcp-call postMessages on own window (published mode: parent === window).
  // In preview mode these go to parent (editor handles them), but when standalone
  // they arrive on our own window, so we handle them here.
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data !== "object") return;
    if (ev.data.type !== "mcp-call") return;
    // Only handle if we are the top-level window (published) OR if the message
    // originated from ourselves (ev.source === window).
    if (window.parent !== window && ev.source !== window) return;
    var callbackId = ev.data.callbackId;
    var mcpToolName = ev.data.toolName;
    var mcpArgs = ev.data.args || {};
    callMcp(mcpToolName, mcpArgs).then(function (result) {
      var response = { type: "mcp-response", callbackId: callbackId };
      if (result && result.success) {
        response.result = result.data;
      } else {
        response.error = (result && result.error && result.error.message) || "MCP call failed";
      }
      window.postMessage(response, "*");
    }).catch(function (err) {
      window.postMessage({ type: "mcp-response", callbackId: callbackId, error: err.message || "Network error" }, "*");
    });
  });

  window.__doable = window.__doable || {};
  window.__doable.callConnector = callConnector;
  window.__doable.callMcp = callMcp;
})();
</script>`;

/**
 * Storage namespacing script — prefixes every localStorage/sessionStorage key
 * with __<projectId>__ so state does not leak across project previews.
 * When the iframe has an opaque origin (sandbox without allow-same-origin),
 * real Storage throws SecurityError — in that case we install an in-memory
 * polyfill so user code that calls localStorage/sessionStorage still works
 * (data just won't persist across reloads, which is fine for dev previews).
 * Must run BEFORE any user scripts.
 */
export function getStorageNamespaceSnippet(projectId: string): string {
  return `<script>
(function() {
  try {
    var PREFIX = ${JSON.stringify(`__${projectId}__`)};

    // Detect whether real Storage is accessible (opaque-origin iframes throw)
    var storageAvailable = false;
    try { window.localStorage.length; storageAvailable = true; } catch(e) {}

    if (storageAvailable) {
      // Real storage is available — namespace keys per-project
      var proto = Storage.prototype;
      var origGet = proto.getItem;
      var origSet = proto.setItem;
      var origRemove = proto.removeItem;
      var origKey = proto.key;
      var lengthDesc = Object.getOwnPropertyDescriptor(proto, 'length');
      var origLengthGet = lengthDesc && lengthDesc.get;

      function collectKeys(storage) {
        var keys = [];
        var total = origLengthGet ? origLengthGet.call(storage) : 0;
        for (var i = 0; i < total; i++) {
          var k = origKey.call(storage, i);
          if (k !== null && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        return keys;
      }

      proto.getItem = function(k) { return origGet.call(this, PREFIX + k); };
      proto.setItem = function(k, v) { return origSet.call(this, PREFIX + k, v); };
      proto.removeItem = function(k) { return origRemove.call(this, PREFIX + k); };
      proto.key = function(index) {
        var keys = collectKeys(this);
        if (index < 0 || index >= keys.length) return null;
        return keys[index].slice(PREFIX.length);
      };
      proto.clear = function() {
        var keys = collectKeys(this);
        for (var i = 0; i < keys.length; i++) origRemove.call(this, keys[i]);
      };
      if (origLengthGet) {
        Object.defineProperty(proto, 'length', {
          configurable: true,
          enumerable: true,
          get: function() { return collectKeys(this).length; }
        });
      }
    } else {
      // Opaque origin — provide in-memory Storage polyfill so user code
      // calling localStorage/sessionStorage does not throw SecurityError.
      function MemStorage() { this._data = {}; }
      MemStorage.prototype.getItem = function(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; };
      MemStorage.prototype.setItem = function(k, v) { this._data[k] = String(v); };
      MemStorage.prototype.removeItem = function(k) { delete this._data[k]; };
      MemStorage.prototype.clear = function() { this._data = {}; };
      MemStorage.prototype.key = function(i) { var keys = Object.keys(this._data); return i >= 0 && i < keys.length ? keys[i] : null; };
      Object.defineProperty(MemStorage.prototype, 'length', { get: function() { return Object.keys(this._data).length; } });
      var memLocal = new MemStorage();
      var memSession = new MemStorage();
      try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function() { return memLocal; } }); } catch(e) {}
      try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function() { return memSession; } }); } catch(e) {}
    }
  } catch (e) { /* swallow — never break the preview because of namespacing */ }
})();
</script>`;
}

/**
 * Error capture + HMR detection script — captures uncaught errors,
 * unhandled promise rejections, console.error calls, Vite error overlays,
 * and detects HMR activity.
 */
export const ERROR_CAPTURE_SNIPPET = `<script>
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

  // ─── HMR detection ─────────────────────────────────────────
  if (window.__vite_plugin_react_preamble_installed__ !== undefined || true) {
    var hmrSocket = null;
    var origWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      var ws = protocols ? new origWS(url, protocols) : new origWS(url);
      if (url && (url.includes('/__vite') || url.includes('/_next/webpack-hmr') || url.includes('ws') || url.includes(':' + location.port))) {
        hmrSocket = ws;
        ws.addEventListener('message', function(e) {
          try {
            var data = JSON.parse(e.data);
            if (data.type === 'update' || data.type === 'full-reload') {
              window.parent.postMessage({
                type: 'doable-hmr-update',
                updateType: data.type,
                timestamp: Date.now()
              }, '*');
            }
            if (data.type === 'connected') {
              window.parent.postMessage({
                type: 'doable-hmr-connected',
                timestamp: Date.now()
              }, '*');
            }
          } catch(ex) {}
        });
        ws.addEventListener('open', function() {
          window.parent.postMessage({
            type: 'doable-hmr-connected',
            timestamp: Date.now()
          }, '*');
        });
      }
      return ws;
    };
    window.WebSocket.prototype = origWS.prototype;
    window.WebSocket.CONNECTING = origWS.CONNECTING;
    window.WebSocket.OPEN = origWS.OPEN;
    window.WebSocket.CLOSING = origWS.CLOSING;
    window.WebSocket.CLOSED = origWS.CLOSED;
  }

  window.addEventListener('load', function() {
    window.parent.postMessage({ type: 'doable-preview-loaded' }, '*');
  });
})();
</script>`;
