/**
 * Miscellaneous small chat routes: ai-status, traces/live, chat/status,
 * chat/history, clear chat, abort, models, auth-status.
 */
import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { getCopilotEngine } from "../../ai/providers/copilot.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { getActiveTrace } from "../../ai/trace-collector.js";
import { aiSettingsQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";
import { projectSessions, activeRequests } from "./session-state.js";

const aiSettingsDb = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key");

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

  // ─── GET /projects/:id/chat/history ──
  app.get("/projects/:id/chat/history", async (c) => {
    const projectId = c.req.param("id");
    try {
      const [dbSession] = await sql`SELECT id FROM ai_sessions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
      if (!dbSession) return c.json({ data: [] });
      const messages = await sql`
        SELECT id, role, content, tool_calls, suggestions, tool_actions,
               sent_by_user_id, display_name, user_color, created_at,
               version_sha, had_tool_calls, thinking_content
        FROM ai_messages WHERE session_id = ${dbSession.id}
        ORDER BY created_at ASC
      `;
      return c.json({ data: messages });
    } catch (err) {
      console.warn("[Chat] Failed to load history from DB:", err);
      const sessionId = projectSessions.get(projectId);
      if (!sessionId) return c.json({ data: [] });
      try {
        const engine = await getCopilotEngine();
        const messages = await engine.getSessionMessages(sessionId);
        return c.json({ data: messages });
      } catch {
        return c.json({ data: [] });
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
  app.get("/ai/models", async (c) => {
    try {
      const copilotAccountId = c.req.query("copilotAccountId");
      let githubToken: string | undefined;
      if (copilotAccountId) {
        githubToken = (await aiSettingsDb.getCopilotAccountToken(copilotAccountId)) ?? undefined;
      }
      const engineKey = `models:${copilotAccountId ?? "default"}`;
      const manager = getCopilotManager();
      const engine = await manager.getEngine(engineKey, githubToken);
      const models = await engine.listModels();
      return c.json({ data: models });
    } catch (err) {
      return c.json({ data: [], error: err instanceof Error ? err.message : "Failed to list models" });
    }
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
