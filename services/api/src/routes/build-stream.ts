/**
 * GET /projects/:id/build/stream — per-project build-event SSE stream.
 *
 * Per devframeworkPRD/03-build-event-protocol.md §4.3 + §5.3.
 *
 * Tails the project's BuildEventBuffer outside the chat turn lifecycle.
 * Cursor semantics:
 *   ?cursor=latest  (default) — only events strictly after open
 *   ?cursor=N       — replay events with seq > N from the in-memory ring,
 *                     then transition to live tail
 *
 * Auth via the standard project-access middleware on the projects group.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { AuthEnv } from "../middleware/auth.js";
import { requireProjectAccess } from "./projects/helpers.js";
import {
  getOrCreateBuffer,
  subscribe,
  type BuildEvent,
} from "../build-events/index.js";

export const buildStreamRoutes = new Hono<AuthEnv>({ strict: false });

const KEEP_ALIVE_MS = 25_000;

buildStreamRoutes.get("/projects/:id/build/stream", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, projectId);
  if (!access) return c.text("Project not found", 404);

  const cursorParam = c.req.query("cursor") ?? "latest";
  const cursor: number | "latest" | "start" =
    cursorParam === "latest" || cursorParam === "start"
      ? cursorParam
      : (() => {
          const n = parseInt(cursorParam, 10);
          return Number.isFinite(n) ? n : "latest";
        })();

  return streamSSE(c, async (stream) => {
    const buffer = getOrCreateBuffer(projectId);

    if (cursor !== "latest") {
      const startAfter = cursor === "start" ? 0 : cursor;
      const replay = buffer.events
        .toArray()
        .filter((e) => e.seq > startAfter);
      for (const e of replay) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: e.type,
            data: (e as { data?: unknown }).data,
            seq: e.seq,
            ts: e.ts,
          }),
        });
      }
    }

    let liveQueue: BuildEvent[] = [];
    let resolveWaiter: (() => void) | null = null;
    const wakeup = (): void => {
      if (resolveWaiter) {
        const r = resolveWaiter;
        resolveWaiter = null;
        r();
      }
    };
    const unsub = subscribe(projectId, (e) => {
      liveQueue.push(e);
      wakeup();
    });

    const keepAlive = setInterval(() => {
      stream
        .writeSSE({ data: JSON.stringify({ type: "keep_alive" }) })
        .catch(() => {});
    }, KEEP_ALIVE_MS);

    let closed = false;
    stream.onAbort(() => {
      closed = true;
      unsub();
      clearInterval(keepAlive);
      wakeup();
    });

    while (!closed) {
      if (liveQueue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve;
        });
        continue;
      }
      const drain = liveQueue;
      liveQueue = [];
      for (const e of drain) {
        if (closed) break;
        await stream.writeSSE({
          data: JSON.stringify({
            type: e.type,
            data: (e as { data?: unknown }).data,
            seq: e.seq,
            ts: e.ts,
          }),
        });
      }
    }
  });
});
