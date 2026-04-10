/**
 * Chat Trace Collector — captures ABSOLUTELY EVERY event during a chat turn
 *
 * Zero information loss. Every raw SDK event, every tool call with full
 * args/result, every text token, every thinking token, every auto-continue,
 * every SSE frame, every error — all with ISO timestamps and elapsed_ms.
 *
 * Also broadcasts events in real-time via WebSocket for live debugging.
 *
 * Usage:
 *   const trace = createTraceCollector({ projectId, userId, ... });
 *   trace.recordUserMessage(prompt);
 *   trace.onSdkEvent(event);              // EVERY raw SDK event — nothing skipped
 *   trace.onToolStart(name, args);         // from toolProgress hooks (RPC channel)
 *   trace.onToolEnd(name, args, result, durationMs);
 *   trace.onTextDelta(text);               // every text token
 *   trace.onThinkingDelta(text);           // every thinking token
 *   trace.onAutoContinue(count, reason);
 *   trace.onSseEmit(type, data);           // every SSE frame sent to client
 *   trace.onError(message, context);
 *   await trace.complete(status, usage);   // flush to DB
 */

import { sql } from "../db/index.js";
import { broadcastToRoom } from "./yjs-bridge.js";

// ─── Types ─────────────────────────────────────────────────

export interface TraceCollectorContext {
  projectId: string;
  userId: string;
  workspaceId: string;
  sessionId?: string;
  messageId?: string;
  provider?: string;
  providerLabel?: string;
  model?: string;
}

export interface TraceEvent {
  /** ISO timestamp */
  ts: string;
  /** Milliseconds since turn started */
  elapsed_ms: number;
  /** Event category */
  type: string;
  /** Full event payload — NO truncation for SDK events */
  data: unknown;
}

export interface TraceUsageSummary {
  promptTokens?: number;
  completionTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  model?: string;
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
function broadcastTraceEvent(projectId: string, event: TraceEvent): void {
  const subs = liveSubscribers.get(projectId);
  if (subs && subs.size > 0) {
    const payload = { ...event, projectId };
    for (const fn of subs) {
      try { fn(payload); } catch { /* subscriber error — ignore */ }
    }
  }
  // Also broadcast via existing WebSocket room so the frontend can listen
  broadcastToRoom(projectId, {
    type: "ai:trace",
    event,
  }, "system").catch(() => {});
}

// ─── Helpers ───────────────────────────────────────────────

/** Safe-stringify for DB storage — handles circular refs */
function safeStringify(data: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    // Convert Buffer/Uint8Array to string representation
    if (value instanceof Uint8Array) return `[Uint8Array(${value.length})]`;
    return value;
  });
}

/** Truncate only for DB storage of very large fields (>10KB) */
function truncateForDb(s: string, maxLen = 10000): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `... [${s.length - maxLen} chars truncated]`;
}

// ─── Active trace registry (module-level, for live endpoint) ──

const activeTraceRegistry = new Map<string, ReturnType<typeof createTraceCollector>>();

/** Get the active in-flight trace collector for a project, if any */
export function getActiveTrace(projectId: string) {
  return activeTraceRegistry.get(projectId) ?? null;
}

/** Remove a project from the active trace registry */
export function removeActiveTrace(projectId: string) {
  activeTraceRegistry.delete(projectId);
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

  // Active tool calls for duration tracking
  const activeTools = new Map<string, { name: string; startedAt: number }>();
  let toolSeq = 0;

  // ── Periodic flush — upsert trace every 15s so data survives crashes ──

  async function periodicFlush(): Promise<void> {
    // Skip if no new events since last flush
    if (events.length === lastFlushedEventCount) return;
    lastFlushedEventCount = events.length;

    // Truncate large tool results for DB, same as complete()
    const dbEvents = events.map((e) => {
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

    try {
      if (!traceId) {
        // First flush — INSERT
        const [row] = await sql`
          INSERT INTO chat_traces (
            project_id, session_id, message_id, user_id, workspace_id,
            turn_started_at,
            tool_call_count, auto_continue_count,
            thinking_chars, response_chars,
            model, events, status,
            provider, provider_label
          ) VALUES (
            ${ctx.projectId}, ${ctx.sessionId ?? null}, ${ctx.messageId ?? null},
            ${ctx.userId}, ${ctx.workspaceId},
            ${new Date(turnStartedAt).toISOString()},
            ${toolCallCount}, ${autoContinueCount},
            ${thinkingChars}, ${responseChars},
            ${ctx.model ?? null},
            ${safeStringify(dbEvents)}, ${"streaming"},
            ${ctx.provider ?? null}, ${ctx.providerLabel ?? null}
          ) RETURNING id
        `;
        traceId = row?.id ?? null;
        console.log(`[TraceCollector] Periodic flush — inserted trace ${traceId?.slice(0, 8)} (${events.length} events)`);
      } else {
        // Subsequent flush — UPDATE
        await sql`
          UPDATE chat_traces
          SET events = ${safeStringify(dbEvents)}::jsonb,
              tool_call_count = ${toolCallCount},
              auto_continue_count = ${autoContinueCount},
              thinking_chars = ${thinkingChars},
              response_chars = ${responseChars},
              duration_ms = ${Date.now() - turnStartedAt}
          WHERE id = ${traceId}::uuid
        `;
        console.log(`[TraceCollector] Periodic flush — updated trace ${traceId?.slice(0, 8)} (${events.length} events)`);
      }
    } catch (err) {
      // Tracing must NEVER break chat
      console.warn("[TraceCollector] Periodic flush failed:", err instanceof Error ? err.message : err);
    }
  }

  // Start periodic flush interval
  flushInterval = setInterval(() => { periodicFlush().catch(() => {}); }, 15_000);

  // Register in active trace registry
  // (we'll set the reference after creating the collector object)

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
    // Broadcast to live subscribers in real-time
    broadcastTraceEvent(ctx.projectId, event);
  }

  // ── Public API ───────────────────────────────────────────

  function recordUserMessage(prompt: string): void {
    push("user_message", { prompt, length: prompt.length });
  }

  /**
   * Record EVERY raw SDK event — nothing is skipped or filtered.
   * This is the authoritative record of what the Copilot CLI sent us.
   */
  function onSdkEvent(event: Record<string, unknown>): void {
    sdkEventCount++;
    const evtType = event.type as string;
    const evtData = event.data as Record<string, unknown> | undefined;

    // For message deltas, include the full content for debugging
    // (these are individual tokens — small payloads)
    push("sdk_event", {
      seq: sdkEventCount,
      sdk_type: evtType,
      data: evtData ?? null,
      // Include messageId if present (for correlating multi-turn)
      ...(evtData?.messageId ? { messageId: evtData.messageId } : {}),
    });
  }

  /**
   * Tool started (from RPC hook channel — separate from SDK event stream).
   * This fires BEFORE the SDK event for the same tool.
   */
  function onToolStart(name: string, args: unknown): void {
    toolCallCount++;
    const key = `tool-${toolSeq++}`;
    activeTools.set(key, { name, startedAt: Date.now() });
    push("tool_start", {
      name,
      tool_key: key,
      tool_seq: toolSeq - 1,
      args, // full args — no truncation
    });
  }

  /**
   * Tool completed (from RPC hook channel).
   * Includes full result and computed duration.
   */
  function onToolEnd(name: string, args: unknown, result: unknown, durationMs?: number): void {
    // Find matching active tool (most recent with this name)
    let matchedKey: string | undefined;
    let matchedStart: number | undefined;
    for (const [key, info] of activeTools) {
      if (info.name === name) {
        matchedKey = key;
        matchedStart = info.startedAt;
      }
    }
    if (matchedKey) activeTools.delete(matchedKey);

    const dur = durationMs ?? (matchedStart ? Date.now() - matchedStart : undefined);

    push("tool_end", {
      name,
      tool_key: matchedKey,
      duration_ms: dur,
      result, // full result — no truncation
      success: result !== null && result !== undefined,
    });
  }

  /** Every text token from the LLM response */
  function onTextDelta(text: string): void {
    if (!firstTokenAt) firstTokenAt = Date.now();
    responseChars += text.length;
    push("text_delta", {
      text, // full text of this delta
      chars: text.length,
      total_response_chars: responseChars,
    });
  }

  /** Every thinking/reasoning token */
  function onThinkingDelta(text: string): void {
    if (!firstTokenAt) firstTokenAt = Date.now();
    thinkingChars += text.length;
    push("thinking_delta", {
      text, // full text of this thinking delta
      chars: text.length,
      total_thinking_chars: thinkingChars,
    });
  }

  function onAutoContinue(count: number, reason: string): void {
    autoContinueCount = count;
    push("auto_continue", { count, reason });
  }

  /** Every SSE frame sent to the client browser */
  function onSseEmit(type: string, data: unknown): void {
    push("sse_emit", { sse_type: type, data });
  }

  function onError(message: string, context?: string): void {
    push("error", { message, context });
  }

  function setSessionId(id: string): void {
    ctx.sessionId = id;
  }

  function setMessageId(id: string): void {
    ctx.messageId = id;
  }

  function setModel(model: string): void {
    ctx.model = model;
  }

  /**
   * Finalize and persist the trace to DB.
   * Call this when the turn is complete (after [DONE] SSE).
   */
  async function complete(
    status: "completed" | "error" | "aborted" | "stalled",
    usage?: TraceUsageSummary,
  ): Promise<string | null> {
    const turnEndedAt = Date.now();
    const durationMs = turnEndedAt - turnStartedAt;
    const ttftMs = firstTokenAt ? firstTokenAt - turnStartedAt : null;

    push("done", {
      status,
      duration_ms: durationMs,
      ttft_ms: ttftMs,
      tool_call_count: toolCallCount,
      auto_continue_count: autoContinueCount,
      thinking_chars: thinkingChars,
      response_chars: responseChars,
      sdk_event_count: sdkEventCount,
      total_trace_events: events.length,
    });

    // For DB storage, truncate individual large tool results to keep
    // the JSONB under ~10MB, but preserve everything else
    const dbEvents = events.map((e) => {
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

    // Clear periodic flush interval
    if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
    // Remove from active registry
    activeTraceRegistry.delete(ctx.projectId);

    try {
      const errorMessages = status === "error"
        ? events.filter(e => e.type === "error").map(e => (e.data as { message?: string })?.message).filter(Boolean).join("; ") || null
        : null;

      if (traceId) {
        // Trace already exists from periodic flush — UPDATE with final data
        await sql`
          UPDATE chat_traces SET
            session_id = ${ctx.sessionId ?? null},
            message_id = ${ctx.messageId ?? null},
            turn_ended_at = ${new Date(turnEndedAt).toISOString()},
            duration_ms = ${durationMs},
            ttft_ms = ${ttftMs},
            tool_call_count = ${toolCallCount},
            auto_continue_count = ${autoContinueCount},
            thinking_chars = ${thinkingChars},
            response_chars = ${responseChars},
            prompt_tokens = ${usage?.promptTokens ?? null},
            completion_tokens = ${usage?.completionTokens ?? null},
            thinking_tokens = ${usage?.thinkingTokens ?? null},
            total_tokens = ${usage?.totalTokens ?? null},
            estimated_cost_usd = ${usage?.estimatedCostUsd ?? null},
            model = ${usage?.model ?? ctx.model ?? null},
            events = ${safeStringify(dbEvents)}::jsonb,
            status = ${status},
            error_message = ${errorMessages}
          WHERE id = ${traceId}::uuid
        `;
      } else {
        // No periodic flush happened yet — INSERT
        const [row] = await sql`
          INSERT INTO chat_traces (
            project_id, session_id, message_id, user_id, workspace_id,
            turn_started_at, turn_ended_at, duration_ms, ttft_ms,
            tool_call_count, auto_continue_count,
            thinking_chars, response_chars,
            prompt_tokens, completion_tokens, thinking_tokens, total_tokens,
            estimated_cost_usd, model,
            events, status, error_message,
            provider, provider_label
          ) VALUES (
            ${ctx.projectId}, ${ctx.sessionId ?? null}, ${ctx.messageId ?? null},
            ${ctx.userId}, ${ctx.workspaceId},
            ${new Date(turnStartedAt).toISOString()}, ${new Date(turnEndedAt).toISOString()},
            ${durationMs}, ${ttftMs},
            ${toolCallCount}, ${autoContinueCount},
            ${thinkingChars}, ${responseChars},
            ${usage?.promptTokens ?? null}, ${usage?.completionTokens ?? null},
            ${usage?.thinkingTokens ?? null}, ${usage?.totalTokens ?? null},
            ${usage?.estimatedCostUsd ?? null}, ${usage?.model ?? ctx.model ?? null},
            ${safeStringify(dbEvents)}, ${status}, ${errorMessages},
            ${ctx.provider ?? null}, ${ctx.providerLabel ?? null}
          ) RETURNING id
        `;
        traceId = row?.id ?? null;
      }
      console.log(`[TraceCollector] Trace ${traceId?.slice(0, 8)} saved — ${events.length} events, ${durationMs}ms, ${toolCallCount} tools, status=${status}`);
      return traceId;
    } catch (err) {
      // Tracing must NEVER break chat
      console.warn("[TraceCollector] Failed to persist trace:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  function getEvents(): readonly TraceEvent[] {
    return events;
  }

  function getTraceId(): string | null {
    return traceId;
  }

  function getSummary() {
    return {
      durationMs: elapsed(),
      ttftMs: firstTokenAt ? firstTokenAt - turnStartedAt : null,
      toolCallCount,
      autoContinueCount,
      thinkingChars,
      responseChars,
      sdkEventCount,
      eventCount: events.length,
    };
  }

  /** Destroy the collector without persisting — clears interval, removes from registry */
  function destroy(): void {
    if (flushInterval) { clearInterval(flushInterval); flushInterval = null; }
    activeTraceRegistry.delete(ctx.projectId);
  }

  const collector = {
    recordUserMessage,
    onSdkEvent,
    onToolStart,
    onToolEnd,
    onTextDelta,
    onThinkingDelta,
    onAutoContinue,
    onSseEmit,
    onError,
    setSessionId,
    setMessageId,
    setModel,
    complete,
    getEvents,
    getTraceId,
    getSummary,
    destroy,
  };

  // Register in active trace registry
  activeTraceRegistry.set(ctx.projectId, collector);

  return collector;
}

export type TraceCollector = ReturnType<typeof createTraceCollector>;
