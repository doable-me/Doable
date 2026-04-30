import { sql } from "../db/index.js";
import { broadcastToRoom } from "./yjs-bridge.js";
import type { TraceEvent, TraceCollectorContext } from "./trace-types.js";

// ─── Helpers ───────────────────────────────────────────────

/** Safe-stringify for DB storage — handles circular refs */
export function safeStringify(data: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    if (value instanceof Uint8Array) return `[Uint8Array(${value.length})]`;
    return value;
  });
}

/** Truncate only for DB storage of very large fields */
export function truncateForDb(s: string, maxLen = 32000): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `... [${s.length - maxLen} chars truncated]`;
}

/** Truncate tool_start/tool_end events for DB storage */
export function prepareDbEvents(events: TraceEvent[]): TraceEvent[] {
  return events.map((e) => {
    if (e.type === "tool_end" || e.type === "tool_start") {
      const d = e.data as Record<string, unknown>;
      return {
        ...e,
        data: {
          ...d,
          result: d.result != null ? truncateForDb(String(typeof d.result === "string" ? d.result : safeStringify(d.result))) : null,
          args: d.args != null ? truncateForDb(String(typeof d.args === "string" ? d.args : safeStringify(d.args))) : null,
        },
      };
    }
    return e;
  });
}

// ─── Live trace subscribers (in-memory, per project) ──────

type TraceSubscriber = (event: TraceEvent & { projectId: string }) => void;
const liveSubscribers = new Map<string, Set<TraceSubscriber>>();

/** Subscribe to live trace events for a project. Returns unsubscribe fn. */
export function subscribeLiveTrace(projectId: string, fn: TraceSubscriber): () => void {
  if (!liveSubscribers.has(projectId)) {
    liveSubscribers.set(projectId, new Set());
  }
  liveSubscribers.get(projectId)!.add(fn);
  return () => {
    liveSubscribers.get(projectId)?.delete(fn);
    if (liveSubscribers.get(projectId)?.size === 0) {
      liveSubscribers.delete(projectId);
    }
  };
}

/** Broadcast a trace event to live subscribers */
export function broadcastTraceEvent(projectId: string, event: TraceEvent): void {
  const subs = liveSubscribers.get(projectId);
  if (subs && subs.size > 0) {
    const payload = { ...event, projectId };
    for (const fn of subs) {
      try { fn(payload); } catch { /* subscriber error — ignore */ }
    }
  }
  broadcastToRoom(projectId, {
    type: "ai:trace",
    event,
  }, "system").catch(() => {});
}

// ─── Active trace registry (module-level) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeTraceRegistry = new Map<string, any>();

/** Get the active in-flight trace collector for a project, if any */
export function getActiveTrace(projectId: string) {
  return activeTraceRegistry.get(projectId) ?? null;
}

/** Remove a project from the active trace registry */
export function removeActiveTrace(projectId: string) {
  activeTraceRegistry.delete(projectId);
}

/** Register a trace collector in the active registry */
export function registerActiveTrace(projectId: string, collector: unknown): void {
  activeTraceRegistry.set(projectId, collector);
}

// ─── Console logging for trace events ──────────────────────

export function logTraceEvent(pid: string, ms: number, type: string, data: unknown): void {
  const d = data as Record<string, unknown> | null;
  switch (type) {
    case "user_message":
      console.log(`[Trace:${pid}] +${ms}ms USER_MESSAGE length=${(d as any)?.length}`);
      break;
    case "tool_start": {
      const args = JSON.stringify((d as any)?.args);
      console.log(`[Trace:${pid}] +${ms}ms TOOL_START ${(d as any)?.name} args=${args.slice(0, 2000)}${args.length > 2000 ? `... [${args.length}c total]` : ""}`);
      break;
    }
    case "tool_end": {
      const result = JSON.stringify((d as any)?.result);
      console.log(`[Trace:${pid}] +${ms}ms TOOL_END ${(d as any)?.name} duration=${(d as any)?.duration_ms}ms success=${(d as any)?.success} result=${result.slice(0, 2000)}${result.length > 2000 ? `... [${result.length}c total]` : ""}`);
      break;
    }
    case "sdk_event": {
      const sdkType = (d as any)?.sdk_type;
      if (sdkType !== "assistant.message_delta" && sdkType !== "assistant.reasoning_delta" && sdkType !== "assistant.streaming_delta") {
        const sdkData = JSON.stringify((d as any)?.data ?? {});
        console.log(`[Trace:${pid}] +${ms}ms SDK_EVENT ${sdkType} ${sdkData.slice(0, 1000)}${sdkData.length > 1000 ? `... [${sdkData.length}c]` : ""}`);
      }
      break;
    }
    case "auto_continue":
      console.log(`[Trace:${pid}] +${ms}ms AUTO_CONTINUE #${(d as any)?.count} reason=${(d as any)?.reason}`);
      break;
    case "error":
      console.error(`[Trace:${pid}] +${ms}ms ERROR [${(d as any)?.category}] ${(d as any)?.message} context=${(d as any)?.context}`);
      break;
    case "sse_emit": {
      const sseType = (d as any)?.sse_type;
      if (sseType !== "text_delta" && sseType !== "keep_alive" && sseType !== "thinking") {
        console.log(`[Trace:${pid}] +${ms}ms SSE_EMIT ${sseType} ${JSON.stringify((d as any)?.data ?? {}).slice(0, 300)}`);
      }
      break;
    }
    case "tool_manifest":
      console.log(`[Trace:${pid}] +${ms}ms TOOL_MANIFEST ${(d as any)?.filteredToolCount ?? (d as any)?.filteredTools} tools (mode=${(d as any)?.mode}) names=[${((d as any)?.toolNames ?? []).join(", ")}] mcp=${(d as any)?.mcpToolCount ?? 0} integration=${(d as any)?.integrationToolCount ?? 0} builtin=${(d as any)?.builtinToolCount ?? 0}`);
      break;
    case "config_resolved":
      console.log(`[Trace:${pid}] +${ms}ms CONFIG_RESOLVED model=${(d as any)?.model} source=${(d as any)?.modelSource} provider=${(d as any)?.provider} providerSource=${(d as any)?.providerSource} githubToken=${(d as any)?.githubTokenPresent}`);
      break;
    case "provider_resolved":
      console.log(`[Trace:${pid}] +${ms}ms PROVIDER_RESOLVED type=${(d as any)?.type} baseUrl=${(d as any)?.baseUrl} hasKey=${(d as any)?.hasApiKey} source=${(d as any)?.source}`);
      break;
    case "mcp_call":
      console.log(`[Trace:${pid}] +${ms}ms MCP_CALL [${(d as any)?.connector}] ${(d as any)?.tool} args=${JSON.stringify((d as any)?.args).slice(0, 1000)}`);
      break;
    case "mcp_result": {
      const content = JSON.stringify((d as any)?.response?.content);
      console.log(`[Trace:${pid}] +${ms}ms MCP_RESULT [${(d as any)?.connector}] ${(d as any)?.mcpTool} ${(d as any)?.durationMs}ms content=${content?.slice(0, 1000)}${(content?.length ?? 0) > 1000 ? `... [${content?.length}c]` : ""}`);
      break;
    }
    case "mcp_error":
      console.error(`[Trace:${pid}] +${ms}ms MCP_ERROR [${(d as any)?.connector}] ${(d as any)?.tool} ${(d as any)?.durationMs}ms error=${(d as any)?.error} code=${(d as any)?.errorCode}`);
      break;
    case "integration_start":
      console.log(`[Trace:${pid}] +${ms}ms INTEGRATION_START ${(d as any)?.integrationId}/${(d as any)?.actionName}`);
      break;
    case "integration_end":
      console.log(`[Trace:${pid}] +${ms}ms INTEGRATION_END ${(d as any)?.integrationId}/${(d as any)?.actionName} ${(d as any)?.durationMs}ms httpCalls=${(d as any)?.httpCallCount}`);
      break;
    case "integration_error":
      console.error(`[Trace:${pid}] +${ms}ms INTEGRATION_ERROR ${(d as any)?.integrationId}/${(d as any)?.actionName} ${(d as any)?.durationMs}ms: ${(d as any)?.error}`);
      break;
    case "integration_http": {
      const h = d as any;
      console.log(`[Trace:${pid}] +${ms}ms INTEGRATION_HTTP ${h?.method} ${h?.url} → ${h?.statusCode} ${h?.durationMs}ms reqBody=${(h?.requestBody ?? "").slice(0, 500)} resBody=${(h?.responseBody ?? "").slice(0, 500)}`);
      break;
    }
    case "integration_http_error": {
      const h = d as any;
      console.error(`[Trace:${pid}] +${ms}ms INTEGRATION_HTTP_ERROR ${h?.method} ${h?.url} ${h?.durationMs}ms: ${h?.error}`);
      break;
    }
    case "session_create":
      console.log(`[Trace:${pid}] +${ms}ms SESSION_CREATE sid=${(d as any)?.sessionId?.slice(0, 8)} model=${(d as any)?.model} provider=${(d as any)?.provider} tools=${(d as any)?.toolCount}`);
      break;
    case "session_resume":
      console.log(`[Trace:${pid}] +${ms}ms SESSION_RESUME sid=${(d as any)?.sessionId?.slice(0, 8)} fromDb=${(d as any)?.fromDb}`);
      break;
    case "session_resume_failed":
      console.error(`[Trace:${pid}] +${ms}ms SESSION_RESUME_FAILED sid=${(d as any)?.sessionId?.slice(0, 8)} error=${(d as any)?.error}`);
      break;
    case "session_evict":
      console.warn(`[Trace:${pid}] +${ms}ms SESSION_EVICT old=${(d as any)?.oldSessionId?.slice(0, 8)} reason=${(d as any)?.reason}`);
      break;
    case "session_mode_switch":
      console.log(`[Trace:${pid}] +${ms}ms SESSION_MODE_SWITCH sid=${(d as any)?.sessionId?.slice(0, 8)} ${(d as any)?.from} → ${(d as any)?.to}`);
      break;
    case "session_disconnect":
      console.log(`[Trace:${pid}] +${ms}ms SESSION_DISCONNECT sid=${(d as any)?.sessionId?.slice(0, 8)} reason=${(d as any)?.reason}`);
      break;
    case "request_start":
      console.log(`[Trace:${pid}] +${ms}ms REQUEST_START contentLength=${(d as any)?.contentLength} mode=${(d as any)?.mode} attachments=${(d as any)?.hasAttachments}`);
      break;
    case "stream_start":
      console.log(`[Trace:${pid}] +${ms}ms STREAM_START`);
      break;
    case "stream_end":
      console.log(`[Trace:${pid}] +${ms}ms STREAM_END reason=${(d as any)?.reason} frames=${(d as any)?.totalSseFrames} duration=${(d as any)?.stream_duration_ms}ms`);
      break;
    case "client_disconnect":
      console.warn(`[Trace:${pid}] +${ms}ms CLIENT_DISCONNECT elapsed=${(d as any)?.elapsed_ms}ms`);
      break;
    default:
      break;
  }
}

// ─── DB persistence helpers ────────────────────────────────

export interface TraceStreamingRow {
  ctx: TraceCollectorContext;
  turnStartedAt: number;
  eventsJson: string;
  toolCallCount: number;
  autoContinueCount: number;
  thinkingChars: number;
  responseChars: number;
  durationMs: number;
  model: string | null;
  /** OTel correlation — populated by trace-factory when an OTel span is active. */
  otelTraceId?: string | null;
  otelRootSpanId?: string | null;
}

/** Insert or update a streaming trace row (used by periodicFlush) */
export async function persistTraceStreaming(
  traceId: string | null,
  row: TraceStreamingRow,
): Promise<string | null> {
  if (!traceId) {
    const [r] = await sql`
      INSERT INTO chat_traces (
        project_id, session_id, message_id, user_id, workspace_id,
        turn_started_at,
        tool_call_count, auto_continue_count,
        thinking_chars, response_chars,
        model, events, status,
        provider, provider_label,
        otel_trace_id, otel_root_span_id
      ) VALUES (
        ${row.ctx.projectId}, ${row.ctx.sessionId ?? null}, ${row.ctx.messageId ?? null},
        ${row.ctx.userId}, ${row.ctx.workspaceId},
        ${new Date(row.turnStartedAt).toISOString()},
        ${row.toolCallCount}, ${row.autoContinueCount},
        ${row.thinkingChars}, ${row.responseChars},
        ${row.model},
        ${row.eventsJson}, ${"streaming"},
        ${row.ctx.provider ?? null}, ${row.ctx.providerLabel ?? null},
        ${row.otelTraceId ?? null}, ${row.otelRootSpanId ?? null}
      ) RETURNING id
    `;
    return r?.id ?? null;
  } else {
    await sql`
      UPDATE chat_traces
      SET events = ${row.eventsJson}::jsonb,
          tool_call_count = ${row.toolCallCount},
          auto_continue_count = ${row.autoContinueCount},
          thinking_chars = ${row.thinkingChars},
          response_chars = ${row.responseChars},
          duration_ms = ${row.durationMs},
          otel_trace_id = COALESCE(otel_trace_id, ${row.otelTraceId ?? null}),
          otel_root_span_id = COALESCE(otel_root_span_id, ${row.otelRootSpanId ?? null})
      WHERE id = ${traceId}::uuid
    `;
    return traceId;
  }
}

export interface TraceFinalRow extends TraceStreamingRow {
  turnEndedAt: number;
  ttftMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  status: string;
  errorMessage: string | null;
}

/** Finalize a trace row — UPDATE existing or INSERT new */
export async function persistTraceFinal(
  traceId: string | null,
  row: TraceFinalRow,
): Promise<string | null> {
  if (traceId) {
    await sql`
      UPDATE chat_traces SET
        session_id = ${row.ctx.sessionId ?? null},
        message_id = ${row.ctx.messageId ?? null},
        turn_ended_at = ${new Date(row.turnEndedAt).toISOString()},
        duration_ms = ${row.durationMs},
        ttft_ms = ${row.ttftMs},
        tool_call_count = ${row.toolCallCount},
        auto_continue_count = ${row.autoContinueCount},
        thinking_chars = ${row.thinkingChars},
        response_chars = ${row.responseChars},
        prompt_tokens = ${row.promptTokens},
        completion_tokens = ${row.completionTokens},
        thinking_tokens = ${row.thinkingTokens},
        total_tokens = ${row.totalTokens},
        estimated_cost_usd = ${row.estimatedCostUsd},
        model = ${row.model},
        events = ${row.eventsJson}::jsonb,
        status = ${row.status},
        error_message = ${row.errorMessage},
        otel_trace_id = COALESCE(otel_trace_id, ${row.otelTraceId ?? null}),
        otel_root_span_id = COALESCE(otel_root_span_id, ${row.otelRootSpanId ?? null})
      WHERE id = ${traceId}::uuid
    `;
    return traceId;
  } else {
    const [r] = await sql`
      INSERT INTO chat_traces (
        project_id, session_id, message_id, user_id, workspace_id,
        turn_started_at, turn_ended_at, duration_ms, ttft_ms,
        tool_call_count, auto_continue_count,
        thinking_chars, response_chars,
        prompt_tokens, completion_tokens, thinking_tokens, total_tokens,
        estimated_cost_usd, model,
        events, status, error_message,
        provider, provider_label,
        otel_trace_id, otel_root_span_id
      ) VALUES (
        ${row.ctx.projectId}, ${row.ctx.sessionId ?? null}, ${row.ctx.messageId ?? null},
        ${row.ctx.userId}, ${row.ctx.workspaceId},
        ${new Date(row.turnStartedAt).toISOString()}, ${new Date(row.turnEndedAt).toISOString()},
        ${row.durationMs}, ${row.ttftMs},
        ${row.toolCallCount}, ${row.autoContinueCount},
        ${row.thinkingChars}, ${row.responseChars},
        ${row.promptTokens}, ${row.completionTokens},
        ${row.thinkingTokens}, ${row.totalTokens},
        ${row.estimatedCostUsd}, ${row.model},
        ${row.eventsJson}, ${row.status}, ${row.errorMessage},
        ${row.ctx.provider ?? null}, ${row.ctx.providerLabel ?? null},
        ${row.otelTraceId ?? null}, ${row.otelRootSpanId ?? null}
      ) RETURNING id
    `;
    return r?.id ?? null;
  }
}
