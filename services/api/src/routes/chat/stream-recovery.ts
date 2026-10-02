import { cycleFingerprint } from "./execution-state.js";
import { classifyProviderError } from "../../ai/provider-error.js";
/**
 * Stream recovery: auto-continue (stall detection) and empty-response retry.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import type { CopilotEngine } from "../../ai/providers/copilot.js";
import { mapEventToSSE, ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { recordToolEventForTrace } from "./tool-event-bookkeeping.js";

export interface RecoveryPipeline {
  process: (event: import("@github/copilot-sdk").SessionEvent) => void;
  flush: () => Promise<void>;
}
/** Standalone adapter for callers without the main chat pipeline. Production
 * supplies the SAME processor/flush used by the initial stream. */
function recoveryPipeline(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  provided?: RecoveryPipeline,
): RecoveryPipeline {
  if (provided) return provided;
  const router = new ChannelTokenRouter();
  let rawLength = 0;
  const emit = (type: string, data: unknown) => {
    stream.writeSSE({ data: JSON.stringify({ type, data }) }).catch(() => {});
  };
  const chunks = (items: ReturnType<ChannelTokenRouter["process"]>) => {
    for (const chunk of items) {
      if (chunk.type === "text") state.assistantContent += chunk.content;
      else if (chunk.type === "thinking")
        state.assistantThinking += chunk.content;
      emit(chunk.type === "text" ? "text_delta" : chunk.type, chunk.content);
    }
  };
  return {
    process(event) {
      state.usageCollector?.onUsageEvent(event);
      state.traceCollector?.onSdkEvent(event as Record<string, unknown>);
      const toolEvent = recordToolEventForTrace(
        state,
        event as Record<string, unknown>,
        () => {},
      );
      if (toolEvent.suppressDisplay) return;
      const e = event as unknown as {
        type: string;
        data?: Record<string, unknown>;
      };
      if (e.type === "assistant.message") {
        const full = String(e.data?.content ?? "");
        chunks(router.process(full.slice(rawLength)));
        rawLength = 0;
        return;
      }
      const mapped = mapEventToSSE(event, { preserveThinkingMarkers: true });
      if (!mapped || mapped.type === "done") return;
      if (mapped.type === "text_delta" && typeof mapped.data === "string") {
        rawLength += mapped.data.length;
        chunks(router.process(mapped.data));
        return;
      }
      if (mapped.type === "error") {
        state.runOutcome ??= "error";
        state.traceCollector?.onError(String(mapped.data), "recovery_provider");
      }
      if (mapped.type === "thinking" && typeof mapped.data === "string")
        state.assistantThinking += mapped.data;
      emit(mapped.type, mapped.data);
    },
    async flush() {
      chunks(router.flush());
    },
  };
}

/** A stalled provider may leave a live SDK request behind. Cancel it first,
 * then resume once from the existing ledger; never replay the original request.
 * Unknown tool outcomes are deliberately ineligible for automatic resubmission. */
export async function handleTimeoutRecovery(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  providedPipeline?: RecoveryPipeline,
): Promise<void> {
  if (!state.deferredError || state.timeoutRecoveryAttempted ||
      (state.deferredErrorCode ?? classifyProviderError(state.deferredError)) !== "TIMEOUT") return;
  state.timeoutRecoveryAttempted = true;
  try {
    await engine.quiesceSession(sessionId);
  } catch (error) {
    state.runOutcome ??= "error";
    state.traceCollector?.onError(String(error), "timeout_cancellation");
    return;
  }
  if (state.runOutcome || state.awaitingMcpWidget || state.awaitingSupabaseProvision ||
      state.awaitingIntegrationConnect || state.taskReport?.status === "waiting_for_input" ||
      state.taskReport?.status === "completed" ||
      state.assistantToolCalls.some(tool => tool.status !== "completed" &&
        !(tool.status === "failed" && tool.rejectedWithoutEffects === true))) return;
  state.deferredError = undefined;
  state.deferredErrorCode = undefined;
  state.taskReport = undefined;
  state.recoveryCycle = (state.recoveryCycle ?? 0) + 1;
  state.traceCollector?.onAutoContinue(1, "timeout_resume_after_cancellation");
  await stream.writeSSE({ data: JSON.stringify({ type: "status", data: {
    phase: "continuing", message: "Checking task progress...",
  } }) });
  const pipeline = recoveryPipeline(stream, state, providedPipeline);
  try {
    await engine.sendMessage(sessionId,
      "The previous provider request timed out and has been cancelled. Resume the ORIGINAL user request from the existing conversation and completed tool results. Do not repeat completed changes or external actions. Check existing artifacts before changing them. Work in small verifiable increments. Preserve read-only intent: only modify what the user authorized. Call report_task_status; if input is needed, report waiting_for_input and ask; if fulfilled, report completed and explain the result.",
      undefined, pipeline.process);
    await pipeline.flush();
    // A second timeout must not leave a request running or enter another retry.
    if (state.deferredError) {
      await engine.quiesceSession(sessionId);
      state.runOutcome ??= "error";
    }
  } catch (error) {
    state.runOutcome ??= "error";
    state.deferredError = error instanceof Error ? error.message : String(error);
  }
}

/** Recovery never infers authorization from translated prose. The model reports
 * intent through a validated tool; unknown clients get one reconciliation round. */
export async function handleAutoContinue(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  projectId: string,
  mode: string,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
  _userMessage?: string,
  providedPipeline?: RecoveryPipeline,
): Promise<void> {
  if (
    mode === "plan" ||
    mode === "chat" ||
    state.runOutcome ||
    state.deferredError
  )
    return;
  if (!state.hadToolCalls) return;
  const pipeline = recoveryPipeline(stream, state, providedPipeline);
  let previous = cycleFingerprint(state, state.recoveryCycle ?? 0);
  let unchanged = 0;
  const fail = async (outcome: "stalled" | "error", message: string) => {
    if (state.runOutcome === "aborted") return;
    state.runOutcome = outcome;
    state.traceCollector?.onError(message, `recovery_${outcome}`);
    await stream
      .writeSSE({ data: JSON.stringify({ type: "error", data: message }) })
      .catch(() => {});
  };
  for (let round = 1; round <= 6; round++) {
    if (
      state.runOutcome ||
      state.awaitingMcpWidget ||
      state.awaitingSupabaseProvision ||
      state.awaitingIntegrationConnect
    )
      return;
    const report = state.taskReport;
    if (report?.status === "waiting_for_input") {
      state.runOutcome = "waiting";
      return;
    }
    if (report?.status === "completed") return;
    state.recoveryCycle = (state.recoveryCycle ?? 0) + 1;
    state.taskReport = undefined; // Never reuse the previous cycle's completion report.
    state.traceCollector?.onAutoContinue(
      round,
      "structured_task_reconciliation",
    );
    await stream.writeSSE({
      data: JSON.stringify({
        type: "status",
        data: { phase: "continuing", message: "Checking task progress..." },
      }),
    });
    try {
      await engine.sendMessage(
        sessionId,
        "Reconcile the ORIGINAL user request and the actual tool results. Call report_task_status. If the request was read-only, do not make changes. If it is fulfilled, report completed and stop. If user input is needed, report waiting_for_input and ask. Only continue work explicitly requested and still unfinished, preserving existing results. For an approved plan use get_plan and report verified step outcomes. Never recreate completed work just to produce a file write.",
        undefined,
        pipeline.process,
      );
      await pipeline.flush();
      if (state.deferredError) {
        await fail("error", state.deferredError);
        state.deferredError = undefined;
        return;
      }
    } catch (error) {
      await fail(
        "error",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
    if (state.runOutcome) return;
    const nextReport = state.taskReport as
      | import("./execution-state.js").TaskReport
      | undefined;
    if (nextReport?.status === "completed") return;
    if (nextReport?.status === "waiting_for_input") {
      state.runOutcome = "waiting";
      return;
    }
    if (!nextReport) {
      await fail(
        "stalled",
        "Task status could not be confirmed. Please resume the task or choose a model with tool calling support.",
      );
      return;
    }
    const current = cycleFingerprint(state, state.recoveryCycle);
    unchanged = !current || current === previous ? unchanged + 1 : 0;
    previous = current;
    if (unchanged >= 2) {
      await fail(
        "stalled",
        "The task made no new progress across repeated attempts. You can resume it without losing completed steps.",
      );
      return;
    }
  }
  await fail(
    "stalled",
    "The task reached the continuation limit. Completed work is preserved; resume to continue.",
  );
}

/** Empty-response retry uses the same event and tool ledger as every other cycle. */
export async function handleEmptyResponseRetry(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  projectId: string,
  augmentedContent: string,
  fileAttachments: Array<{ type: "file"; path: string; displayName?: string }>,
  providedPipeline?: RecoveryPipeline,
): Promise<void> {
  if (
    state.runOutcome ||
    state.timeoutRecoveryAttempted ||
    state.assistantContent ||
    state.assistantThinking ||
    state.hadToolCalls
  )
    return;
  const blocked = ["RATE_LIMIT", "QUOTA", "AUTH"].includes(
    state.deferredErrorCode ?? classifyProviderError(state.deferredError),
  );
  if (blocked) {
    state.runOutcome = "error";
    await stream.writeSSE({
      data: JSON.stringify({ type: "error", data: state.deferredError }),
    });
    state.deferredError = undefined;
    return;
  }
  const priorError = state.deferredError;
  state.deferredError = undefined;
  state.deferredErrorCode = undefined;
  state.recoveryCycle = (state.recoveryCycle ?? 0) + 1;
  const pipeline = recoveryPipeline(stream, state, providedPipeline);
  await stream.writeSSE({
    data: JSON.stringify({
      type: "status",
      data: {
        phase: "retrying",
        message: "Model returned empty — retrying...",
      },
    }),
  });
  try {
    await engine.sendMessage(
      sessionId,
      augmentedContent,
      fileAttachments.length ? fileAttachments : undefined,
      pipeline.process,
    );
    await pipeline.flush();
  } catch (error) {
    state.runOutcome ??= "error";
    state.deferredError =
      error instanceof Error ? error.message : String(error);
  }
  if (
    state.deferredError ||
    (!state.assistantContent && !state.assistantThinking && !state.hadToolCalls)
  ) {
    state.runOutcome ??= "error";
    const message =
      state.deferredError ??
      priorError ??
      "The AI model returned an empty response. Please try again or choose a different model.";
    state.traceCollector?.onError(message, "empty_response_retry");
    await stream.writeSSE({
      data: JSON.stringify({ type: "error", data: message }),
    });
    state.deferredError = undefined;
  }
}
