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

/** Truncate only for DB storage of very large fields */
function truncateForDb(s: string, maxLen = 32000): string {
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

export function categorizeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("auth") || m.includes("unauthorized") || m.includes("forbidden") || m.includes("401") || m.includes("403")) return "AUTH";
  if (m.includes("timeout") || m.includes("timed out") || m.includes("deadline")) return "TIMEOUT";
  if (m.includes("rate limit") || m.includes("429") || m.includes("too many")) return "RATE_LIMIT";
  if (m.includes("network") || m.includes("econnrefused") || m.includes("econnreset") || m.includes("enotfound") || m.includes("dns") || m.includes("socket")) return "NETWORK";
  if (m.includes("not found") || m.includes("404")) return "NOT_FOUND";
  if (m.includes("parse") || m.includes("json") || m.includes("syntax") || m.includes("unexpected token")) return "PARSE";
  if (m.includes("permission") || m.includes("denied") || m.includes("access")) return "PERMISSION";
  if (m.includes("quota") || m.includes("limit") || m.includes("exceeded")) return "QUOTA";
  if (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504") || m.includes("internal server error") || m.includes("bad gateway") || m.includes("service unavailable")) return "SERVER";
  if (m.includes("session") || m.includes("not started") || m.includes("stopped") || m.includes("disconnected")) return "SESSION";
  return "UNKNOWN";
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

    // ── Backend console logging for full observability ──
    const pid = ctx.projectId.slice(0, 8);
    const ms = event.elapsed_ms;
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
        // Log all SDK events except high-frequency deltas
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
        // Log all SSE emissions except text deltas and keep_alive
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
      // text_delta and thinking_delta are too noisy for console — skip
      default:
        break;
    }
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

  function onError(message: string, context?: string, category?: string): void {
    const cat = category ?? categorizeError(message);
    push("error", { message, context, category: cat });
  }

  /** HTTP request received — marks the start of the chat turn */
  function onRequestStart(contentLength: number | null, mode: string, hasAttachments: boolean): void {
    push("request_start", { contentLength, mode, hasAttachments });
  }

  /** SSE stream opened — first byte sent to client */
  function onStreamStart(): void {
    push("stream_start", { elapsed_since_request_ms: elapsed() });
  }

  /** SSE stream ended — [DONE] sent or stream closed */
  function onStreamEnd(reason: "done" | "error" | "abort" | "client_disconnect", totalSseFrames: number): void {
    push("stream_end", { reason, totalSseFrames, stream_duration_ms: elapsed() });
  }

  /** Client disconnected before stream completed */
  function onClientDisconnect(bytesSent: number | null): void {
    push("client_disconnect", { bytesSent, elapsed_ms: elapsed() });
  }

  /** Configuration resolution — shows the decision chain */
  function onConfigResolved(config: {
    model: string | null;
    modelSource: string;
    provider: string | null;
    providerSource: string;
    systemPromptLength: number;
    hasCustomSystemPrompt: boolean;
    githubTokenPresent: boolean;
  }): void {
    push("config_resolved", config);
  }

  /** Tool manifest — what tools were made available and why */
  function onToolManifest(manifest: {
    mode: string;
    totalToolsCreated: number;
    filteredToolCount: number;
    toolNames: string[];
    mcpToolCount: number;
    integrationToolCount: number;
    builtinToolCount: number;
    filterReason?: string;
  }): void {
    push("tool_manifest", manifest);
  }

  /** Provider discovery — BYOK provider details */
  function onProviderResolved(provider: {
    type: string | null;
    baseUrl: string | null;
    hasApiKey: boolean;
    hasBearerToken: boolean;
    wireApi?: string;
    source: string;
  }): void {
    push("provider_resolved", provider);
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
        ? events.filter(e => e.type === "error").map(e => {
            const data = e.data as { message?: string; category?: string };
            return data.category ? `[${data.category}] ${data.message}` : data.message;
          }).filter(Boolean).join("; ") || null
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

  /**
   * Push an arbitrary trace event — for lower layers (MCP transport, integration runner)
   * to inject raw HTTP/JSON-RPC details into the trace without needing a direct reference.
   */
  function pushRaw(type: string, data: unknown): void {
    push(type, data);
  }

  function onSessionCreate(sessionId: string, model: string | null, provider: string | null, hasProvider: boolean, toolCount: number): void {
    push("session_create", { sessionId, model, provider, hasProvider, toolCount });
  }

  function onSessionResume(sessionId: string, fromDb: boolean): void {
    push("session_resume", { sessionId, fromDb });
  }

  function onSessionResumeFailed(sessionId: string, error: string): void {
    push("session_resume_failed", { sessionId, error });
  }

  function onSessionEvict(oldSessionId: string, reason: string): void {
    push("session_evict", { oldSessionId, reason });
  }

  function onSessionModeSwitch(sessionId: string, from: string, to: string): void {
    push("session_mode_switch", { sessionId, from, to });
  }

  function onSessionDisconnect(sessionId: string, reason: string): void {
    push("session_disconnect", { sessionId, reason });
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
    onConfigResolved,
    onToolManifest,
    onProviderResolved,
    onRequestStart,
    onStreamStart,
    onStreamEnd,
    onClientDisconnect,
    pushRaw,
    setSessionId,
    setMessageId,
    setModel,
    complete,
    getEvents,
    getTraceId,
    getSummary,
    destroy,
    onSessionCreate,
    onSessionResume,
    onSessionResumeFailed,
    onSessionEvict,
    onSessionModeSwitch,
    onSessionDisconnect,
  };

  // Register in active trace registry
  activeTraceRegistry.set(ctx.projectId, collector);

  return collector;
}

export type TraceCollector = ReturnType<typeof createTraceCollector>;
