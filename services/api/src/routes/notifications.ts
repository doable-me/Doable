import { Hono } from "hono";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

const workspaces = workspaceQueries(sql);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notificationRoutes = new Hono<AuthEnv>({ strict: false });

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

function validateWorkspaceId(workspaceId: string | undefined): string | { error: string } {
  if (!workspaceId) return { error: "workspaceId query parameter is required" };
  if (!UUID_RE.test(workspaceId)) return { error: "workspaceId must be a valid UUID" };
  return workspaceId;
}

// GET /notifications?workspaceId=&limit=&unreadOnly=
notificationRoutes.get("/notifications", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const validated = validateWorkspaceId(c.req.query("workspaceId"));
  if (typeof validated !== "string") return c.json(validated, 400);
  const workspaceId = validated;

  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return c.json({ error: memberErr }, 403);

  const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const unreadOnly = c.req.query("unreadOnly") === "true" || c.req.query("unreadOnly") === "1";

  const rows = unreadOnly
    ? await sql`
        SELECT id, kind, title, body, link, is_read, created_at
        FROM notifications
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND is_read = false
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, kind, title, body, link, is_read, created_at
        FROM notifications
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  const data = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));

  return c.json({ data });
});

// GET /notifications/unread-count?workspaceId=
notificationRoutes.get("/notifications/unread-count", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const validated = validateWorkspaceId(c.req.query("workspaceId"));
  if (typeof validated !== "string") return c.json(validated, 400);
  const workspaceId = validated;

  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return c.json({ error: memberErr }, 403);

  const [row] = await sql`
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE user_id = ${userId}
      AND workspace_id = ${workspaceId}
      AND is_read = false
  `;

  return c.json({ count: row?.count ?? 0 });
});

// POST /notifications/read-all?workspaceId=
notificationRoutes.post("/notifications/read-all", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const validated = validateWorkspaceId(c.req.query("workspaceId"));
  if (typeof validated !== "string") return c.json(validated, 400);
  const workspaceId = validated;

  const memberErr = await requireMember(workspaceId, userId);
  if (memberErr) return c.json({ error: memberErr }, 403);

  await sql`
    UPDATE notifications
    SET is_read = true
    WHERE user_id = ${userId}
      AND workspace_id = ${workspaceId}
      AND is_read = false
  `;

  return c.body(null, 204);
});

// POST /notifications/:id/read
notificationRoutes.post("/notifications/:id/read", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!UUID_RE.test(id)) {
    return c.json({ error: "id must be a valid UUID" }, 400);
  }

  const [row] = await sql`
    SELECT id, user_id FROM notifications WHERE id = ${id}
  `;

  if (!row) {
    return c.json({ error: "Notification not found" }, 404);
  }
  if (row.user_id !== userId) {
    // Don't leak existence — same shape as not-found.
    return c.json({ error: "Notification not found" }, 404);
  }

  await sql`
    UPDATE notifications SET is_read = true WHERE id = ${id}
  `;

  return c.body(null, 204);
});
