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
 * Storage namespacing script — prefixes every localStorage/sessionStorage key
 * with __<projectId>__ so state does not leak across project previews.
 * Must run BEFORE any user scripts.
 */
export function getStorageNamespaceSnippet(projectId: string): string {
  return `<script>
(function() {
  try {
    var PREFIX = ${JSON.stringify(`__${projectId}__`)};
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
      if (url && (url.includes('/__vite') || url.includes('ws') || url.includes(':' + location.port))) {
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
