import { createConnection, type Socket } from "node:net";
import type { IncomingMessage } from "node:http";
import { getDevServerInternalUrl } from "../../projects/dev-server.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX_RE = /^\/preview\/([0-9a-f-]+)(\/.*)?$/i;

/**
 * Handle an HTTP upgrade request for a /preview/:projectId/* path.
 * Forwards the WebSocket handshake to the per-project dev-server.
 *
 * Per devframeworkPRD/STATUS-2026-05-02.md gap #1 — Next.js HMR uses
 * /_next/webpack-hmr (WebSocket); without WS forwarding the editor has
 * to manually F5 after every edit.
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

  const upstreamSocket = createConnection({ host, port }, () => {
    // Replay the upgrade request line + headers verbatim. Hop-by-hop
    // headers like Connection: Upgrade are already in req.headers.
    const headers: string[] = [`${req.method ?? "GET"} ${url} HTTP/1.1`];
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
  });

  const cleanup = (): void => {
    try { upstreamSocket.destroy(); } catch {}
    try { clientSocket.destroy(); } catch {}
  };

  upstreamSocket.on("error", cleanup);
  clientSocket.on("error", cleanup);
  upstreamSocket.on("close", cleanup);
  clientSocket.on("close", cleanup);
}
