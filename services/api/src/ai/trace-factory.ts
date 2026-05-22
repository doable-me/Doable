import type { TraceCollectorContext, TraceEvent, TraceUsageSummary } from "./trace-types.js";
import { categorizeError } from "./trace-types.js";
import {
  safeStringify,
  prepareDbEvents,
  broadcastTraceEvent,
  logTraceEvent,
  registerActiveTrace,
  removeActiveTrace,
  persistTraceStreaming,
  persistTraceFinal,
} from "./trace-infra.js";
import { SpanKind, SpanStatusCode, type Span, type Attributes } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";
import { scrubSecrets } from "../tracing/secret-patterns.js";

// Map a chat_traces event type + payload to OTel-conventional attributes.
// Returns null to skip emitting the event (high-volume noise types).
function eventToOtelAttrs(type: string, data: unknown): Attributes | null {
  const d = data as Record<string, unknown> | null;
  if (!d) return {};
  switch (type) {
    case "text_delta":
    case "thinking_delta":
      return null;
    case "sdk_event": {
      const sdkType = d.sdk_type as string | undefined;
      if (sdkType === "assistant.message_delta" || sdkType === "assistant.reasoning_delta" || sdkType === "assistant.streaming_delta") return null;
      return { "ai.sdk.type": sdkType ?? "unknown", "ai.sdk.seq": Number(d.seq ?? 0) };
    }
    case "mcp_call":
      return {
        "mcp.connector": String(d.connector ?? ""),
        "mcp.tool": String(d.tool ?? ""),
        "mcp.args.size": JSON.stringify(d.args ?? {}).length,
      };
    case "mcp_result": {
      const resp = d.response as { contentLength?: number; isError?: boolean } | undefined;
      return {
        "mcp.connector": String(d.connector ?? ""),
        "mcp.tool": String(d.mcpTool ?? ""),
        "mcp.duration_ms": Number(d.durationMs ?? 0),
        "mcp.result.is_error": Boolean(resp?.isError),
        "mcp.result.content_count": Number(resp?.contentLength ?? 0),
      };
    }
    case "mcp_error":
      return {
        "mcp.connector": String(d.connector ?? ""),
        "mcp.tool": String(d.tool ?? ""),
        "mcp.duration_ms": Number(d.durationMs ?? 0),
        "mcp.error.code": Number(d.errorCode ?? 0),
        "mcp.error.message": scrubSecrets(String(d.error ?? "")).slice(0, 500),
      };
    case "tool_start":
      return { "ai.tool.name": String(d.name ?? ""), "ai.tool.seq": Number(d.tool_seq ?? 0) };
    case "tool_end":
      return {
        "ai.tool.name": String(d.name ?? ""),
        "ai.tool.duration_ms": Number(d.duration_ms ?? 0),
        "ai.tool.success": Boolean(d.success),
      };
    case "integration_start":
      return { "integration.id": String(d.integrationId ?? ""), "integration.action": String(d.actionName ?? "") };
    case "integration_end":
      return {
        "integration.id": String(d.integrationId ?? ""),
        "integration.action": String(d.actionName ?? ""),
        "integration.duration_ms": Number(d.durationMs ?? 0),
        "integration.http_calls": Number(d.httpCallCount ?? 0),
      };
    case "integration_error":
      return {
        "integration.id": String(d.integrationId ?? ""),
        "integration.action": String(d.actionName ?? ""),
        "integration.duration_ms": Number(d.durationMs ?? 0),
        "error.message": scrubSecrets(String(d.error ?? "")).slice(0, 500),
      };
    case "integration_http":
      return {
        "http.method": String(d.method ?? ""),
        "http.url": scrubSecrets(String(d.url ?? "")).slice(0, 500),
        "http.status_code": Number(d.statusCode ?? 0),
        "http.duration_ms": Number(d.durationMs ?? 0),
      };
    case "integration_http_error":
      return {
        "http.method": String(d.method ?? ""),
        "http.url": scrubSecrets(String(d.url ?? "")).slice(0, 500),
        "http.duration_ms": Number(d.durationMs ?? 0),
        "error.message": scrubSecrets(String(d.error ?? "")).slice(0, 500),
      };
    case "auto_continue":
      return { "ai.auto_continue.count": Number(d.count ?? 0), "ai.auto_continue.reason": String(d.reason ?? "") };
    case "tool_manifest":
      return {
        "ai.tool_manifest.count": Number(d.filteredToolCount ?? 0),
        "ai.tool_manifest.mode": String(d.mode ?? ""),
        "ai.tool_manifest.mcp_count": Number(d.mcpToolCount ?? 0),
        "ai.tool_manifest.integration_count": Number(d.integrationToolCount ?? 0),
        "ai.tool_manifest.builtin_count": Number(d.builtinToolCount ?? 0),
      };
    case "config_resolved":
      return {
        "ai.model": String(d.model ?? ""),
        "ai.model.source": String(d.modelSource ?? ""),
        "ai.provider": String(d.provider ?? ""),
        "ai.provider.source": String(d.providerSource ?? ""),
      };
    case "provider_resolved":
      return {
        "ai.provider.type": String(d.type ?? ""),
        "ai.provider.has_key": Boolean(d.hasApiKey),
        "ai.provider.source": String(d.source ?? ""),
      };
    case "user_message":
      return { "ai.message.length": Number(d.length ?? 0) };
    case "request_start":
      return {
        "ai.request.content_length": Number(d.contentLength ?? 0),
        "ai.request.mode": String(d.mode ?? ""),
        "ai.request.has_attachments": Boolean(d.hasAttachments),
      };
    case "stream_start":
      return { "ai.stream.elapsed_ms": Number(d.elapsed_since_request_ms ?? 0) };
    case "stream_end":
      return {
        "ai.stream.reason": String(d.reason ?? ""),
        "ai.stream.frames": Number(d.totalSseFrames ?? 0),
        "ai.stream.duration_ms": Number(d.stream_duration_ms ?? 0),
      };
    case "client_disconnect":
      return { "ai.client.elapsed_ms": Number(d.elapsed_ms ?? 0) };
    case "session_create":
    case "session_resume":
    case "session_resume_failed":
    case "session_evict":
    case "session_mode_switch":
    case "session_disconnect": {
      const action = type.replace("session_", "");
      const sid = d.sessionId as string | undefined;
      return { "ai.session.action": action, "ai.session.id": sid ? sid.slice(0, 8) : "" };
    }
    case "sse_emit": {
      const sseType = d.sse_type as string | undefined;
      if (sseType === "text_delta" || sseType === "keep_alive" || sseType === "thinking") return null;
      return { "sse.type": sseType ?? "unknown" };
    }
    case "error":
      return {
        "error.category": String(d.category ?? ""),
        "error.message": scrubSecrets(String(d.message ?? "")).slice(0, 500),
        "error.context": String(d.context ?? "").slice(0, 200),
      };
    default:
      return {};
  }
}

// ─── Factory ───────────────────────────────────────────────

export function createTraceCollector(ctx: TraceCollectorContext) {
  const events: TraceEvent[] = [];
  const turnStartedAt = Date.now();
  let firstTokenAt: number | null = null;
  let toolCallCount = 0;
  let autoContinueCount = 0;
  let thinkingChars = 0;
  let responseChars = 0;
  let traceId: string | null = null;
  let sdkEventCount = 0;
  let flushInterval: ReturnType<typeof setInterval> | null = null;
  let lastFlushedEventCount = 0;

  // ── OTel root span for this chat turn ──
  // When TRACING_LEVEL=off this becomes a non-recording no-op and the
  // ids resolve to the all-zero context — harmless to record.
  const otelTracer = getTracer("doable-api/ai-chat");
  const otelTurnSpan: Span = otelTracer.startSpan("ai.chat.turn", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "ai.project_id": ctx.projectId,
      "ai.user_id": ctx.userId,
      "ai.workspace_id": ctx.workspaceId,
      "ai.session_id": ctx.sessionId ?? undefined,
      "ai.message_id": ctx.messageId ?? undefined,
      "ai.provider": ctx.provider ?? undefined,
      "ai.model": ctx.model ?? undefined,
    },
  });
  const otelSpanCtx = otelTurnSpan.spanContext();
  // Stash on the collector context so persist functions can read them.
  // (otel ids are 32/16 hex chars; "0".repeat(32) means no real trace.)
  const otelTraceId = otelSpanCtx.traceId === "0".repeat(32) ? null : otelSpanCtx.traceId;
  const otelRootSpanId = otelSpanCtx.spanId === "0".repeat(16) ? null : otelSpanCtx.spanId;

  const activeTools = new Map<string, { name: string; startedAt: number }>();
  let toolSeq = 0;

  // ── Periodic flush — upsert trace every 15s so data survives crashes ──

  async function periodicFlush(): Promise<void> {
    if (events.length === lastFlushedEventCount) return;
    lastFlushedEventCount = events.length;

    const dbEvents = prepareDbEvents(events);

    try {
      const result = await persistTraceStreaming(traceId, {
        ctx,
        turnStartedAt,
        eventsJson: safeStringify(dbEvents),
        toolCallCount,
        autoContinueCount,
        thinkingChars,
        responseChars,
        durationMs: Date.now() - turnStartedAt,
        model: ctx.model ?? null,
        otelTraceId,
        otelRootSpanId,
      });
      if (!traceId && result) traceId = result;
      console.log(`[TraceCollector] Periodic flush — ${traceId ? "updated" : "inserted"} trace ${traceId?.slice(0, 8)} (${events.length} events)`);
    } catch (err) {
      console.warn("[TraceCollector] Periodic flush failed:", err instanceof Error ? err.message : err);
    }
  }

  flushInterval = setInterval(() => { periodicFlush().catch(() => {}); }, 15_000);

  function elapsed(): number {
    return Date.now() - turnStartedAt;
  }

  function push(type: string, data: unknown): void {
    const event: TraceEvent = {
      ts: new Date().toISOString(),
      elapsed_ms: elapsed(),
      type,
      data,
    };
    events.push(event);
    broadcastTraceEvent(ctx.projectId, event);
    logTraceEvent(ctx.projectId.slice(0, 8), event.elapsed_ms, type, data);

    // Bridge to OTel: emit a span event on the ai.chat.turn span so MCP /
    // tool / integration / error visibility lands in the new spans table
    // without needing per-event spans.
    const attrs = eventToOtelAttrs(type, data);
    if (attrs !== null) {
      try {
        otelTurnSpan.addEvent(type, attrs);
        if (type === "error") {
          const d = data as { message?: string };
          otelTurnSpan.recordException(new Error(d?.message ?? "unknown"));
        }
      } catch { /* tracing never blocks app */ }
    }
  }

  function recordUserMessage(prompt: string): void {
    push("user_message", { prompt, length: prompt.length });
  }

  function onSdkEvent(event: Record<string, unknown>): void {
    sdkEventCount++;
    const evtType = event.type as string;
    const evtData = event.data as Record<string, unknown> | undefined;
    push("sdk_event", {
      seq: sdkEventCount,
      sdk_type: evtType,
      data: evtData ?? null,
      ...(evtData?.messageId ? { messageId: evtData.messageId } : {}),
    });
  }

  function onToolStart(name: string, args: unknown): void {
    toolCallCount++;
    const key = `tool-${toolSeq++}`;
    activeTools.set(key, { name, startedAt: Date.now() });
    push("tool_start", { name, tool_key: key, tool_seq: toolSeq - 1, args });
  }

  function onToolEnd(name: string, args: unknown, result: unknown, durationMs?: number): void {
    let matchedKey: string | undefined;
    let matchedStart: number | undefined;
    for (const [key, info] of activeTools) {
      if (info.name === name) { matchedKey = key; matchedStart = info.startedAt; }
    }
    if (matchedKey) activeTools.delete(matchedKey);
    const dur = durationMs ?? (matchedStart ? Date.now() - matchedStart : undefined);
    push("tool_end", { name, tool_key: matchedKey, duration_ms: dur, result, success: result !== null && result !== undefined });
  }

  function onTextDelta(text: string): void {
    if (!firstTokenAt) firstTokenAt = Date.now();
    responseChars += text.length;
    push("text_delta", { text, chars: text.length, total_response_chars: responseChars });
  }

  function onThinkingDelta(text: string): void {
    if (!firstTokenAt) firstTokenAt = Date.now();
    thinkingChars += text.length;
    push("thinking_delta", { text, chars: text.length, total_thinking_chars: thinkingChars });
  }

  function onAutoContinue(count: number, reason: string): void {
    autoContinueCount = count;
    push("auto_continue", { count, reason });
  }

  function onSseEmit(type: string, data: unknown): void {
    push("sse_emit", { sse_type: type, data });
  }

  function onError(message: string, context?: string, category?: string): void {
    push("error", { message, context, category: category ?? categorizeError(message) });
  }

  function onRequestStart(contentLength: number | null, mode: string, hasAttachments: boolean): void {
    push("request_start", { contentLength, mode, hasAttachments });
  }

  function onStreamStart(): void {
    push("stream_start", { elapsed_since_request_ms: elapsed() });
  }

  function onStreamEnd(reason: "done" | "error" | "abort" | "client_disconnect", totalSseFrames: number): void {
    push("stream_end", { reason, totalSseFrames, stream_duration_ms: elapsed() });
  }

  function onClientDisconnect(bytesSent: number | null): void {
    push("client_disconnect", { bytesSent, elapsed_ms: elapsed() });
  }

  function onConfigResolved(config: {
    model: string | null; modelSource: string; provider: string | null;
    providerSource: string; systemPromptLength: number; hasCustomSystemPrompt: boolean;
    githubTokenPresent: boolean;
  }): void { push("config_resolved", config); }

  function onToolManifest(manifest: {
    mode: string; totalToolsCreated: number; filteredToolCount: number;
    toolNames: string[]; mcpToolCount: number; integrationToolCount: number;
    builtinToolCount: number; filterReason?: string;
  }): void { push("tool_manifest", manifest); }

  function onProviderResolved(provider: {
    type: string | null; baseUrl: string | null; hasApiKey: boolean;
    hasBearerToken: boolean; wireApi?: string; source: string;
  }): void { push("provider_resolved", provider); }

  function setSessionId(id: string): void {
    // Ignore empty / falsy ids so accidental setSessionId("") calls
    // never blank out a real id mid-turn (see R11 root-cause analysis).
    if (!id) return;
    ctx.sessionId = id;
  }
  function setMessageId(id: string): void { ctx.messageId = id; }
  function setModel(model: string): void { ctx.model = model; }

  async function complete(
    status: "completed" | "error" | "aborted" | "stalled",
    usage?: TraceUsageSummary,
  ): Promise<string | null> {
    const turnEndedAt = Date.now();
    const durationMs = turnEndedAt - turnStartedAt;
    const ttftMs = firstTokenAt ? firstTokenAt - turnStartedAt : null;

    push("done", {
      status, duration_ms: durationMs, ttft_ms: ttftMs,
      tool_call_count: toolCallCount, auto_continue_count: autoContinueCount,
      thinking_chars: thinkingChars, response_chars: responseChars,
      sdk_event_count: sdkEventCount, total_trace_events: events.length,
    });

    const dbEvents = prepareDbEvents(events);

    if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
    removeActiveTrace(ctx.projectId);

    try {
      const errorMessages = status === "error"
        ? events.filter(e => e.type === "error").map(e => {
            const data = e.data as { message?: string; category?: string };
            return data.category ? `[${data.category}] ${data.message}` : data.message;
          }).filter(Boolean).join("; ") || null
        : null;

      const result = await persistTraceFinal(traceId, {
        ctx, turnStartedAt, turnEndedAt,
        eventsJson: safeStringify(dbEvents),
        toolCallCount, autoContinueCount,
        thinkingChars, responseChars,
        durationMs, ttftMs,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        thinkingTokens: usage?.thinkingTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        estimatedCostUsd: usage?.estimatedCostUsd ?? null,
        model: usage?.model ?? ctx.model ?? null,
        status, errorMessage: errorMessages,
        otelTraceId,
        otelRootSpanId,
      });

      if (result) traceId = result;
      console.log(`[TraceCollector] Trace ${traceId?.slice(0, 8)} saved — ${events.length} events, ${durationMs}ms, ${toolCallCount} tools, status=${status}`);

      // Finalize OTel span with summary attributes + status.
      otelTurnSpan.setAttribute("ai.duration_ms", durationMs);
      otelTurnSpan.setAttribute("ai.tool_call_count", toolCallCount);
      otelTurnSpan.setAttribute("ai.event_count", events.length);
      otelTurnSpan.setAttribute("ai.status", status);
      if (status === "error") {
        otelTurnSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessages ?? undefined });
      } else {
        otelTurnSpan.setStatus({ code: SpanStatusCode.OK });
      }
      otelTurnSpan.end();

      return traceId;
    } catch (err) {
      console.warn("[TraceCollector] Failed to persist trace:", err instanceof Error ? err.message : err);
      otelTurnSpan.recordException(err as Error);
      otelTurnSpan.setStatus({ code: SpanStatusCode.ERROR });
      otelTurnSpan.end();
      return null;
    }
  }

  function getEvents(): readonly TraceEvent[] { return events; }
  function getTraceId(): string | null { return traceId; }

  function getSummary() {
    return {
      durationMs: elapsed(),
      ttftMs: firstTokenAt ? firstTokenAt - turnStartedAt : null,
      toolCallCount, autoContinueCount, thinkingChars,
      responseChars, sdkEventCount, eventCount: events.length,
    };
  }

  function destroy(): void {
    if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
    removeActiveTrace(ctx.projectId);
    // Don't double-end if complete() already finalized.
    try { otelTurnSpan.end(); } catch { /* idempotent */ }
  }

  /** OTel correlation ids for this chat turn — read-only. */
  function getOtelIds() { return { traceId: otelTraceId, spanId: otelRootSpanId }; }

  function pushRaw(type: string, data: unknown): void { push(type, data); }

  function onSessionCreate(sessionId: string, model: string | null, provider: string | null, hasProvider: boolean, toolCount: number): void {
    push("session_create", { sessionId, model, provider, hasProvider, toolCount });
  }
  function onSessionResume(sessionId: string, fromDb: boolean): void { push("session_resume", { sessionId, fromDb }); }
  function onSessionResumeFailed(sessionId: string, error: string): void { push("session_resume_failed", { sessionId, error }); }
  function onSessionEvict(oldSessionId: string, reason: string): void { push("session_evict", { oldSessionId, reason }); }
  function onSessionModeSwitch(sessionId: string, from: string, to: string): void { push("session_mode_switch", { sessionId, from, to }); }
  function onSessionDisconnect(sessionId: string, reason: string): void { push("session_disconnect", { sessionId, reason }); }

  const collector = {
    recordUserMessage, onSdkEvent, onToolStart, onToolEnd,
    onTextDelta, onThinkingDelta, onAutoContinue, onSseEmit, onError,
    onConfigResolved, onToolManifest, onProviderResolved,
    onRequestStart, onStreamStart, onStreamEnd, onClientDisconnect,
    pushRaw, setSessionId, setMessageId, setModel,
    complete, getEvents, getTraceId, getSummary, destroy,
    onSessionCreate, onSessionResume, onSessionResumeFailed,
    onSessionEvict, onSessionModeSwitch, onSessionDisconnect,
    getOtelIds,
  };

  registerActiveTrace(ctx.projectId, collector);

  return collector;
}

export type TraceCollector = ReturnType<typeof createTraceCollector>;
