/**
 * Miscellaneous small chat routes: ai-status, traces/live, chat/status,
 * chat/history, clear chat, abort, models, auth-status.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sql } from "../../db/index.js";
import { getCopilotEngine } from "../../ai/providers/copilot.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { getActiveTrace } from "../../ai/trace-collector.js";
import { aiSettingsQueries, selectMessageContent } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";
import { projectSessions, activeRequests } from "./session-state.js";
import { ENCRYPTION_KEY } from "../../lib/secrets.js";
import { readStreamBuffer } from "./stream-buffer.js";

const aiSettingsDb = aiSettingsQueries(sql, ENCRYPTION_KEY);

export function registerMiscRoutes(app: Hono<AuthEnv>) {
  // ─── GET /projects/:id/ai-status ──
  app.use("/projects/:id/ai-status", authMiddleware);
  app.get("/projects/:id/ai-status", async (c) => {
    const projectId = c.req.param("id");
    const active = activeRequests.get(projectId);
    if (active) {
      return c.json({ active: true, mode: active.mode, startedAt: active.startedAt, elapsed: Date.now() - active.startedAt });
    }
    return c.json({ active: false });
  });

  // ─── GET /projects/:id/traces/live ──
  app.use("/projects/:id/traces/live", authMiddleware);
  app.get("/projects/:id/traces/live", async (c) => {
    const projectId = c.req.param("id");
    const active = getActiveTrace(projectId);
    if (active) {
      return c.json({ active: true, events: active.getEvents(), summary: active.getSummary() });
    }
    try {
      const [row] = await sql`
        SELECT id, events, status, duration_ms, tool_call_count, auto_continue_count,
               thinking_chars, response_chars, turn_started_at, turn_ended_at, error_message
        FROM chat_traces WHERE project_id = ${projectId}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (row) return c.json({ active: false, trace: row });
    } catch { /* non-critical */ }
    return c.json({ active: false, trace: null });
  });

  // ─── GET /projects/:id/chat/status ──
  app.get("/projects/:id/chat/status", async (c) => {
    const projectId = c.req.param("id");
    try {
      const [row] = await sql`SELECT message_id, started_at FROM ai_active_streams WHERE project_id = ${projectId}`;
      if (row) {
        const age = Date.now() - new Date(row.started_at).getTime();
        if (age > 5 * 60 * 1000) {
          sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});
          return c.json({ streaming: false });
        }
        return c.json({ streaming: true, messageId: row.message_id, startedAt: row.started_at });
      }
      return c.json({ streaming: false });
    } catch {
      return c.json({ streaming: false });
    }
  });

  // ─── GET /projects/:id/chat/stream-resume ──
  // Replay buffered SSE events for an in-flight generation after a client
  // refresh/disconnect. Does NOT affect backend generation (which runs
  // detached from the HTTP request). Returns monotonically-numbered events
  // with `seq > lastSeq`, then a terminal `complete` once generation ends.
  //
  // Query params:
  //   - messageId (required): ephemeral messageId from /chat/status
  //   - lastSeq (optional, default 0): highest seq already seen by client
  //
  // Terminal events (exactly one):
  //   - {type: "complete"}        — buffer marked done
  //   - {type: "already_complete"} — no buffer, but a saved message exists
  //                                  (client should fall back to /chat/history)
  //   - {type: "no_buffer"}        — no buffer and no saved message
  app.get("/projects/:id/chat/stream-resume", async (c) => {
    const projectId = c.req.param("id");
    const messageId = c.req.query("messageId");
    const lastSeqRaw = c.req.query("lastSeq");
    const lastSeq = Math.max(0, parseInt(lastSeqRaw ?? "0", 10) || 0);

    if (!messageId) {
      return c.json({ error: "messageId query param required" }, 400);
    }

    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let cursor = lastSeq;
      let clientGone = false;
      c.req.raw.signal.addEventListener("abort", () => { clientGone = true; });

      // Safety cap — keep the loop from running indefinitely if something
      // upstream forgets to mark the buffer done.
      const MAX_WALL_MS = 10 * 60_000; // 10 min (matches ACTIVE_TTL_MS)
      const startedAt = Date.now();

      while (!clientGone) {
        if (Date.now() - startedAt > MAX_WALL_MS) {
          try {
            await stream.writeSSE({ data: JSON.stringify({ type: "resume_timeout" }) });
          } catch { /* ignore */ }
          return;
        }

        const buf = await readStreamBuffer(messageId);

        if (!buf) {
          // Buffer missing — decide between three cases.
          // messageId here is the ephemeral stream id (NOT ai_messages.id), so
          // we check ai_active_streams to distinguish "still starting" from
          // "already completed".
          try {
            const [active] = await sql`
              SELECT message_id FROM ai_active_streams
              WHERE project_id = ${projectId} AND message_id = ${messageId}
              LIMIT 1
            `;
            if (active) {
              // Stream is registered but buffer not yet populated (race on
              // first event) — wait briefly and retry.
              await new Promise((r) => setTimeout(r, 150));
              continue;
            }
            // Not actively streaming — either the message was finalized (common
            // case) or the stream is unknown. In both cases client should
            // fall back to /chat/history to pick up the persisted message.
            await stream.writeSSE({ data: JSON.stringify({ type: "already_complete" }) });
          } catch {
            await stream.writeSSE({ data: JSON.stringify({ type: "no_buffer" }) });
          }
          return;
        }

        // Replay any new events with seq > cursor.
        for (const evt of buf.events) {
          if (evt.seq <= cursor) continue;
          try {
            await stream.writeSSE({
              data: JSON.stringify({ type: evt.type, data: evt.data, seq: evt.seq }),
            });
          } catch {
            clientGone = true;
            break;
          }
          cursor = evt.seq;
        }
        if (clientGone) return;

        if (buf.done) {
          try {
            const terminal: { type: string; error?: string } = { type: "complete" };
            if (buf.error) terminal.error = buf.error;
            await stream.writeSSE({ data: JSON.stringify(terminal) });
          } catch { /* ignore */ }
          return;
        }

        // Still generating — wait a tick and re-poll.
        await new Promise((r) => setTimeout(r, 150));
      }
    });
  });

  // ─── GET /projects/:id/chat/history ──
  // Supports cursor-based pagination:
  //   ?limit=50       — number of messages to return (default 50, max 200)
  //   ?before=<id>    — return messages older than this message id
  //   ?all=true       — return all messages (legacy compat, no pagination)
  app.get("/projects/:id/chat/history", async (c) => {
    const projectId = c.req.param("id");
    const beforeCursor = c.req.query("before") ?? null;
    const returnAll = c.req.query("all") === "true";
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);

    try {
      const [dbSession] = await sql`SELECT id FROM ai_sessions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
      if (!dbSession) return c.json({ data: [], hasMore: false });

      if (returnAll) {
        const messages = await sql`
          SELECT id, role, ${selectMessageContent(sql)} AS content,
                 tool_calls, suggestions, tool_actions, attachments,
                 sent_by_user_id, display_name, user_color, created_at,
                 version_sha, had_tool_calls, thinking_content
          FROM ai_messages WHERE session_id = ${dbSession.id}
          ORDER BY created_at ASC
        `;
        return c.json({ data: messages, hasMore: false });
      }

      // Cursor-based: get newest N messages (or N before cursor)
      let messages;
      if (beforeCursor) {
        messages = await sql`
          SELECT id, role, ${selectMessageContent(sql)} AS content,
                 tool_calls, suggestions, tool_actions, attachments,
                 sent_by_user_id, display_name, user_color, created_at,
                 version_sha, had_tool_calls, thinking_content
          FROM ai_messages
          WHERE session_id = ${dbSession.id}
            AND created_at < (SELECT created_at FROM ai_messages WHERE id = ${beforeCursor} AND session_id = ${dbSession.id})
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        // Reverse so oldest-first within the page
        messages = messages.reverse();
      } else {
        // Get the latest N messages
        messages = await sql`
          SELECT id, role, ${selectMessageContent(sql)} AS content,
                 tool_calls, suggestions, tool_actions, attachments,
                 sent_by_user_id, display_name, user_color, created_at,
                 version_sha, had_tool_calls, thinking_content
          FROM ai_messages
          WHERE session_id = ${dbSession.id}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        messages = messages.reverse();
      }

      // Check if there are older messages
      const oldestInPage = messages[0];
      let hasMore = false;
      if (oldestInPage) {
        const [older] = await sql`
          SELECT 1 FROM ai_messages
          WHERE session_id = ${dbSession.id}
            AND created_at < ${oldestInPage.created_at}
          LIMIT 1
        `;
        hasMore = !!older;
      }

      return c.json({ data: messages, hasMore });
    } catch (err) {
      console.warn("[Chat] Failed to load history from DB:", err);
      const sessionId = projectSessions.get(projectId);
      if (!sessionId) return c.json({ data: [], hasMore: false });
      try {
        const engine = await getCopilotEngine();
        const messages = await engine.getSessionMessages(sessionId);
        return c.json({ data: messages, hasMore: false });
      } catch {
        return c.json({ data: [], hasMore: false });
      }
    }
  });

  // ─── DELETE /projects/:id/chat ──
  app.delete("/projects/:id/chat", async (c) => {
    const projectId = c.req.param("id");
    const sessionId = projectSessions.get(projectId);
    if (sessionId) {
      try {
        const engine = await getCopilotEngine();
        await engine.deleteSession(sessionId);
      } catch { /* Ignore */ }
      projectSessions.delete(projectId);
    }
    try {
      const [dbSession] = await sql`SELECT id FROM ai_sessions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
      if (dbSession) await sql`DELETE FROM ai_messages WHERE session_id = ${dbSession.id}`;
    } catch (e) {
      console.warn("[Chat] Failed to clear DB messages:", e);
    }
    return c.json({ data: { cleared: true } });
  });

  // ─── POST /projects/:id/chat/abort ──
  app.post("/projects/:id/chat/abort", async (c) => {
    const projectId = c.req.param("id");
    const sessionId = projectSessions.get(projectId) ?? projectSessions.get(`${projectId}:visual-edit`);
    if (sessionId) {
      const engine = getCopilotManager().tryGetEngine(projectId);
      if (engine) {
        try { await engine.abortSession(sessionId); } catch { /* Ignore */ }
      }
    }
    return c.json({ data: { aborted: true } });
  });

  // ─── GET /ai/models ──
  // Cache + in-flight dedup so multiple AI Settings hooks (4 instances of
  // useCopilotModels per page) collapse to a single upstream Copilot API
  // call. Each upstream call is ~1.8s; without this, every AI Settings
  // visit fires 4-8 parallel calls that all wait on a slow Copilot probe.
  const MODELS_TTL_MS = 5 * 60_000;
  const modelsCache = new Map<string, { data: unknown; expires: number }>();
  const modelsInflight = new Map<string, Promise<unknown>>();
  app.get("/ai/models", async (c) => {
    const copilotAccountId = c.req.query("copilotAccountId");
    const cacheKey = `models:${copilotAccountId ?? "default"}`;

    const cached = modelsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return c.json({ data: cached.data });
    }

    let pending = modelsInflight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        let githubToken: string | undefined;
        if (copilotAccountId) {
          githubToken = (await aiSettingsDb.getCopilotAccountToken(copilotAccountId)) ?? undefined;
        }
        const manager = getCopilotManager();
        const engine = await manager.getEngine(cacheKey, githubToken);
        const models = await engine.listModels();
        modelsCache.set(cacheKey, { data: models, expires: Date.now() + MODELS_TTL_MS });
        return models;
      })().finally(() => {
        modelsInflight.delete(cacheKey);
      });
      modelsInflight.set(cacheKey, pending);
    }

    try {
      const models = await pending;
      return c.json({ data: models });
    } catch (err) {
      return c.json({ data: [], error: err instanceof Error ? err.message : "Failed to list models" });
    }
  });

  // ─── GET /chat/modes ──
  // BUG-AI-018: expose the canonical list of chat modes so the UI doesn't
  // have to hard-code them (and tester tooling can introspect them). The
  // four entries here MUST match the `mode` z.enum in send-handler.ts
  // (sendMessageSchema) — keep them in sync if a new mode is added.
  app.get("/chat/modes", async (c) => {
    return c.json({
      data: [
        {
          id: "agent",
          label: "Agent",
          description: "AI builds, edits, and runs your project using tools.",
          default: true,
        },
        {
          id: "plan",
          label: "Plan",
          description: "AI returns a structured build plan; no files written.",
        },
        {
          id: "visual-edit",
          label: "Visual Edit",
          description: "Targeted edit on a selected element in Design View.",
        },
        {
          id: "chat",
          label: "Chat",
          description: "Plain Q&A — no tool calls, no file writes.",
        },
      ],
    });
  });

  // ─── GET /ai/auth-status ──
  app.get("/ai/auth-status", async (c) => {
    try {
      const engine = await getCopilotEngine();
      const status = await engine.getAuthStatus();
      return c.json({ data: status });
    } catch (err) {
      return c.json({ data: { authenticated: false }, error: err instanceof Error ? err.message : "Auth check failed" });
    }
  });
}
