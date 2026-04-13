/**
 * processEvent callback factory and helpers for routing SDK events to SSE.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import { sql } from "../../db/index.js";
import {
  friendlyToolMessage,
  stripServerPaths,
  sanitizeText,
} from "../../ai/tool-messages.js";
import { parsePlanSteps } from "../../ai/plan-parser.js";
import { mapEventToSSE, ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { broadcastToRoom } from "../../ai/yjs-bridge.js";

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

    // Tool call bookkeeping
    if (evtType === "tool.execution_start" || evtType === "tool.running") {
      const tcId = evtData?.toolCallId as string | undefined;
      const tcName = (evtData?.toolName ?? evtData?.name) as string | undefined;
      if (tcId && tcName) state.toolCallIdMap.set(tcId, tcName);
      if (tcName) {
        state.pendingToolNames.push(tcName);
        recordAssistantToolCall(tcName, evtData as Record<string, unknown>);
        state.lastToolName = tcName;
        state.friendlyLastTool = friendlyToolMessage(tcName, evtData as Record<string, unknown>) ?? tcName;
        state.traceCollector?.onToolStart(tcName, evtData);
      }
    }
    if (evtType === "tool.execution_complete" || evtType === "tool.completed" || evtType === "external_tool.completed") {
      const tcName = (evtData?.toolName ?? evtData?.name) as string | undefined;
      if (tcName) state.traceCollector?.onToolEnd(tcName, evtData, evtData?.result ?? evtData?.output ?? null);
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
    const sseData = mapEventToSSE(event);
    if (sseData) {
      routeSseEvent(stream, state, channelRouter, sseData, evtData, projectId, userId, messageId);
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
  if (sanitizedContent.length > deltasSoFar.length) {
    const missing = sanitizedContent.slice(deltasSoFar.length);
    for (const chunk of channelRouter.process(missing)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
      } else {
        state.assistantThinking += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
      }
    }
    state.assistantContent = state.assistantContent.slice(0, state.msgIdDeltaStart) + sanitizedContent;
  } else if (!deltasSoFar && !state.assistantContent) {
    for (const chunk of channelRouter.process(sanitizedContent)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
      } else {
        state.assistantThinking += chunk.content;
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
      }
    }
    state.assistantContent = sanitizedContent;
  }
}

function routeSseEvent(
  stream: SSEStreamingApi, state: ChatStreamState, channelRouter: ChannelTokenRouter,
  sseData: { type: string; data: unknown }, evtData: Record<string, unknown> | undefined,
  projectId: string, userId: string, messageId: string,
) {
  if (sseData.type === "tool_result") {
    state.hadToolCalls = true;
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
    state.lastToolName = undefined;
    state.friendlyLastTool = undefined;
  }

  if (sseData.type === "text_delta") {
    const rawDelta = typeof sseData.data === "string" ? sseData.data : "";
    for (const chunk of channelRouter.process(rawDelta)) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        state.assistantContent += chunk.content;
        if (state.assistantMessageId && state.assistantContent.length - state.lastFlushLen > 500) {
          state.lastFlushLen = state.assistantContent.length;
          sql`UPDATE ai_messages SET content = ${state.assistantContent} WHERE id = ${state.assistantMessageId}`.catch(() => {});
        }
        broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: chunk.content, messageId, isThinking: false }, userId).catch(() => {});
        state.traceCollector?.onTextDelta(chunk.content);
        stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
        state.lastSseEmitAt = Date.now();
        state.sseFrameCount++;
      } else {
        state.assistantThinking += chunk.content;
        state.traceCollector?.onThinkingDelta(chunk.content);
        broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: stripServerPaths(chunk.content), messageId, isThinking: true }, userId).catch(() => {});
        stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
        state.lastSseEmitAt = Date.now();
        state.sseFrameCount++;
      }
    }
  } else if (sseData.type === "thinking") {
    const thinkingDelta = typeof sseData.data === "string" ? sseData.data : "";
    state.assistantThinking += thinkingDelta;
    state.traceCollector?.onThinkingDelta(thinkingDelta);
    broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: thinkingDelta, messageId, isThinking: true }, userId).catch(() => {});
    stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(thinkingDelta) }) }).catch(() => {});
    state.lastSseEmitAt = Date.now();
    state.sseFrameCount++;
  } else {
    state.traceCollector?.onSseEmit(sseData.type, sseData.data);
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
