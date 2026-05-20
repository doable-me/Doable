import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { teamChatQueries } from "@doable/db/queries/team-chat";
import { projectQueries } from "@doable/db/queries/projects";
import { INTERNAL_SECRET } from "../lib/secrets.js";
import { isProjectIdValid } from "./projects/helpers.js";

const teamChat = teamChatQueries(sql);
const projects = projectQueries(sql);

export const teamChatRoutes = new Hono<AuthEnv>({ strict: false });

// ─── Internal endpoints (no auth — verified via X-Internal-Secret) ────
// GET /team-chat/:projectId/internal — load history (for WS server)
teamChatRoutes.get("/:projectId/internal", async (c) => {
  const secret = c.req.header("x-internal-secret");
  if (secret !== INTERNAL_SECRET) return c.json({ error: "Forbidden" }, 403);

  const projectId = c.req.param("projectId");
  if (!isProjectIdValid(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);
  const messages = await teamChat.getHistory(projectId, limit);
  return c.json({ data: messages });
});

// POST /team-chat/:projectId/internal — internal persist endpoint (for WS server)
teamChatRoutes.post("/:projectId/internal", async (c) => {
  const secret = c.req.header("x-internal-secret");
  if (secret !== INTERNAL_SECRET) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const rawName = body.displayName ?? null;
  const message = await teamChat.saveMessage({
    id: body.id ?? crypto.randomUUID(),
    projectId: c.req.param("projectId"),
    userId: body.userId,
    displayName: rawName ? rawName.replace(/<[^>]*>/g, "").trim() || null : null,
    content: body.content,
    messageType: body.messageType ?? "user",
    mentions: body.mentions ?? [],
    parentId: body.parentId ?? null,
  });

  return c.json({ data: message });
});

// ─── Auth-protected endpoints ─────────────────────────────────────────
teamChatRoutes.use("/*", authMiddleware);

// GET /team-chat/:projectId — load chat history
teamChatRoutes.get("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  // BUG-R25-API-001: validate UUID before findById — PG's uuid column raises
  // "invalid input syntax for type uuid" on garbage which surfaces as 500
  // ISE. Mirrors the projects-list guard. Catalogued in R25 API sweep.
  if (!isProjectIdValid(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const messages = await teamChat.getHistory(projectId, limit);
  return c.json({ data: messages });
});

// POST /team-chat/:projectId — save + broadcast a message
teamChatRoutes.post("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!isProjectIdValid(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const userId = c.get("userId");
  const body = await c.req.json();

  const project = await projects.findById(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const rawDisplayName = body.displayName ?? null;
  const message = await teamChat.saveMessage({
    id: crypto.randomUUID(),
    projectId,
    userId,
    displayName: rawDisplayName ? rawDisplayName.replace(/<[^>]*>/g, "").trim() || null : null,
    content: body.content,
    messageType: body.messageType ?? "user",
    mentions: body.mentions ?? [],
    parentId: body.parentId ?? null,
  });

  // Broadcast to WS room
  const WS_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
  fetch(`${WS_URL}/internal/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
    body: JSON.stringify({
      projectId,
      message: {
        type: "chat:message",
        message: {
          id: message.id,
          projectId,
          userId,
          displayName: message.display_name,
          avatarUrl: null,
          content: message.content,
          messageType: message.message_type,
          mentions: message.mentions,
          parentId: message.parent_id,
          createdAt: message.created_at.toISOString(),
        },
      },
    }),
  }).catch((err) => console.warn("[team-chat] WS broadcast failed:", err));

  return c.json({ data: message }, 201);
});
