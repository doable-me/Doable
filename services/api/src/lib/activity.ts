import type postgres from "postgres";
import { INTERNAL_SECRET } from "./secrets.js";

const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";

/**
 * Emit an activity event — persists to DB and broadcasts to WS room.
 * Fire-and-forget: never blocks the caller.
 */
export function emitActivity(
  sql: postgres.Sql,
  data: {
    projectId: string;
    userId: string;
    displayName?: string | null;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Persist to database (fire and forget)
  sql`
    INSERT INTO activity_events (id, project_id, user_id, display_name, event_type, summary, metadata)
    VALUES (
      ${id}, ${data.projectId}, ${data.userId},
      ${data.displayName ?? null}, ${data.eventType},
      ${data.summary}, ${data.metadata ? sql.json(data.metadata as Record<string, string | number | boolean | null>) : null}
    )
  `.catch((err: unknown) => console.warn("[activity] DB save failed:", err));

  // 2. Broadcast to WS room via internal endpoint (fire and forget)
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({
      projectId: data.projectId,
      message: {
        type: "activity:event",
        event: {
          id,
          projectId: data.projectId,
          userId: data.userId,
          displayName: data.displayName ?? null,
          avatarUrl: null,
          eventType: data.eventType,
          summary: data.summary,
          metadata: data.metadata,
          createdAt: now,
        },
      },
    }),
  }).catch((err: unknown) => console.warn("[activity] WS broadcast failed:", err));
}
