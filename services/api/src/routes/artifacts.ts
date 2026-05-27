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

const artifacts = new Hono({ strict: false });

artifacts.get("/:id{.+}", (c) => {
  // Strip any extension the client appended (e.g. /artifacts/abc.pptx).
  const raw = c.req.param("id");
  if (!raw) return c.text("Not found", 404);
  const id = raw.split(".")[0];
  if (!id) return c.text("Not found", 404);
  const entry = store.get(id);
  if (!entry) return c.text("Not found", 404);

  // Default to forced download (preserves chat download-card UX). Pass
  // `?inline=1` to render in-browser (e.g. for opening the deck in a new
  // tab). Live editor preview no longer uses this endpoint — the deck is
  // persisted to the project's index.html and served via /preview/.
  const inline = c.req.query("inline") === "1";
  const safeName = entry.fileName.replace(/"/g, "");
  const headers: Record<string, string> = {
    "content-type": entry.mimeType,
    "content-length": String(entry.bytes.length),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "cache-control": "private, max-age=3600",
  };
  if (inline) {
    // Derive the install's own apex from env (set by deploy to the operator's
    // zone) so a self-hoster's web origin can frame its own artifacts. Falls
    // back to doable.me only for source-tree dev runs with no env set.
    const apex = process.env.DOABLE_DOMAIN || "doable.me";
    headers["x-frame-options"] = "ALLOWALL";
    headers["content-security-policy"] =
      `frame-ancestors 'self' https://*.${apex} https://${apex} http://localhost:* http://127.0.0.1:*`;
  }
  return new Response(new Uint8Array(entry.bytes), { headers });
});

export default artifacts;
