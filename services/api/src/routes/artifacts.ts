/**
 * In-memory artifact store + GET endpoint.
 *
 * Used to off-load large binary payloads (e.g. generated PPTX, HTML decks)
 * out of SSE events. The MCP presentation-builder embeds the file as a
 * base64 data: URI inside a `ui://` rawHtml resource. When the resulting
 * SSE event is huge (>~50KB), Cloudflare Tunnel buffering can drop or
 * delay the event past the connection lifetime — the client never sees
 * the download card.
 *
 * To avoid that, the chat tool-callbacks rewrite oversize data: URIs
 * inside the rawHtml to point at this endpoint, after stashing the bytes
 * here. The resulting SSE event is small (~few KB) and flows through
 * cloudflared without issues.
 */
import { Hono } from "hono";

type Stored = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  createdAt: number;
};

const store = new Map<string, Stored>();
const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;

function gc() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k);
  }
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const remove = sorted.slice(0, store.size - MAX_ENTRIES);
    for (const [k] of remove) store.delete(k);
  }
}

export function storeArtifact(opts: { bytes: Buffer; mimeType: string; fileName: string }): string {
  gc();
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  store.set(id, { ...opts, createdAt: Date.now() });
  return id;
}

const artifacts = new Hono();

artifacts.get("/:id{.+}", (c) => {
  // Strip any extension the client appended (e.g. /artifacts/abc.pptx).
  const raw = c.req.param("id");
  const id = raw.split(".")[0];
  const entry = store.get(id);
  if (!entry) return c.text("Not found", 404);
  return new Response(new Uint8Array(entry.bytes), {
    headers: {
      "content-type": entry.mimeType,
      "content-length": String(entry.bytes.length),
      "content-disposition": `attachment; filename="${entry.fileName.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});

export default artifacts;
