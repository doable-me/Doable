import {extractToolArguments, isExternalToolAcknowledgement} from "../../ai/sse-mapper.js";
import {startTool, finishTool} from "./execution-state.js";
/**
 * Shared SDK tool-event → traceCollector / state bookkeeping.
 *
 * Both the main turn (event-processor.ts) and auto-continue rounds
 * (stream-recovery.ts) need to translate Copilot-SDK tool events into
 * `traceCollector.onToolStart/onToolEnd` calls so the per-turn
 * `tool_call_count` reflects every invocation. Keeping this in one place
 * avoids the BUG-TRACE-001 drift where stream-recovery only matched
 * `tool.execution_start` while event-processor also matched `tool.running`,
 * causing tool events from auto-continue rounds to vanish from the trace.
 *
 * SDK transport events can mirror execution events for the same toolCallId.
 * The invocation ledger deduplicates both accounting and display; dispatch-only
 * acknowledgements never complete a tool or reset the assistant text buffer.
 */
import type { ChatStreamState } from "./types.js";

/** SDK event types that signal a tool invocation has begun. */
const TOOL_START_EVENT_TYPES = new Set([
  "tool.execution_start",
  "tool.running",
  "external_tool.requested",
]);

/** SDK event types that signal a tool invocation has finished. */
const TOOL_END_EVENT_TYPES = new Set([
  "tool.execution_complete",
  "tool.completed",
  "external_tool.completed",
]);

/**
 * Process a single SDK event for tool-call bookkeeping. Increments
 * `state.toolCallCount`-equivalent state via `traceCollector.onToolStart` and
 * appends to `state.assistantToolCalls` via `recordAssistantToolCall`. Safe
 * to call on every event — non-tool events are ignored.
 *
 * Returns `true` if this event was a tool start/end (so callers can branch
 * for additional UI work), `false` otherwise.
 */
export function recordToolEventForTrace(
  state: ChatStreamState,
  event: Record<string, unknown>,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
): { handled: boolean; phase: "start" | "end" | null; suppressDisplay?: boolean; toolName?: string; toolArgs?: Record<string, unknown> } {
  const evtType = event.type as string | undefined;
  if (!evtType) return { handled: false, phase: null };

  const evtData = event.data as Record<string, unknown> | undefined;
  if (!evtData) return { handled: false, phase: null };

  if (evtType === "external_tool.completed" && isExternalToolAcknowledgement(evtData))
    return { handled: true, phase: null, suppressDisplay: true };

  if (TOOL_START_EVENT_TYPES.has(evtType)) {
    const tcName = (evtData.toolName ?? evtData.name) as string | undefined;
    if (!tcName) return { handled: true, phase: "start" };

    // Some SDK channels wrap the real tool args under .arguments
    // ({ toolName, arguments: {...real args...}, toolCallId }); unwrap so
    // downstream code finds path/command directly.
    const toolArgs = extractToolArguments(evtData);

    const tcId = evtData.toolCallId as string | undefined;
    if (tcId && tcName) state.toolCallIdMap.set(tcId, tcName);

    const existing = tcId ? state.assistantToolCalls.find(r => r.callId === tcId) : undefined;
    if (existing) {
      if (!existing.arguments && toolArgs) existing.arguments = toolArgs;
      return { handled: true, phase: null, suppressDisplay: true, toolName: tcName, toolArgs };
    }
    startTool(state, tcName, toolArgs, tcId);
    state.traceCollector?.onToolStart(tcName, toolArgs);
    state.hadToolCalls = true;
    return { handled: true, phase: "start", toolName: tcName, toolArgs };
  }

  if (TOOL_END_EVENT_TYPES.has(evtType)) {
    const tcName = (evtData.toolName ?? evtData.name ?? state.toolCallIdMap.get(String(evtData.toolCallId))) as string | undefined;
    if (!tcName) return { handled: true, phase: "end" };
    // The mapper also needs the resolved name for ID-only end events.
    evtData.toolName ??= tcName;
    const prior = state.assistantToolCalls.find(r => r.callId === evtData.toolCallId);
    const priorStatus = prior?.status;
    const observation = finishTool(state,tcName,extractToolArguments(evtData),evtData.result ?? evtData.output,evtData.success as boolean | undefined,evtData.toolCallId as string | undefined);

    if (priorStatus && priorStatus !== "running" && priorStatus !== "unknown" && observation.status === priorStatus)
      return { handled: true, phase: null, suppressDisplay: true, toolName: tcName };
    state.traceCollector?.onToolEnd(tcName, evtData, evtData.result ?? evtData.output ?? null);
    return { handled: true, phase: "end", toolName: tcName };
  }

  return { handled: false, phase: null };
}
