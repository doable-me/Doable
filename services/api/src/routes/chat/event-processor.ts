/**
 * processEvent callback factory and helpers for routing SDK events to SSE.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import { sql } from "../../db/index.js";
import { isMessageEncryptionEnabled } from "@doable/db";
import {
  friendlyToolMessage,
  stripServerPaths,
  sanitizeText,
} from "../../ai/tool-messages.js";
import { parsePlanSteps } from "../../ai/plan-parser.js";
import { mapEventToSSE, ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { popArtifacts } from "./artifact-stash.js";
import { broadcastToRoom } from "../../ai/yjs-bridge.js";
import { recordToolEventForTrace } from "./tool-event-bookkeeping.js";

/** Create the processEvent callback for SDK sendMessage. */
export function createProcessEvent(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  channelRouter: ChannelTokenRouter,
  projectId: string,
  userId: string,
  messageId: string,
  mode: string,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
  respondToExitPlanMode: (sessionId: string, requestId: string, action: string) => void,
  sessionIdGetter: () => string | undefined,
) {
  let firstEventReceived = false;

  return (event: import("@github/copilot-sdk").SessionEvent) => {
    if (!firstEventReceived) {
      firstEventReceived = true;
      stream.writeSSE({
        data: JSON.stringify({ type: "status", data: { phase: "thinking", message: mode === "plan" ? "AI is analyzing the project..." : "AI is writing code..." } }),
      }).catch(() => {});
    }

    const evtType = (event as Record<string, unknown>).type as string;
    const evtData = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;
    state.lastRealEventAt = Date.now();

    if (state.usageCollector) state.usageCollector.onUsageEvent(event);
    state.traceCollector?.onSdkEvent(event as Record<string, unknown>);

    if (evtType === "session.error" || evtType === "session.idle" || evtType === "done") {
      console.log(`[Chat][${projectId.slice(0, 8)}] terminal: ${evtType}`, evtData ? JSON.stringify(evtData).slice(0, 300) : "");
    } else if (evtType === "assistant.message_delta" || evtType === "assistant.streaming_delta") {
      const deltaMessageId = evtData?.messageId as string | undefined;
      if (deltaMessageId && deltaMessageId !== state.lastCapturedMsgId) {
        console.log(`[Chat][${projectId.slice(0, 8)}] first delta for msg ${deltaMessageId?.slice(0, 8)}`);
      }
    } else if (evtType.startsWith("tool.") || evtType === "tool_call") {
      console.log(`[Chat][${projectId.slice(0, 8)}] ${evtType}: ${(evtData?.toolName ?? evtData?.name ?? "").toString().slice(0, 50)}`);
    }

    // Tool call bookkeeping (shared with stream-recovery auto-continue —
    // see tool-event-bookkeeping.ts. BUG-TRACE-001: keep these two paths
    // identical so auto-continue tool events still increment the trace
    // counter.)
    const toolEvt = recordToolEventForTrace(state, event as Record<string, unknown>, recordAssistantToolCall);
    if (toolEvt.handled && toolEvt.phase === "start" && toolEvt.toolName) {
      state.pendingToolNames.push(toolEvt.toolName);
      state.lastToolName = toolEvt.toolName;
      state.friendlyLastTool = friendlyToolMessage(toolEvt.toolName, toolEvt.toolArgs ?? {}) ?? toolEvt.toolName;
    }

    // Multi-turn message ID tracking
    if (evtType === "assistant.message_delta" || evtType === "assistant.streaming_delta") {
      const deltaMessageId = evtData?.messageId as string | undefined;
      if (deltaMessageId && deltaMessageId !== state.lastCapturedMsgId) {
        if (state.assistantContent && state.lastCapturedMsgId) {
          const sep = "\n\n";
          state.assistantContent += sep;
          stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: sep }) }).catch(() => {});
          broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: sep, messageId, isThinking: false }, userId).catch(() => {});
        }
        state.lastCapturedMsgId = deltaMessageId;
        state.msgIdDeltaStart = state.assistantContent.length;
        state.lastMsgIdSepEmitted = true;
      }
    }

    // assistant.message catch-up (BUG-119)
    if (evtType === "assistant.message") {
      handleAssistantMessageCatchUp(stream, state, channelRouter, projectId, userId, messageId, evtData);
    }

    // Map SDK event → SSE and route to client
    // For session.error, defer the error instead of sending it immediately.
    // Auto-continue may recover from timeouts — the deferred error is emitted
    // later only if recovery fails (see send-handler.ts).
    // EXCEPTION: Rate limit errors are sent immediately — they are not
    // transient and the user needs to know why generation stopped.
    const sseData = mapEventToSSE(event);
    if (sseData) {
      if (evtType === "session.error" && sseData.type === "error") {
        const errMsg = typeof sseData.data === "string" ? sseData.data : "Unknown error";
        const isRateLimit = errMsg.toLowerCase().includes("rate limit") || errMsg.includes("429") || errMsg.toLowerCase().includes("quota");
        if (isRateLimit) {
          // Rate limit errors are non-recoverable — surface immediately
          routeSseEvent(stream, state, channelRouter, sseData, evtData, projectId, userId, messageId);
        } else {
          state.deferredError = errMsg;
          // Send a status event so the frontend knows something happened
          stream.writeSSE({
            data: JSON.stringify({ type: "status", data: { phase: "retrying", message: "AI paused — checking if more work is needed\u2026" } }),
          }).catch(() => {});
        }
      } else {
        routeSseEvent(stream, state, channelRouter, sseData, evtData, projectId, userId, messageId);
      }
    }

    // SDK native plan mode: exit_plan_mode.requested
    if (evtType === "exit_plan_mode.requested" && evtData) {
      handleExitPlanMode(stream, evtData, projectId, respondToExitPlanMode, sessionIdGetter);
    }

    // Terminal events — clear tool display state
    if (evtType === "session.idle" || evtType === "session.error" || evtType === "done") {
      state.lastToolName = undefined;
      state.friendlyLastTool = undefined;
    }
  };
}

function handleAssistantMessageCatchUp(
  stream: SSEStreamingApi, state: ChatStreamState, channelRouter: ChannelTokenRouter,
  projectId: string, userId: string, messageId: string,
  evtData: Record<string, unknown> | undefined,
) {
  const msgId = evtData?.messageId as string | undefined;
  const content = (evtData?.content ?? "") as string;
  if (msgId && msgId !== state.lastCapturedMsgId) {
    // Only emit separator if the delta handler didn't already emit one for this transition
    if (state.assistantContent && state.lastCapturedMsgId && !state.lastMsgIdSepEmitted) {
      const sep = "\n\n";
      state.assistantContent += sep;
      stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: sep }) }).catch(() => {});
      broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: sep, messageId, isThinking: false }, userId).catch(() => {});
    }
    state.lastCapturedMsgId = msgId;
    state.msgIdDeltaStart = state.assistantContent.length;
  }
  // Reset the flag after catch-up so the next transition works fresh
  state.lastMsgIdSepEmitted = false;
  if (!content) return;
  const sanitizedContent = sanitizeText(content);
  const deltasSoFar = state.assistantContent.slice(state.msgIdDeltaStart);
  // Account for text we classified as thinking via the leading-text buffer.
  // The SDK's assistant.message includes ALL text (reasoning + content), but
  // our delta handler split it into assistantContent and assistantThinking.
  // Without this, the catch-up would see thinking text as "missing" and
  // re-emit it as text_delta, leaking reasoning into the chat.
  const totalProcessed = deltasSoFar.length + state.assistantThinking.length;
  if (sanitizedContent.length > totalProcessed) {
    const missing = sanitizedContent.slice(totalProcessed);
    console.log(`[Chat][${projectId.slice(0, 8)}] catch-up: msg=${sanitizedContent.length} processed=${totalProcessed} (content=${deltasSoFar.length} thinking=${state.assistantThinking.length}) missing=${missing.length}`);
    let visibleText = "";
    for (const chunk of channelRouter.process(missing)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        visibleText += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
      } else if (chunk.type === "thinking") {
        state.assistantThinking += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
      } else if (chunk.type === "tool") {
        state.sawToolDelta = true;
        stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) }).catch(() => {});
      }
    }
    if (visibleText) {
      state.assistantContent = state.assistantContent.slice(0, state.msgIdDeltaStart) + deltasSoFar + visibleText;
    }
  } else if (!totalProcessed && !state.assistantContent) {
    let visibleText = "";
    for (const chunk of channelRouter.process(sanitizedContent)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        visibleText += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
      } else if (chunk.type === "thinking") {
        state.assistantThinking += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
      } else if (chunk.type === "tool") {
        state.sawToolDelta = true;
        stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) }).catch(() => {});
      }
    }
    state.assistantContent = visibleText;
  }
}

function routeSseEvent(
  stream: SSEStreamingApi, state: ChatStreamState, channelRouter: ChannelTokenRouter,
  sseData: { type: string; data: unknown }, evtData: Record<string, unknown> | undefined,
  projectId: string, userId: string, messageId: string,
) {
  state.lastRealEventAt = Date.now();

  // ── Helper: confirm leading-text buffer as thinking ──
  // Models like MiniMax output untagged reasoning text before tool calls.
  // The buffer has already been emitted as "thinking" SSE events. When a
  // tool_call confirms the text was reasoning, we mark it flushed.
  // After a tool_result, we RESET the buffer to capture inter-tool reasoning too.
  const flushLeadingBufferAsThinking = () => {
    if (!state.leadingTextBuffer) { state.leadingTextFlushed = true; return; }
    const len = state.leadingTextBuffer.length;
    state.leadingTextBuffer = "";
    state.leadingTextFlushed = true;
    console.log(`[Chat][${projectId.slice(0, 8)}] Confirmed ${len} chars of leading text as thinking (tool_call received)`);
  };

  if (sseData.type === "tool_result") {
    state.hadToolCalls = true;
    // Flip had_tool_calls in the DB as soon as the first tool result lands
    // (only once, not per result) so /chat/history shows "AI took actions"
    // even on a server crash before finalSave runs. Skip when app-layer
    // encryption is on for content/thinking; had_tool_calls is plain.
    if (state.assistantMessageId && state.lastThinkingFlushLen === 0 && state.lastFlushLen === 0) {
      sql`UPDATE ai_messages SET had_tool_calls = true WHERE id = ${state.assistantMessageId} AND had_tool_calls = false`.catch(() => {});
    }
    const resultData = sseData.data as Record<string, unknown>;
    if (!resultData?.name) {
      const tcId = evtData?.toolCallId as string | undefined;
      const mappedName = tcId ? state.toolCallIdMap.get(tcId) : undefined;
      if (mappedName) {
        resultData.name = mappedName;
        state.toolCallIdMap.delete(tcId!);
        const idx = state.pendingToolNames.indexOf(mappedName);
        if (idx !== -1) state.pendingToolNames.splice(idx, 1);
      } else if (state.pendingToolNames.length > 0) {
        resultData.name = state.pendingToolNames.shift();
      }
    }
    // Merge any artifacts stashed by tool-callbacks.onToolEnd. CF Tunnel can
    // drop the dedicated `artifact` / `mcp_ui_resource` SSE events, so the
    // canonical (always-delivered) tool_result is the most reliable carrier.
    const resolvedName = resultData?.name as string | undefined;
    if (resolvedName) {
      let arts = state.pendingArtifacts.get(resolvedName);
      if (!arts || arts.length === 0) {
        // Fallback to process-global stash (SDK caches toolProgress
        // callbacks across requests so per-state map may be empty).
        arts = popArtifacts(resolvedName);
      } else {
        state.pendingArtifacts.delete(resolvedName);
      }
      if (process.env.MCP_DEBUG) console.log(`[event-processor] tool_result merge name=${resolvedName} hasArts=${!!arts} count=${arts?.length ?? 0}`);
      if (arts && arts.length > 0) {
        (resultData as Record<string, unknown>).artifacts = arts;
      }
    }
    state.lastToolName = undefined;
    state.friendlyLastTool = undefined;
    // Reset leading-text buffer after tool_result so inter-tool reasoning
    // (text between tool_result and next tool_call) is also captured as thinking.
    // Emit a block separator so the frontend can render distinct thinking sections.
    if (state.assistantThinking) {
      stream.writeSSE({ data: JSON.stringify({ type: "thinking_block_end" }) }).catch(() => {});
    }
    state.leadingTextFlushed = false;
    state.leadingTextBuffer = "";
  }

  if (sseData.type === "text_delta") {
    const rawDelta = typeof sseData.data === "string" ? sseData.data : "";
    for (const chunk of channelRouter.process(rawDelta)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        // ── Leading-text buffer: hold back text before any tool call ──
        // Models that don't use <think> tags (e.g. MiniMax) emit reasoning
        // as plain text before calling a tool. We buffer this text and
        // emit it directly as "thinking" so the frontend never shows it
        // as main content. The buffer resets after each tool_result so
        // inter-tool reasoning is also captured. If no tool call arrives
        // after 8000 chars, we flush the buffer as regular text.
        if (!state.leadingTextFlushed) {
          state.leadingTextBuffer += chunk.content;
          // Emit as thinking immediately — keeps the user informed
          // without polluting the main chat content.
          state.assistantThinking += chunk.content;
          state.traceCollector?.onThinkingDelta(chunk.content);
          if (state.leadingTextBuffer.length <= 20) {
            console.log(`[Chat][${projectId.slice(0, 8)}] Buffer start: "${chunk.content.slice(0, 60)}…" (buf=${state.leadingTextBuffer.length})`);
          }
          broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: stripServerPaths(chunk.content), messageId, isThinking: true }, userId).catch(() => {});
          stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
          state.lastSseEmitAt = Date.now();
          state.sseFrameCount++;
          // Safety valve: if we've buffered 8000+ chars with no tool call,
          // assume it's not reasoning — re-emit as text content.
          if (state.leadingTextBuffer.length > 8000) {
            const buffered = state.leadingTextBuffer;
            state.leadingTextBuffer = "";
            state.leadingTextFlushed = true;
            // Move from thinking back to content
            state.assistantThinking = state.assistantThinking.slice(0, state.assistantThinking.length - buffered.length);
            state.assistantContent += buffered;
            console.log(`[Chat][${projectId.slice(0, 8)}] Leading text buffer overflow (${buffered.length} chars) — flushing as content`);
            broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: buffered, messageId, isThinking: false }, userId).catch(() => {});
            stream.writeSSE({ data: JSON.stringify({ type: "thinking_to_text", data: buffered }) }).catch(() => {});
            state.lastSseEmitAt = Date.now();
            state.sseFrameCount++;
          }
          continue;
        }
        state.assistantContent += chunk.content;
        // Incremental DB flush every ~500 chars so a crash mid-stream
        // still leaves a useful partial transcript. Skip when app-layer
        // encryption is on: we'd have to either pgp_sym_encrypt every
        // 500 chars (costly) or write plaintext to `content` and break
        // the XOR check from migration 072. The accumulated full value
        // is encrypted once at finalSaveAssistantMessage.
        if (
          state.assistantMessageId &&
          state.assistantContent.length - state.lastFlushLen > 500 &&
          !isMessageEncryptionEnabled()
        ) {
          state.lastFlushLen = state.assistantContent.length;
          sql`UPDATE ai_messages SET content = ${state.assistantContent} WHERE id = ${state.assistantMessageId}`.catch(() => {});
        }
        broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: chunk.content, messageId, isThinking: false }, userId).catch(() => {});
        state.traceCollector?.onTextDelta(chunk.content);
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
        state.lastSseEmitAt = Date.now();
        state.sseFrameCount++;
      } else if (chunk.type === "thinking") {
        state.assistantThinking += chunk.content;
        state.traceCollector?.onThinkingDelta(chunk.content);
        // Mirror the content-side incremental flush: agent-loop runs
        // keep all visible reasoning in assistantThinking, so a crash /
        // dropped connection before finalSave used to lose the entire
        // turn (BUG-R18-CHAT-THINKING-NOT-PERSISTED). Skip when app-layer
        // encryption is on for the same XOR-check reason content uses.
        if (
          state.assistantMessageId &&
          state.assistantThinking.length - state.lastThinkingFlushLen > 500 &&
          !isMessageEncryptionEnabled()
        ) {
          state.lastThinkingFlushLen = state.assistantThinking.length;
          sql`UPDATE ai_messages SET thinking_content = ${state.assistantThinking} WHERE id = ${state.assistantMessageId}`.catch(() => {});
        }
        broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: stripServerPaths(chunk.content), messageId, isThinking: true }, userId).catch(() => {});
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
        state.lastSseEmitAt = Date.now();
        state.sseFrameCount++;
      } else if (chunk.type === "tool") {
        state.sawToolDelta = true;
        broadcastToRoom(projectId, { type: "ai:tool-delta", chunk: chunk.content, messageId }, userId).catch(() => {});
        stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) }).catch(() => {});
        state.lastSseEmitAt = Date.now();
        state.sseFrameCount++;
      }
    }
  } else if (sseData.type === "thinking") {
    const thinkingDelta = typeof sseData.data === "string" ? sseData.data : "";
    state.assistantThinking += thinkingDelta;
    state.traceCollector?.onThinkingDelta(thinkingDelta);
    // Same incremental flush as the chunk-routed thinking branch above.
    if (
      state.assistantMessageId &&
      state.assistantThinking.length - state.lastThinkingFlushLen > 500 &&
      !isMessageEncryptionEnabled()
    ) {
      state.lastThinkingFlushLen = state.assistantThinking.length;
      sql`UPDATE ai_messages SET thinking_content = ${state.assistantThinking} WHERE id = ${state.assistantMessageId}`.catch(() => {});
    }
    broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: thinkingDelta, messageId, isThinking: true }, userId).catch(() => {});
    stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(thinkingDelta) }) }).catch(() => {});
    state.lastSseEmitAt = Date.now();
    state.sseFrameCount++;
  } else {
    state.traceCollector?.onSseEmit(sseData.type, sseData.data);
    // ── Tool call trigger: reclassify leading text as thinking ──
    // When the model calls a tool, any text it emitted BEFORE the tool call
    // was reasoning, not user-facing content. Flush it as thinking.
    if (sseData.type === "tool_call" && state.leadingTextBuffer && !state.leadingTextFlushed) {
      flushLeadingBufferAsThinking();
    }
    if (sseData.type === "tool_call" || sseData.type === "tool_result") {
      broadcastToRoom(projectId, { type: "ai:tool-event", messageId, event: sseData.type, data: (sseData.data ?? {}) as Record<string, unknown> }, userId).catch(() => {});
    }
    if (sseData.type === "status" || sseData.type === "auto_fix_complete") {
      broadcastToRoom(projectId, { type: "ai:status", messageId, data: sseData.data }, userId).catch(() => {});
    }
    if (sseData.type === "error") {
      broadcastToRoom(projectId, { type: "ai:error", messageId, error: sseData.data }, userId).catch(() => {});
    }
    stream.writeSSE({ data: JSON.stringify(sseData) }).catch(() => {});
    state.lastSseEmitAt = Date.now();
    state.sseFrameCount++;
  }
}

function handleExitPlanMode(
  stream: SSEStreamingApi,
  evtData: Record<string, unknown>,
  projectId: string,
  respondToExitPlanMode: (sessionId: string, requestId: string, action: string) => void,
  sessionIdGetter: () => string | undefined,
) {
  const requestId = evtData.requestId as string;
  const planContent = evtData.planContent as string;
  const summary = evtData.summary as string;
  const actions = evtData.actions as string[] | undefined;
  const recommendedAction = evtData.recommendedAction as string | undefined;
  console.log(`[Chat] exit_plan_mode.requested: summary="${summary?.slice(0, 100)}", actions=${JSON.stringify(actions)}, recommended=${recommendedAction}`);

  stream.writeSSE({ data: JSON.stringify({
    type: "plan",
    data: {
      plan: {
        id: requestId,
        projectId,
        summary: summary ?? "",
        complexity: "moderate",
        planContent: planContent ?? "",
        status: "draft",
        createdAt: new Date().toISOString(),
        steps: parsePlanSteps(planContent),
      },
    },
  }) }).catch(() => {});

  const sid = sessionIdGetter();
  if (sid) {
    respondToExitPlanMode(sid, requestId, recommendedAction ?? "approve");
  }
}
