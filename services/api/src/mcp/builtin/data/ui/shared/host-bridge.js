/**
 * host-bridge.js — postMessage protocol between MCP App iframes and the host.
 *
 * The iframe NEVER fetches with credentials directly.  All data requests are
 * forwarded to the host via postMessage.  The host holds the project JWT and
 * relays the response back.
 *
 * Message shapes (from PRD 06-mcp-integration.md §postMessage protocol):
 *
 *   iframe → host:
 *     { type: "doable.data.request", id: "rpc-1", op: "query",
 *       body: { sql: "SELECT ...", params: [], row_cap: 50 } }
 *
 *   host → iframe (success):
 *     { type: "doable.data.response", id: "rpc-1",
 *       body: { ok: true, rows: [...], rowCount: 12, fields: [...], elapsed_ms: 7 } }
 *
 *   host → iframe (error):
 *     { type: "doable.data.response", id: "rpc-1",
 *       body: { ok: false, error: { code: "RLS_DENIED", message: "..." } } }
 *
 *   host → iframe (initial handshake):
 *     { type: "doable.data.ready", token: "eyJ...", projectId: "...", workspaceId: "..." }
 */

let _rpcCounter = 0;
const _pending = new Map(); // id → { resolve, reject }

/** Populated once the host sends doable.data.ready */
export const context = {
  token: null,
  projectId: null,
  workspaceId: null,
  ready: false,
};

const _readyCallbacks = [];

/** Call cb once the host handshake has arrived (or immediately if already ready). */
export function onReady(cb) {
  if (context.ready) {
    cb(context);
  } else {
    _readyCallbacks.push(cb);
  }
}

/**
 * Send a data request to the host and return a Promise that resolves with the
 * response body.  Rejects on { ok: false } or if no response arrives within
 * the timeout.
 */
export function request(op, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = "rpc-" + (++_rpcCounter);
    let timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error("doable.data.request timeout: " + op));
    }, timeoutMs);

    _pending.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject:  (err)    => { clearTimeout(timer); reject(err); },
    });

    window.parent.postMessage(
      { type: "doable.data.request", id, op, body },
      "*",
    );
  });
}

/** Convenience wrappers */
export function query(sql, params, row_cap) {
  return request("query", { sql, params: params ?? [], row_cap: row_cap ?? 50 });
}

export function schema() {
  return request("schema", {});
}

export function inspect(table, where, limit, offset) {
  return request("inspect", {
    table,
    where: where ?? undefined,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Internal message listener
// ---------------------------------------------------------------------------

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "doable.data.ready") {
    context.token       = msg.token       ?? null;
    context.projectId   = msg.projectId   ?? null;
    context.workspaceId = msg.workspaceId ?? null;
    context.ready       = true;
    for (const cb of _readyCallbacks) {
      try { cb(context); } catch (_) { /* ignore */ }
    }
    _readyCallbacks.length = 0;
    return;
  }

  if (msg.type === "doable.data.response") {
    const handler = _pending.get(msg.id);
    if (!handler) return;
    _pending.delete(msg.id);
    const body = msg.body ?? {};
    if (body.ok === false) {
      const err = new Error(body.error?.message ?? "Unknown data error");
      err.code = body.error?.code ?? "UNKNOWN";
      handler.reject(err);
    } else {
      handler.resolve(body);
    }
  }
});
