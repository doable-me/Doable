import { createConnection, type Socket } from "node:net";
import type { IncomingMessage } from "node:http";
import { getDevServerInternalUrl } from "../../projects/dev-server.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX_RE = /^\/preview\/([0-9a-f-]+)(\/.*)?$/i;
// The platform HMR config tells Vite's client to connect at `/preview/<id>/__hmr`,
// but Vite's WS handler is at server root (not under `--base`), so we rewrite
// the upgrade URL to `/` before forwarding — otherwise Vite returns 426/404.
const HMR_SUFFIX_RE = /^\/preview\/[0-9a-f-]+\/__hmr(\/.*)?$/i;

// Keep-alive heuristics — Vite's HMR server pings every ~30s by default, but
// only AFTER the first hot-update; the initial 30s window is silent. Without
// OS-level TCP keepalive the cloudflared edge can reap an idle WS in ~5s
// (BUG-R27-011), causing the Vite client to interpret the drop as a
// connection failure and force a full `location.reload()`. 25s leaves a
// healthy margin under both cloudflared's 100s tunnel-idle and any in-path
// NAT/proxy that times out on the low end.
const TCP_KEEPALIVE_INITIAL_DELAY_MS = 25_000;
// Server-initiated WS ping cadence — sent when we observe no upstream→client
// traffic for this long. Vite's own pings are usually sufficient, but this
// covers the silent boot window plus any framework whose HMR ping is
// disabled. Frame format: opcode=0x9 (ping), no payload, no mask.
const WS_PING_INTERVAL_MS = 25_000;
// Pre-built ping frame: FIN=1, opcode=0x9 (ping), MASK=0, payload-len=0.
// Server→client frames are NEVER masked (RFC 6455 §5.1).
const WS_PING_FRAME = Buffer.from([0x89, 0x00]);

/**
 * Handle an HTTP upgrade for /preview/:projectId/* and forward to the
 * per-project dev-server. Enables TCP keepalive + server-initiated WS pings
 * (25s) on both sockets so cloudflared's idle reaper doesn't drop HMR connections.
 */
export function handleWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Socket,
  head: Buffer,
): void {
  const url = req.url ?? "";
  const m = url.match(PREFIX_RE);
  if (!m || !UUID_RE.test(m[1] ?? "")) {
    clientSocket.destroy();
    return;
  }
  const projectId = m[1];
  if (!projectId) {
    clientSocket.destroy();
    return;
  }

  const upstream = getDevServerInternalUrl(projectId);
  if (!upstream) {
    // Dev server not running — can't forward.
    try { clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n"); } catch {}
    clientSocket.destroy();
    return;
  }

  // upstream is e.g. "http://localhost:3142" — extract host + port.
  const u = new URL(upstream);
  const host = u.hostname;
  const port = parseInt(u.port, 10) || (u.protocol === "https:" ? 443 : 80);

  // Enable OS-level TCP keepalive on the client socket BEFORE we issue the
  // upstream connect — if the connect itself takes a while, the inbound
  // socket needs to stay warm. Setting timeout to 0 clears any default the
  // HTTP server may have installed (Node's default keep-alive timeout on
  // an upgraded connection is inherited from the parent server and CAN
  // close upgraded sockets if any framework set headersTimeout/etc.).
  try { clientSocket.setKeepAlive(true, TCP_KEEPALIVE_INITIAL_DELAY_MS); } catch {}
  try { clientSocket.setNoDelay(true); } catch {}
  try { clientSocket.setTimeout(0); } catch {}

  let pingTimer: NodeJS.Timeout | null = null;
  let lastUpstreamFrameAt = Date.now();

  // Platform HMR path is `/preview/<id>/__hmr` but Vite's WS handler sits at
  // server root — rewrite to `/` so the handshake succeeds.
  const upstreamUrl = HMR_SUFFIX_RE.test(url) ? "/" : url;

  const upstreamSocket = createConnection({ host, port }, () => {
    // Apply the same keep-alive treatment to the upstream socket so cloudflared
    // (or any in-path proxy) doesn't reap it from the other side.
    try { upstreamSocket.setKeepAlive(true, TCP_KEEPALIVE_INITIAL_DELAY_MS); } catch {}
    try { upstreamSocket.setNoDelay(true); } catch {}
    try { upstreamSocket.setTimeout(0); } catch {}

    // Replay the upgrade request line + headers verbatim. Hop-by-hop
    // headers like Connection: Upgrade are already in req.headers.
    const headers: string[] = [`${req.method ?? "GET"} ${upstreamUrl} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const vv of v) headers.push(`${k}: ${vv}`);
      } else if (v !== undefined) {
        headers.push(`${k}: ${v}`);
      }
    }
    headers.push("", "");
    upstreamSocket.write(headers.join("\r\n"));
    if (head.length > 0) upstreamSocket.write(head);

    // Bidirectional pipe — both sockets close together on either side's end/error.
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);

    // Track upstream→client liveness so we only ping when truly idle. Any
    // frame from Vite (hot-update, ping, pong) bumps the timestamp.
    upstreamSocket.on("data", () => {
      lastUpstreamFrameAt = Date.now();
    });

    // Server-initiated ping. If no upstream data has flowed for
    // WS_PING_INTERVAL_MS, send a zero-payload ping to the client. The
    // browser auto-responds with a pong, which keeps the tunnel hot AND
    // forces a write on the upstream pipe (well, the response goes back to
    // the client, but the inbound write from the client→upstream pipe also
    // resets the cloudflared idle counter). Cheap, idempotent, and a no-op
    // once Vite's own HMR pings start flowing.
    pingTimer = setInterval(() => {
      if (Date.now() - lastUpstreamFrameAt < WS_PING_INTERVAL_MS) return;
      try { clientSocket.write(WS_PING_FRAME); } catch {}
    }, WS_PING_INTERVAL_MS);
    pingTimer.unref?.();
  });

  // Apply pre-connect keep-alive on the upstream socket too (handshakes can
  // be slow when the dev-server is just spun up).
  try { upstreamSocket.setKeepAlive(true, TCP_KEEPALIVE_INITIAL_DELAY_MS); } catch {}
  try { upstreamSocket.setNoDelay(true); } catch {}
  try { upstreamSocket.setTimeout(0); } catch {}

  const cleanup = (): void => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    try { upstreamSocket.destroy(); } catch {}
    try { clientSocket.destroy(); } catch {}
  };

  upstreamSocket.on("error", cleanup);
  clientSocket.on("error", cleanup);
  upstreamSocket.on("close", cleanup);
  clientSocket.on("close", cleanup);
}
