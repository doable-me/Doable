/**
 * NotebookLM connector routes (POC).
 *
 *  - POST /sync-cookies                 : proxy the Chrome extension's cookie
 *                                         sync to the standalone NotebookLM MCP
 *                                         service (kept on the api so it rides
 *                                         the existing staging-api tunnel).
 *  - GET  /integrations/notebooklm/link : returns the logged-in user's link
 *                                         token + Server URL to paste into the
 *                                         extension.
 */
import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import {
  notebooklmLinkToken,
  NOTEBOOKLM_SYNC_BASE,
  NOTEBOOKLM_SERVICE_URL,
} from "../integrations/notebooklm-link.js";

export const notebooklmRoutes = new Hono<AuthEnv>({ strict: false });

notebooklmRoutes.post("/sync-cookies", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  try {
    const res = await fetch(`${NOTEBOOKLM_SERVICE_URL}/sync-cookies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": c.req.header("User-Agent") ?? "",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

// SSE channel the extension listens on for server-pushed events (re-auth AND
// fetch-image). Proxied through the api so it rides the staging-api tunnel to
// the standalone NotebookLM service. `await fetch` resolves once the stream
// starts; we hand the ongoing body straight back to the EventSource.
notebooklmRoutes.get("/auth-events", async (c) => {
  const userToken = c.req.query("user_token") ?? "";
  try {
    const upstream = await fetch(
      `${NOTEBOOKLM_SERVICE_URL}/auth-events?user_token=${encodeURIComponent(userToken)}`,
      { headers: { Accept: "text/event-stream" } },
    );
    if (!upstream.ok || !upstream.body) {
      return c.text("auth-events upstream error", 502);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return c.text("auth-events proxy error: " + (e as Error).message, 502);
  }
});

// The extension POSTs infographic bytes it fetched in the user's authenticated
// browser (the server's headless fetch can't pass Google's auth gateway).
notebooklmRoutes.post("/infographic-bytes", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  try {
    const res = await fetch(`${NOTEBOOKLM_SERVICE_URL}/infographic-bytes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message }, 502);
  }
});

// Browser-facing image proxy. generate_infographic returns
// image_url = `${NOTEBOOKLM_SYNC_BASE}/notebooklm/image/<jobId>`; this streams the
// already-downloaded bytes from the standalone service so the app can <img src> it.
notebooklmRoutes.get("/notebooklm/image/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const res = await fetch(`${NOTEBOOKLM_SERVICE_URL}/image/${encodeURIComponent(jobId)}`);
    if (!res.ok) return c.text("Infographic not found", 404);
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return c.text("image proxy error: " + (e as Error).message, 502);
  }
});

// The branch NotebookLM server serves the completed infographic at
// GET /infographic-image/:jobId and returns
// image_url = `${NOTEBOOKLM_PUBLIC_URL}/infographic-image/<jobId>`
// (NOTEBOOKLM_PUBLIC_URL = https://staging-api.doable.me/notebooklm), so generated
// apps request /notebooklm/infographic-image/<jobId>. The old /notebooklm/image
// route above proxies to the POC's /image/ path, which the branch renamed — so
// without this route the app's <img> 401s and the infographic shows "loading"
// forever. Public (no auth) so a browser <img src> can load it directly.
notebooklmRoutes.get("/notebooklm/infographic-image/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const res = await fetch(`${NOTEBOOKLM_SERVICE_URL}/infographic-image/${encodeURIComponent(jobId)}`);
    if (!res.ok) return c.text("Infographic not found", 404);
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return c.text("image proxy error: " + (e as Error).message, 502);
  }
});

notebooklmRoutes.get("/integrations/notebooklm/link", authMiddleware, (c) => {
  const userId = c.get("userId");
  return c.json({
    server_url: NOTEBOOKLM_SYNC_BASE,
    link_token: notebooklmLinkToken(userId),
    instructions:
      "In the NotebookLM Chrome extension set Server URL + User Token to these values, then click Sync Cookies.",
  });
});
