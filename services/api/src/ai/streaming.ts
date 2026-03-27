import type {
  ClarificationQuestion,
  Plan,
  PlanStepStatus,
  StreamEvent,
  StreamEventType,
  StreamEventData,
  ToolResult,
} from "@doable/shared/types/ai.js";

// ─── Event Factories ──────────────────────────────────────

export function createStreamEvent(
  type: StreamEventType,
  data: StreamEventData,
): StreamEvent {
  return { type, data, timestamp: Date.now() };
}

export function thinkingEvent(content: string): StreamEvent {
  return createStreamEvent("thinking", { content });
}

export function textEvent(content: string): StreamEvent {
  return createStreamEvent("text", { content });
}

export function toolCallEvent(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
): StreamEvent {
  return createStreamEvent("tool_call", {
    toolCallId,
    toolName,
    arguments: args,
  });
}

export function toolResultEvent(
  toolCallId: string,
  toolName: string,
  result: ToolResult,
): StreamEvent {
  return createStreamEvent("tool_result", {
    toolCallId,
    toolName,
    result,
  });
}

export function codeDiffEvent(
  filePath: string,
  diff: string,
  action: "create" | "edit" | "delete",
): StreamEvent {
  return createStreamEvent("code_diff", { filePath, diff, action });
}

export function errorEvent(
  message: string,
  code?: string,
  recoverable = false,
): StreamEvent {
  return createStreamEvent("error", { message, code, recoverable });
}

export function doneEvent(duration: number, totalTokens?: number): StreamEvent {
  return createStreamEvent("done", { duration, totalTokens });
}

export function clarificationEvent(questions: ClarificationQuestion[]): StreamEvent {
  return createStreamEvent("clarification", { questions });
}

export function planEvent(plan: Plan): StreamEvent {
  return createStreamEvent("plan", { plan });
}

export function planStepUpdateEvent(planId: string, stepId: string, status: PlanStepStatus): StreamEvent {
  return createStreamEvent("plan_step_update", { planId, stepId, status });
}

// ─── SSE Serialization ────────────────────────────────────

export function serializeSSE(event: StreamEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

export function serializeSSEComment(comment: string): string {
  return `: ${comment}\n\n`;
}

// ─── SSE Headers ──────────────────────────────────────────

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
