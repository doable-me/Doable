/**
 * AI Message Queue routes — queuing, listing, and cancelling messages.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../db/index.js";
import { broadcastToRoom } from "../../ai/yjs-bridge.js";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";

export function registerQueueRoutes(app: Hono<AuthEnv>) {
  app.use("/projects/:id/chat/queue", authMiddleware);
  app.use("/projects/:id/chat/queue/*", authMiddleware);

  // GET — list queued messages
  app.get("/projects/:id/chat/queue", async (c) => {
    const projectId = c.req.param("id");
    try {
      const queue = await sql`
        SELECT id, user_id, display_name, user_color, content, position, status, created_at
        FROM ai_message_queue
        WHERE project_id = ${projectId} AND status = 'queued'
        ORDER BY position ASC
      `;
      return c.json({ data: queue });
    } catch (err) {
      return c.json({ data: [], error: String(err) }, 500);
    }
  });

  // POST — add message to queue
  app.post(
    "/projects/:id/chat/queue",
    zValidator("json", z.object({
      content: z.string().min(1).max(32_000),
      displayName: z.string().optional(),
      userColor: z.string().optional(),
    })),
    async (c) => {
      const projectId = c.req.param("id");
      const userId = c.get("userId")!;
      const { content, displayName, userColor } = c.req.valid("json");

      try {
        const [maxPos] = await sql`
          SELECT COALESCE(MAX(position), 0) as max_pos
          FROM ai_message_queue
          WHERE project_id = ${projectId} AND status = 'queued'
        `;
        const position = (maxPos?.max_pos ?? 0) + 1;

        const [queued] = await sql`
          INSERT INTO ai_message_queue (project_id, user_id, display_name, user_color, content, position)
          VALUES (${projectId}, ${userId}, ${displayName ?? ""}, ${userColor ?? ""}, ${content}, ${position})
          RETURNING id, position
        `;

        const allQueued = await sql`
          SELECT id, user_id, display_name, content, position
          FROM ai_message_queue
          WHERE project_id = ${projectId} AND status = 'queued'
          ORDER BY position ASC
        `;
        broadcastToRoom(projectId, {
          type: "ai:queue-update",
          queue: allQueued.map((q: any) => ({
            id: q.id, userId: q.user_id, displayName: q.display_name,
            content: q.content.slice(0, 100), position: q.position,
          })),
        }).catch(() => {});

        return c.json({ data: { id: queued?.id, position: queued?.position } });
      } catch (err) {
        return c.json({ error: String(err) }, 500);
      }
    },
  );

  // DELETE — cancel a queued message
  app.delete("/projects/:id/chat/queue/:queueId", async (c) => {
    const projectId = c.req.param("id");
    const queueId = c.req.param("queueId");

    try {
      await sql`
        UPDATE ai_message_queue
        SET status = 'cancelled', completed_at = NOW()
        WHERE id = ${queueId} AND project_id = ${projectId} AND status = 'queued'
      `;

      const allQueued = await sql`
        SELECT id, user_id, display_name, content, position
        FROM ai_message_queue
        WHERE project_id = ${projectId} AND status = 'queued'
        ORDER BY position ASC
      `;
      broadcastToRoom(projectId, {
        type: "ai:queue-update",
        queue: allQueued.map((q: any) => ({
          id: q.id, userId: q.user_id, displayName: q.display_name,
          content: q.content.slice(0, 100), position: q.position,
        })),
      }).catch(() => {});

      return c.json({ data: { cancelled: true } });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}
