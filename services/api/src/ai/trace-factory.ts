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

  function setSessionId(id: string): void { ctx.sessionId = id; }
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
      });

      if (result) traceId = result;
      console.log(`[TraceCollector] Trace ${traceId?.slice(0, 8)} saved — ${events.length} events, ${durationMs}ms, ${toolCallCount} tools, status=${status}`);
      return traceId;
    } catch (err) {
      console.warn("[TraceCollector] Failed to persist trace:", err instanceof Error ? err.message : err);
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
  }

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
  };

  registerActiveTrace(ctx.projectId, collector);

  return collector;
}

export type TraceCollector = ReturnType<typeof createTraceCollector>;
