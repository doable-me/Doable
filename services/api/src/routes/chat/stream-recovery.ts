/**
 * Stream recovery: auto-continue (stall detection) and empty-response retry.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import type { CopilotEngine } from "../../ai/providers/copilot.js";
import { mapEventToSSE, ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { stripServerPaths } from "../../ai/tool-messages.js";

const MAX_AUTO_CONTINUE = 6;
const MAX_READ_ONLY_CYCLES = 3;
const FILE_WRITE_TOOLS = new Set(["create_file", "edit_file", "write_file", "create", "edit", "write"]);
const READ_TOOLS = new Set(["read_file", "list_files", "search_files", "read", "list", "search"]);

/** Run auto-continue loops if AI explored but wrote 0 files. */
export async function handleAutoContinue(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  projectId: string,
  mode: string,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
): Promise<void> {
  if (mode === "plan") return;

  let autoContinueCount = 0;
  let prevReadFingerprint = "";
  let consecutiveReadOnlyCycles = 0;

  while (autoContinueCount < MAX_AUTO_CONTINUE) {
    const wroteFiles = state.assistantToolCalls.some(
      (tc) => FILE_WRITE_TOOLS.has((tc as { name?: string }).name ?? ""),
    );
    if (!state.hadToolCalls || wroteFiles) break;

    // Stall detection: same-file fingerprinting
    const toolCallsSinceLastContinue = autoContinueCount === 0
      ? state.assistantToolCalls
      : state.assistantToolCalls.slice(-20);
    const readFiles = toolCallsSinceLastContinue
      .filter((tc) => READ_TOOLS.has((tc as { name?: string }).name ?? ""))
      .map((tc) => {
        const args = tc as Record<string, unknown>;
        return String(args.path ?? args.file_path ?? args.filePath ?? args.name ?? "");
      })
      .sort()
      .join("|");

    if (autoContinueCount > 0 && readFiles === prevReadFingerprint && readFiles !== "") {
      state.traceCollector?.onError(`Stall: same files read in consecutive continues: ${readFiles.slice(0, 100)}`, "auto_continue_fingerprint");
      console.warn(`[Chat][${projectId.slice(0, 8)}] stall detected — same files read`);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          data: "The AI appears to be stuck reading the same files without making progress. Try rephrasing your request or check the preview for errors.",
        }),
      }).catch(() => {});
      break;
    }
    prevReadFingerprint = readFiles;

    consecutiveReadOnlyCycles++;
    if (consecutiveReadOnlyCycles >= MAX_READ_ONLY_CYCLES) {
      state.traceCollector?.onError(`Stall: ${consecutiveReadOnlyCycles} consecutive read-only continues`, "auto_continue_write_free");
      console.warn(`[Chat][${projectId.slice(0, 8)}] stall detected — ${consecutiveReadOnlyCycles} read-only continues`);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          data: "The AI has been investigating without making changes. Please provide more specific guidance, or check the preview console for errors.",
        }),
      }).catch(() => {});
      break;
    }

    autoContinueCount++;
    state.traceCollector?.onAutoContinue(autoContinueCount, `read-only cycle ${autoContinueCount}/${MAX_AUTO_CONTINUE}`);
    console.log(`[Chat][${projectId.slice(0, 8)}] auto-continue attempt ${autoContinueCount}/${MAX_AUTO_CONTINUE}`);

    try {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "status",
          data: { phase: "continuing", message: `Continuing to build\u2026 (step ${autoContinueCount})` },
        }),
      });
      await engine.sendMessage(
        sessionId,
        "You explored the project and installed packages but haven't created any files yet. Continue building NOW — create all the files the user asked for. Do NOT stop until the app is working in the preview.",
        undefined,
        (evt: import("@github/copilot-sdk").SessionEvent) => {
          const evtType = (evt as Record<string, unknown>).type as string;
          const evtData = (evt as Record<string, unknown>).data as Record<string, unknown> | undefined;
          if (state.usageCollector) state.usageCollector.onUsageEvent(evt);
          state.traceCollector?.onSdkEvent(evt as Record<string, unknown>);
          if (evtType === "tool.execution_start") {
            const toolName = (evtData?.toolName ?? evtData?.name ?? "") as string;
            recordAssistantToolCall(toolName, evtData as Record<string, unknown>);
            if (toolName) state.traceCollector?.onToolStart(toolName, evtData);
            state.hadToolCalls = true;
          }
          if (evtType === "tool.execution_complete" || evtType === "tool.completed") {
            const toolName = (evtData?.toolName ?? evtData?.name ?? "") as string;
            if (toolName) state.traceCollector?.onToolEnd(toolName, evtData, evtData?.result ?? evtData?.output ?? null);
          }
          const sseData = mapEventToSSE(evt as Record<string, unknown>);
          if (!sseData) return;
          if (sseData.type === "text_delta") {
            const cleaned = typeof sseData.data === "string" ? sseData.data : "";
            if (cleaned) {
              state.assistantContent += cleaned;
              stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: cleaned }) }).catch(() => {});
            }
          } else if (sseData.type === "thinking") {
            const t = typeof sseData.data === "string" ? sseData.data : "";
            if (t) state.assistantThinking += t;
            stream.writeSSE({ data: JSON.stringify(sseData) }).catch(() => {});
          } else {
            stream.writeSSE({ data: JSON.stringify(sseData) }).catch(() => {});
          }
        },
      );
      console.log(`[Chat][${projectId.slice(0, 8)}] auto-continue ${autoContinueCount} done`);
    } catch (err) {
      console.warn(`[Chat][${projectId.slice(0, 8)}] auto-continue ${autoContinueCount} failed:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  // Safety ceiling notification
  if (autoContinueCount >= MAX_AUTO_CONTINUE) {
    const stillNoFiles = !state.assistantToolCalls.some(
      (tc) => FILE_WRITE_TOOLS.has((tc as { name?: string }).name ?? ""),
    );
    if (stillNoFiles) {
      console.warn(`[Chat][${projectId.slice(0, 8)}] auto-continue hit ceiling`);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          data: "The AI needed more steps than expected. It may be blocked by a configuration issue. Check the preview for errors or try a simpler request.",
        }),
      }).catch(() => {});
    }
  }
}

/** Retry once if model returned completely empty (0 content, 0 thinking, 0 tool calls). */
export async function handleEmptyResponseRetry(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  projectId: string,
  augmentedContent: string,
  fileAttachments: Array<{ type: "file"; path: string; displayName?: string }>,
): Promise<void> {
  if (state.assistantContent || state.assistantThinking || state.hadToolCalls) return;

  console.warn(`[Chat][${projectId.slice(0, 8)}] empty response — auto-retrying once`);
  await stream.writeSSE({
    data: JSON.stringify({ type: "status", data: { phase: "retrying", message: "Model returned empty — retrying..." } }),
  });

  try {
    const retryRouter = new ChannelTokenRouter();
    await engine.sendMessage(
      sessionId,
      augmentedContent,
      fileAttachments.length > 0 ? fileAttachments : undefined,
      (retryEvent: import("@github/copilot-sdk").SessionEvent) => {
        const rType = (retryEvent as Record<string, unknown>).type as string;
        if (state.usageCollector) state.usageCollector.onUsageEvent(retryEvent);
        const retrySseData = mapEventToSSE(retryEvent);
        if (retrySseData?.type === "text_delta") {
          const rawDelta = typeof retrySseData.data === "string" ? retrySseData.data : "";
          for (const chunk of retryRouter.process(rawDelta)) {
            if (!chunk.content) continue;
            if (chunk.type === "text") {
              state.assistantContent += chunk.content;
              stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
            } else {
              state.assistantThinking += chunk.content;
              stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
            }
          }
        } else if (retrySseData?.type === "thinking") {
          const td = typeof retrySseData.data === "string" ? retrySseData.data : "";
          state.assistantThinking += td;
          stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(td) }) }).catch(() => {});
        } else if (retrySseData && retrySseData.type !== "done") {
          if (retrySseData.type === "tool_call" || retrySseData.type === "tool_result") state.hadToolCalls = true;
          stream.writeSSE({ data: JSON.stringify(retrySseData) }).catch(() => {});
        }
      },
    );
    for (const chunk of retryRouter.flush()) {
      if (!chunk.content) continue;
      if (chunk.type === "text") {
        state.assistantContent += chunk.content;
        await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) });
      } else {
        state.assistantThinking += chunk.content;
        await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) });
      }
    }
    console.log(`[Chat][${projectId.slice(0, 8)}] retry result — content: ${state.assistantContent.length}, thinking: ${state.assistantThinking.length}, tools: ${state.hadToolCalls}`);
  } catch (retryErr) {
    console.warn(`[Chat][${projectId.slice(0, 8)}] retry failed:`, retryErr instanceof Error ? retryErr.message : String(retryErr));
  }

  // If STILL empty, inform the user
  if (!state.assistantContent && !state.assistantThinking && !state.hadToolCalls) {
    await stream.writeSSE({
      data: JSON.stringify({
        type: "error",
        data: "The AI model returned an empty response after retrying. This is usually a rate limiting issue. Try again in a moment, or switch to a different model in AI Settings.",
      }),
    });
  }
}
