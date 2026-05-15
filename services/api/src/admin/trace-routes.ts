/**
 * Admin Trace API
 *
 * Search + bundle endpoints for the /admin/trace UI.
 *
 *   GET /admin/traces/search   → filterable list of traces
 *   GET /admin/traces/:traceId → bundle (trace + spans + logs + chat_trace)
 *
 * Both endpoints require platform admin (workspace_owner/member tenant
 * scoping is a TODO once we wire role-based filtering — see comment below).
 *
 * Every detail view is recorded into trace_view_audit so privacy-sensitive
 * access leaves a paper trail. Search is intentionally NOT audited per row,
 * but does record a single audit row tagged with `reason='search'`.
 */
import { Hono } from "hono";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

export const adminTraceRoutes = new Hono<AuthEnv>({ strict: false });

adminTraceRoutes.use("*", authMiddleware);
adminTraceRoutes.use("*", platformAdminMiddleware);

// ─── Helpers ─────────────────────────────────────────────────────────

function pickClientIp(headerValue: string | undefined, fwd: string | undefined): string | null {
  if (headerValue) return headerValue;
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return null;
}

// ─── GET /admin/traces/search ────────────────────────────────────────
// Query params (all optional):
//   user_id, workspace_id, project_id, status, from (ISO), to (ISO),
//   q (substring against root_span_name), limit (default 100, max 500)
adminTraceRoutes.get("/traces/search", async (c) => {
  const viewerId = c.get("userId");
  const viewerEmail = c.get("userEmail");

  const userId = c.req.query("user_id") || null;
  const workspaceId = c.req.query("workspace_id") || null;
  const projectId = c.req.query("project_id") || null;
  const status = c.req.query("status") || null;
  const from = c.req.query("from") || null;
  const to = c.req.query("to") || null;
  const q = c.req.query("q") || null;
  const limitRaw = parseInt(c.req.query("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(500, limitRaw))
    : 100;

  // TODO: when this endpoint is opened up beyond platform admin, filter
  //   workspaceId/userId by viewer's role to hide cross-tenant traces.
  //   For now, platform-admin-only (enforced by middleware) — full visibility.
  const rows = await sql<
    Array<{
      trace_id: string;
      started_at: string;
      ended_at: string | null;
      duration_ms: number | null;
      workspace_id: string | null;
      user_id: string | null;
      project_id: string | null;
      root_span_name: string | null;
      status: string;
      error_count: number;
      span_count: number;
      services: string[];
    }>
  >`
    SELECT trace_id, started_at, ended_at, duration_ms,
           workspace_id, user_id, project_id, root_span_name,
           status, error_count, span_count, services
      FROM traces
     WHERE (${userId}::uuid IS NULL OR user_id = ${userId}::uuid)
       AND (${workspaceId}::uuid IS NULL OR workspace_id = ${workspaceId}::uuid)
       AND (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
       AND (${status}::text IS NULL OR status = ${status}::text)
       AND (${from}::timestamptz IS NULL OR started_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR started_at <= ${to}::timestamptz)
       AND (${q}::text IS NULL OR root_span_name ILIKE '%' || ${q}::text || '%')
     ORDER BY started_at DESC
     LIMIT ${limit}
  `;

  // Audit the search itself (one row per call, not per result).
  await sql`
    INSERT INTO trace_view_audit
      (viewer_id, viewer_email, viewer_role, trace_id, workspace_id, reason, client_ip, user_agent)
    VALUES
      (${viewerId}::uuid, ${viewerEmail}, 'platform_admin', NULL,
       ${workspaceId}::uuid, ${"search"}, ${pickClientIp(c.req.header("cf-connecting-ip"), c.req.header("x-forwarded-for"))}::inet,
       ${c.req.header("user-agent") ?? null})
  `.catch(() => undefined); // never fail the request if audit insert fails

  return c.json({ traces: rows, total: rows.length });
});

// ─── GET /admin/traces/:traceId ──────────────────────────────────────
// Returns the bundled view: trace header + ordered spans + correlated
// logs + linked chat_trace (if any). Implements PRD §06 sample query #6.
adminTraceRoutes.get("/traces/:traceId", async (c) => {
  const viewerId = c.get("userId");
  const viewerEmail = c.get("userEmail");
  const traceId = c.req.param("traceId");

  if (!traceId || !/^[0-9a-f]{16,}$/i.test(traceId)) {
    return c.json({ error: "Invalid trace_id" }, 400);
  }

  const [trace] = await sql<
    Array<{
      trace_id: string;
      started_at: string;
      ended_at: string | null;
      duration_ms: number | null;
      workspace_id: string | null;
      user_id: string | null;
      project_id: string | null;
      root_span_name: string | null;
      status: string;
      error_count: number;
      span_count: number;
      services: string[];
    }>
  >`
    SELECT trace_id, started_at, ended_at, duration_ms,
           workspace_id, user_id, project_id, root_span_name,
           status, error_count, span_count, services
      FROM traces
     WHERE trace_id = ${traceId}
  `;

  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  const spans = await sql<
    Array<{
      span_id: string;
      trace_id: string;
      parent_span_id: string | null;
      name: string;
      service: string;
      kind: string | null;
      started_at: string;
      ended_at: string | null;
      duration_ms: number | null;
      status_code: string;
      status_message: string | null;
      attributes: Record<string, unknown> | null;
      events: unknown[] | null;
      exception: Record<string, unknown> | null;
    }>
  >`
    SELECT span_id, trace_id, parent_span_id, name, service, kind,
           started_at, ended_at, duration_ms, status_code, status_message,
           attributes, events, exception
      FROM spans
     WHERE trace_id = ${traceId}
     ORDER BY started_at ASC
  `;

  const logs = await sql<
    Array<{
      id: string;
      ts: string;
      trace_id: string | null;
      span_id: string | null;
      service: string;
      level: string;
      message: string;
      attributes: Record<string, unknown> | null;
    }>
  >`
    SELECT id::text, ts, trace_id, span_id, service, level, message, attributes
      FROM trace_logs
     WHERE trace_id = ${traceId}
     ORDER BY ts ASC
     LIMIT 2000
  `;

  const [chatTrace] = await sql<
    Array<{
      id: string;
      project_id: string | null;
      user_id: string | null;
      session_id: string | null;
      created_at: string;
      otel_trace_id: string | null;
      otel_root_span_id: string | null;
    }>
  >`
    SELECT id, project_id, user_id, session_id, created_at,
           otel_trace_id, otel_root_span_id
      FROM chat_traces
     WHERE otel_trace_id = ${traceId}
     LIMIT 1
  `.catch(() => [] as never[]);

  // Audit the detail view.
  await sql`
    INSERT INTO trace_view_audit
      (viewer_id, viewer_email, viewer_role, trace_id, workspace_id, reason, client_ip, user_agent)
    VALUES
      (${viewerId}::uuid, ${viewerEmail}, 'platform_admin',
       ${traceId}, ${trace.workspace_id}::uuid, ${"detail_view"},
       ${pickClientIp(c.req.header("cf-connecting-ip"), c.req.header("x-forwarded-for"))}::inet, ${c.req.header("user-agent") ?? null})
  `.catch(() => undefined);

  return c.json({
    trace,
    spans,
    logs,
    chat_trace: chatTrace ?? null,
  });
});
