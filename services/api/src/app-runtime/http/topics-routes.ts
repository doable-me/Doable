/**
 * Topics publish + SSE subscribe.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { appBus } from "../bus.js";
import { pinProject, unpinProject } from "../pin.js";
import { jsonError, requireRuntimeAuth } from "./auth.js";

export const topicsRoutes = new Hono({ strict: false });

topicsRoutes.options("/__doable/topics/*", (c) => {
  c.header("Access-Control-Allow-Origin", c.req.header("Origin") ?? "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, x-doable-data-api, x-doable-app-session",
  );
  return c.body(null, 204);
});

topicsRoutes.post("/__doable/topics/:name/publish", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const name = c.req.param("name");
  let body: { payload?: unknown } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    body = {};
  }
  appBus.publishTopic(auth.projectId, name, body.payload ?? {});
  return c.json({ ok: true });
});

topicsRoutes.get("/__doable/topics/:name/subscribe", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const name = c.req.param("name");
  const pinReason = `sse:${name}:${crypto.randomUUID()}`;
  pinProject(auth.projectId, pinReason);

  return streamSSE(c, async (stream) => {
    const unsub = appBus.subscribe(
      appBus.topicChannel(auth.projectId, name),
      (payload) => {
        void stream.writeSSE({
          data: JSON.stringify(payload),
          event: "message",
        });
      },
    );
    // Keepalive
    const keep = setInterval(() => {
      void stream.writeSSE({ data: "", event: "ping" });
    }, 15_000);
    try {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve());
      });
    } finally {
      clearInterval(keep);
      unsub();
      unpinProject(auth.projectId, pinReason);
    }
  });
});
