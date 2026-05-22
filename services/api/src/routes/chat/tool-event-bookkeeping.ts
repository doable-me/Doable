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
 * The helpers are pure dispatchers: they look at `evtType` and conditionally
 * forward to `recordAssistantToolCall` and `state.traceCollector` only when
 * the event is a real tool start/end with a usable name. Idempotency is
 * guaranteed by the SDK only emitting one start + one end event per
 * (toolCallId), so callers may invoke these unconditionally on every event.
 */
import type { ChatStreamState } from "./types.js";

/** SDK event types that signal a tool invocation has begun. */
const TOOL_START_EVENT_TYPES = new Set([
  "tool.execution_start",
  "tool.running",
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
): { handled: boolean; phase: "start" | "end" | null; toolName?: string; toolArgs?: Record<string, unknown> } {
  const evtType = event.type as string | undefined;
  if (!evtType) return { handled: false, phase: null };

  const evtData = event.data as Record<string, unknown> | undefined;
  if (!evtData) return { handled: false, phase: null };

  if (TOOL_START_EVENT_TYPES.has(evtType)) {
    const tcName = (evtData.toolName ?? evtData.name) as string | undefined;
    if (!tcName) return { handled: true, phase: "start" };

    // Some SDK channels wrap the real tool args under .arguments
    // ({ toolName, arguments: {...real args...}, toolCallId }); unwrap so
    // downstream code finds path/command directly.
    const toolArgs = ((evtData as { arguments?: Record<string, unknown> }).arguments ?? evtData) as Record<string, unknown>;

    const tcId = evtData.toolCallId as string | undefined;
    if (tcId && tcName) state.toolCallIdMap.set(tcId, tcName);

    recordAssistantToolCall(tcName, toolArgs);
    state.traceCollector?.onToolStart(tcName, toolArgs);
    state.hadToolCalls = true;
    return { handled: true, phase: "start", toolName: tcName, toolArgs };
  }

  if (TOOL_END_EVENT_TYPES.has(evtType)) {
    const tcName = (evtData.toolName ?? evtData.name) as string | undefined;
    if (!tcName) return { handled: true, phase: "end" };

    state.traceCollector?.onToolEnd(tcName, evtData, evtData.result ?? evtData.output ?? null);
    return { handled: true, phase: "end", toolName: tcName };
  }

  return { handled: false, phase: null };
}
