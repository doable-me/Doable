/**
 * Enterprise prompt / conversation audit API.
 *
 *   GET  /admin/audit/conversations          → search across all sessions
 *   GET  /admin/audit/conversations/:id      → full transcript for one session
 *   GET  /admin/audit/messages               → full-text search across messages
 *   GET  /admin/audit/actions                → admin action history
 *   GET  /admin/audit/stats                  → headline counters
 *
 * All endpoints require platform admin (enforced by middleware) and
 * record an `admin_audit_log` row so every read leaves a paper trail.
 */
import { Hono } from "hono";
import { sql } from "../db/index.js";
import { selectMessageContent } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { recordAdminAction } from "./audit-log.js";

export const adminAuditRoutes = new Hono<AuthEnv>({ strict: false });

adminAuditRoutes.use("*", authMiddleware);
adminAuditRoutes.use("*", platformAdminMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────

function clampLimit(raw: string | undefined, def = 50, max = 500): number {
  const n = parseInt(raw ?? `${def}`, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : def;
}

// ─── GET /admin/audit/conversations ───────────────────────────────────
// Filters: user_id, workspace_id, project_id, from, to, q (substring on
// most-recent message content), limit (default 50, max 500).
adminAuditRoutes.get("/audit/conversations", async (c) => {
  const userId      = c.req.query("user_id")      || null;
  const workspaceId = c.req.query("workspace_id") || null;
  const projectId   = c.req.query("project_id")   || null;
  const from        = c.req.query("from")         || null;
  const to          = c.req.query("to")           || null;
  const q           = c.req.query("q")            || null;
  const limit       = clampLimit(c.req.query("limit"), 50, 500);

  type Row = {
    session_id: string;
    project_id: string;
    project_name: string | null;
    workspace_id: string | null;
    workspace_name: string | null;
    user_id: string;
    user_email: string | null;
    user_display_name: string | null;
    mode: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    last_message_at: string | null;
    last_user_excerpt: string | null;
    last_assistant_excerpt: string | null;
  };

  const rows = await sql<Row[]>`
    WITH msg_stats AS (
      SELECT m.session_id,
             COUNT(*)::int                        AS message_count,
             MAX(m.created_at)                    AS last_message_at,
             MAX(${selectMessageContent(sql)}) FILTER (
               WHERE m.role = 'user'
             )                                    AS last_user_text,
             MAX(${selectMessageContent(sql)}) FILTER (
               WHERE m.role = 'assistant'
             )                                    AS last_assistant_text
        FROM ai_messages m
       GROUP BY m.session_id
    )
    SELECT s.id              AS session_id,
           s.project_id,
           p.name             AS project_name,
           p.workspace_id,
           w.name             AS workspace_name,
           s.user_id::text    AS user_id,
           u.email            AS user_email,
           u.display_name     AS user_display_name,
           s.mode::text       AS mode,
           s.created_at,
           s.updated_at,
           COALESCE(ms.message_count, 0) AS message_count,
           ms.last_message_at,
           LEFT(ms.last_user_text,      280) AS last_user_excerpt,
           LEFT(ms.last_assistant_text, 280) AS last_assistant_excerpt
      FROM ai_sessions  s
      LEFT JOIN msg_stats  ms ON ms.session_id = s.id
      LEFT JOIN projects   p  ON p.id::text = s.project_id
      LEFT JOIN workspaces w  ON w.id   = p.workspace_id
      LEFT JOIN users      u  ON u.id::text = s.user_id
     WHERE (${userId}::text       IS NULL OR s.user_id       = ${userId}::text)
       AND (${workspaceId}::uuid IS NULL OR p.workspace_id  = ${workspaceId}::uuid)
       AND (${projectId}::text   IS NULL OR s.project_id    = ${projectId}::text)
       AND (${from}::timestamptz IS NULL OR s.updated_at   >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR s.updated_at   <= ${to}::timestamptz)
       AND (${q}::text           IS NULL OR EXISTS (
              SELECT 1 FROM ai_messages mm
               WHERE mm.session_id = s.id
                 AND ${selectMessageContent(sql)} ILIKE '%' || ${q}::text || '%'
            ))
     ORDER BY COALESCE(ms.last_message_at, s.updated_at) DESC NULLS LAST
     LIMIT ${limit}
  `;

  await recordAdminAction(c, {
    action: "audit.conversations.search",
    details: {
      filters: { user_id: userId, workspace_id: workspaceId, project_id: projectId, from, to, q },
      result_count: rows.length,
      limit,
    },
    targetUserId: userId,
    targetWorkspaceId: workspaceId,
    targetProjectId: projectId,
  });

  return c.json({ conversations: rows, total: rows.length, limit });
});

// ─── GET /admin/audit/conversations/:sessionId ────────────────────────
// Full transcript: session metadata + all messages in chronological order.
adminAuditRoutes.get("/audit/conversations/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  const [session] = await sql<
    Array<{
      session_id: string;
      project_id: string;
      project_name: string | null;
      workspace_id: string | null;
      workspace_name: string | null;
      user_id: string;
      user_email: string | null;
      user_display_name: string | null;
      mode: string;
      created_at: string;
      updated_at: string;
    }>
  >`
    SELECT s.id           AS session_id,
           s.project_id,
           p.name          AS project_name,
           p.workspace_id,
           w.name          AS workspace_name,
           s.user_id::text AS user_id,
           u.email         AS user_email,
           u.display_name  AS user_display_name,
           s.mode::text    AS mode,
           s.created_at,
           s.updated_at
      FROM ai_sessions  s
      LEFT JOIN projects   p ON p.id::text = s.project_id
      LEFT JOIN workspaces w ON w.id = p.workspace_id
      LEFT JOIN users      u ON u.id::text = s.user_id
     WHERE s.id = ${sessionId}::uuid
  `;

  if (!session) return c.json({ error: "Session not found" }, 404);

  const messages = await sql<
    Array<{
      id: string;
      role: string;
      content: string | null;
      tool_calls: unknown;
      tool_actions: unknown;
      thinking_content: string | null;
      had_tool_calls: boolean | null;
      version_sha: string | null;
      sent_by_user_id: string | null;
      display_name: string | null;
      user_color: string | null;
      created_at: string;
    }>
  >`
    SELECT id, role::text AS role,
           ${selectMessageContent(sql)} AS content,
           tool_calls, tool_actions, thinking_content,
           had_tool_calls, version_sha,
           sent_by_user_id::text AS sent_by_user_id,
           display_name, user_color, created_at
      FROM ai_messages
     WHERE session_id = ${sessionId}::uuid
     ORDER BY created_at ASC, id ASC
  `;

  await recordAdminAction(c, {
    action: "audit.conversation.view",
    resourceType: "session",
    resourceId: sessionId,
    targetUserId: session.user_id,
    targetWorkspaceId: session.workspace_id,
    targetProjectId: session.project_id,
    details: { message_count: messages.length },
  });

  return c.json({ session, messages });
});

// ─── GET /admin/audit/messages ────────────────────────────────────────
// Substring search at message granularity (independent of session).
// Useful for compliance keyword scans.
adminAuditRoutes.get("/audit/messages", async (c) => {
  const q           = c.req.query("q")            || null;
  const role        = c.req.query("role")         || null;
  const userId      = c.req.query("user_id")      || null;
  const workspaceId = c.req.query("workspace_id") || null;
  const from        = c.req.query("from")         || null;
  const to          = c.req.query("to")           || null;
  const limit       = clampLimit(c.req.query("limit"), 100, 500);

  if (!q || q.length < 2) {
    return c.json({ error: "Query parameter `q` is required (min 2 chars)" }, 400);
  }

  const rows = await sql<
    Array<{
      id: string;
      session_id: string;
      role: string;
      excerpt: string;
      created_at: string;
      user_id: string | null;
      user_email: string | null;
      project_id: string | null;
      project_name: string | null;
      workspace_id: string | null;
    }>
  >`
    SELECT m.id,
           m.session_id::text       AS session_id,
           m.role::text             AS role,
           LEFT(${selectMessageContent(sql)}, 400) AS excerpt,
           m.created_at,
           s.user_id::text          AS user_id,
           u.email                  AS user_email,
           s.project_id::text       AS project_id,
           p.name                   AS project_name,
           p.workspace_id::text     AS workspace_id
      FROM ai_messages m
      JOIN ai_sessions s ON s.id = m.session_id
      LEFT JOIN projects p ON p.id::text = s.project_id
      LEFT JOIN users    u ON u.id::text = s.user_id
     WHERE ${selectMessageContent(sql)} ILIKE '%' || ${q}::text || '%'
       AND (${role}::text        IS NULL OR m.role::text     = ${role}::text)
       AND (${userId}::text      IS NULL OR s.user_id        = ${userId}::text)
       AND (${workspaceId}::uuid IS NULL OR p.workspace_id   = ${workspaceId}::uuid)
       AND (${from}::timestamptz IS NULL OR m.created_at    >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR m.created_at    <= ${to}::timestamptz)
     ORDER BY m.created_at DESC
     LIMIT ${limit}
  `;

  await recordAdminAction(c, {
    action: "audit.messages.search",
    details: {
      filters: { q, role, user_id: userId, workspace_id: workspaceId, from, to },
      result_count: rows.length,
      limit,
    },
    targetUserId: userId,
    targetWorkspaceId: workspaceId,
  });

  return c.json({ messages: rows, total: rows.length, limit });
});

// ─── GET /admin/audit/actions ─────────────────────────────────────────
// History of admin actions taken against the audit surfaces.
adminAuditRoutes.get("/audit/actions", async (c) => {
  const actorId  = c.req.query("actor_id")  || null;
  const action   = c.req.query("action")    || null;
  const targetUserId      = c.req.query("target_user_id")      || null;
  const targetWorkspaceId = c.req.query("target_workspace_id") || null;
  const from     = c.req.query("from")      || null;
  const to       = c.req.query("to")        || null;
  const limit    = clampLimit(c.req.query("limit"), 100, 500);

  const rows = await sql<
    Array<{
      id: string;
      ts: string;
      actor_id: string;
      actor_email: string | null;
      actor_role: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      target_user_id: string | null;
      target_workspace_id: string | null;
      target_project_id: string | null;
      details: unknown;
      client_ip: string | null;
      user_agent: string | null;
      actor_display_name: string | null;
    }>
  >`
    SELECT a.id::text       AS id,
           a.ts, a.actor_id, a.actor_email, a.actor_role,
           a.action, a.resource_type, a.resource_id,
           a.target_user_id, a.target_workspace_id, a.target_project_id,
           a.details, a.client_ip::text AS client_ip, a.user_agent,
           u.display_name   AS actor_display_name
      FROM admin_audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
     WHERE (${actorId}::uuid          IS NULL OR a.actor_id           = ${actorId}::uuid)
       AND (${action}::text           IS NULL OR a.action             = ${action}::text)
       AND (${targetUserId}::uuid     IS NULL OR a.target_user_id     = ${targetUserId}::uuid)
       AND (${targetWorkspaceId}::uuid IS NULL OR a.target_workspace_id = ${targetWorkspaceId}::uuid)
       AND (${from}::timestamptz      IS NULL OR a.ts                 >= ${from}::timestamptz)
       AND (${to}::timestamptz        IS NULL OR a.ts                 <= ${to}::timestamptz)
     ORDER BY a.ts DESC
     LIMIT ${limit}
  `;

  // Recursive: querying the audit log is itself an audited action.
  await recordAdminAction(c, {
    action: "audit.actions.search",
    details: {
      filters: {
        actor_id: actorId, action, target_user_id: targetUserId,
        target_workspace_id: targetWorkspaceId, from, to,
      },
      result_count: rows.length,
    },
  });

  return c.json({ actions: rows, total: rows.length, limit });
});

// ─── GET /admin/audit/stats ───────────────────────────────────────────
adminAuditRoutes.get("/audit/stats", async (c) => {
  const [counts] = await sql<
    Array<{
      total_sessions: number;
      total_messages: number;
      total_users: number;
      messages_24h: number;
      messages_7d: number;
      sessions_24h: number;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM ai_sessions)                                          AS total_sessions,
      (SELECT COUNT(*)::int FROM ai_messages)                                          AS total_messages,
      (SELECT COUNT(DISTINCT user_id)::int FROM ai_sessions)                           AS total_users,
      (SELECT COUNT(*)::int FROM ai_messages WHERE created_at >= now() - interval '24 hours') AS messages_24h,
      (SELECT COUNT(*)::int FROM ai_messages WHERE created_at >= now() - interval '7 days')   AS messages_7d,
      (SELECT COUNT(*)::int FROM ai_sessions WHERE updated_at  >= now() - interval '24 hours') AS sessions_24h
  `;

  await recordAdminAction(c, { action: "audit.stats.view" });

  return c.json(counts ?? {
    total_sessions: 0, total_messages: 0, total_users: 0,
    messages_24h: 0, messages_7d: 0, sessions_24h: 0,
  });
});
