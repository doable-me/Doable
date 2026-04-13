/**
 * Chat Traces / Observability routes.
 */
import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";

export function registerTraceRoutes(app: Hono<AuthEnv>) {
  /** List traces for a project (summary view, no events blob) */
  app.get("/projects/:id/traces", authMiddleware, async (c) => {
    const projectId = c.req.param("id");
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const status = c.req.query("status");

    try {
      const rows = status
        ? await sql`
            SELECT id, project_id, session_id, message_id, user_id,
                   turn_started_at, turn_ended_at, duration_ms, ttft_ms,
                   tool_call_count, auto_continue_count,
                   thinking_chars, response_chars,
                   prompt_tokens, completion_tokens, thinking_tokens, total_tokens,
                   estimated_cost_usd, model, status, error_message,
                   provider, provider_label, created_at
            FROM chat_traces
            WHERE project_id = ${projectId} AND status = ${status}
            ORDER BY turn_started_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT id, project_id, session_id, message_id, user_id,
                   turn_started_at, turn_ended_at, duration_ms, ttft_ms,
                   tool_call_count, auto_continue_count,
                   thinking_chars, response_chars,
                   prompt_tokens, completion_tokens, thinking_tokens, total_tokens,
                   estimated_cost_usd, model, status, error_message,
                   provider, provider_label, created_at
            FROM chat_traces
            WHERE project_id = ${projectId}
            ORDER BY turn_started_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;
      return c.json({ data: rows });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  /** Get a single trace with full events array */
  app.get("/projects/:id/traces/:traceId", authMiddleware, async (c) => {
    const projectId = c.req.param("id");
    const traceId = c.req.param("traceId");
    try {
      const [row] = await sql`
        SELECT * FROM chat_traces
        WHERE id = ${traceId} AND project_id = ${projectId}
      `;
      if (!row) return c.json({ error: "Trace not found" }, 404);
      return c.json({ data: row });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  /** Get trace stats for a project (aggregate summary) */
  app.get("/projects/:id/trace-stats", authMiddleware, async (c) => {
    const projectId = c.req.param("id");
    try {
      const [stats] = await sql`
        SELECT
          COUNT(*)::int AS total_traces,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
          COUNT(*) FILTER (WHERE status = 'stalled')::int AS stalled,
          COUNT(*) FILTER (WHERE status = 'aborted')::int AS aborted,
          AVG(duration_ms)::int AS avg_duration_ms,
          AVG(ttft_ms)::int AS avg_ttft_ms,
          SUM(tool_call_count)::int AS total_tool_calls,
          SUM(auto_continue_count)::int AS total_auto_continues,
          SUM(total_tokens)::int AS total_tokens,
          SUM(estimated_cost_usd)::numeric(10,4) AS total_cost_usd,
          AVG(tool_call_count)::numeric(10,1) AS avg_tools_per_turn,
          MAX(duration_ms)::int AS max_duration_ms,
          MIN(turn_started_at) AS first_trace,
          MAX(turn_started_at) AS last_trace
        FROM chat_traces
        WHERE project_id = ${projectId}
      `;
      return c.json({ data: stats });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}
