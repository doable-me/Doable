/**
 * NotebookLM extension bridge — slim proxy.
 *
 * The Chrome extension's Server URL is configured to the api tunnel
 * (e.g. https://staging-api.doable.me). It POSTs cookies to /sync-cookies
 * and long-polls /auth-events?user_token=<uid>. The actual NotebookLM
 * server lives on 127.0.0.1:3001 (spawned in start.sh); we forward through
 * here so the extension doesn't need its own hostname / tunnel entry.
 *
 * These routes intentionally require NO Doable Bearer token — the
 * extension has no way to obtain one. Authentication of the payload is a
 * per-user `user_token` embedded in the request body / query, which the
 * NLM server validates against its own user registry.
 */
import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";

const NLM_URL = process.env.NOTEBOOKLM_SERVICE_URL ?? "http://127.0.0.1:3001";

export const notebooklmRoutes = new Hono<AuthEnv>({ strict: false });

notebooklmRoutes.post("/sync-cookies", async (c) => {
  let body: unknown = {};
  try { body = await c.req.json(); } catch { body = {}; }
  try {
    const res = await fetch(`${NLM_URL}/sync-cookies`, {
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

notebooklmRoutes.get("/auth-events", async (c) => {
  const userToken = c.req.query("user_token") ?? "";
  try {
    const upstream = await fetch(
      `${NLM_URL}/auth-events?user_token=${encodeURIComponent(userToken)}`,
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
