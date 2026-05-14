/**
 * Post-processing after AI streaming completes: auto-fix preview errors,
 * version control, memory update, thumbnail capture, final DB save,
 * usage/trace flush, and done signal.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import { sql } from "../../db/index.js";
import { isProjectScaffolded, getProjectPath } from "../../projects/file-manager.js";
import { autoVersion } from "../../version-control/manager.js";
import { isGitRepo } from "../../git/init.js";
import { autoCommit } from "../../git/commits.js";
import { contextManager } from "../../context/manager.js";
import { broadcastToRoom } from "../../ai/yjs-bridge.js";
import { detectPreviewError, buildAutoFixPrompt } from "../../ai/preview-errors.js";
import { extractPlanFromResponse } from "../../ai/plan-parser.js";
import { mapEventToSSE } from "../../ai/sse-mapper.js";
import { scheduleThumbnailCapture } from "../../ai/thumbnail.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { finalSaveAssistantMessage } from "./message-persistence.js";
import { activeRequests } from "./session-state.js";

const ctxManager = contextManager(sql);

/** Auto-detect and fix preview errors after tool calls. */
export async function handleAutoFixPreview(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  projectId: string,
  resolvedGithubToken: string | undefined,
  sessionId: string,
): Promise<void> {
  if (!state.hadToolCalls || !isProjectScaffolded(projectId)) return;

  try {
    const MAX_FIX_ATTEMPTS = 3;
    let fixedSuccessfully = false;

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
      await stream.writeSSE({
        data: JSON.stringify({ type: "status", data: { phase: "checking", message: "Checking preview for errors..." } }),
      });

      await new Promise((r) => setTimeout(r, 1500));
      const previewError = await detectPreviewError(projectId);
      if (!previewError) {
        if (attempt > 0) {
          await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "fixed", message: "Error fixed successfully" } }) });
          await stream.writeSSE({ data: JSON.stringify({ type: "auto_fix_complete", data: { success: true } }) });
        }
        fixedSuccessfully = true;
        break;
      }

      console.log(`[Chat] Preview error detected (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS}): ${previewError.message.slice(0, 200)}`);
      await stream.writeSSE({
        data: JSON.stringify({ type: "status", data: { phase: "fixing", message: "Found an error — fixing it automatically...", attempt: attempt + 1 } }),
      });
      await stream.writeSSE({
        data: JSON.stringify({ type: "text_delta", data: `\n\n---\n**Preview error detected — auto-fixing (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})...**\n\n` }),
      });

      try {
        const fixEngine = await getCopilotManager().getEngine(projectId, resolvedGithubToken);
        await fixEngine.sendMessage(
          sessionId,
          buildAutoFixPrompt(previewError.message),
          undefined,
          (event: import("@github/copilot-sdk").SessionEvent) => {
            const sseData = mapEventToSSE(event);
            if (sseData) stream.writeSSE({ data: JSON.stringify(sseData) }).catch(() => {});
          },
        );
      } catch (fixErr) {
        console.warn(`[Chat] Auto-fix attempt ${attempt + 1} failed:`, fixErr);
        break;
      }
      await stream.writeSSE({
        data: JSON.stringify({ type: "status", data: { phase: "verifying", message: "Verifying the fix..." } }),
      });
    }

    if (!fixedSuccessfully) {
      await new Promise((r) => setTimeout(r, 1500));
      const finalError = await detectPreviewError(projectId);
      if (!finalError) {
        await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "fixed", message: "Error fixed successfully" } }) });
        await stream.writeSSE({ data: JSON.stringify({ type: "auto_fix_complete", data: { success: true } }) });
      } else {
        await stream.writeSSE({ data: JSON.stringify({ type: "auto_fix_complete", data: { success: false, error: finalError.message } }) });
      }
    }
  } catch (autoFixErr) {
    console.warn("[Chat] Auto-fix system failed:", autoFixErr);
  }
}

/** Auto-version, memory update, and thumbnail capture. */
export async function handleVersionAndMemory(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  projectId: string,
  userId: string,
  content: string,
  messageId: string,
): Promise<void> {
  state.traceCollector?.onSseEmit("post_processing_start", { phase: "version_control", hadToolCalls: state.hadToolCalls });

  if (state.hadToolCalls && isProjectScaffolded(projectId)) {
    try {
      const projectPath = getProjectPath(projectId);
      if (isGitRepo(projectPath)) {
        const commitInfo = await autoCommit(projectPath, content.slice(0, 100), { type: "ai", sessionMessageId: messageId });
        if (commitInfo) {
          state.versionSha = commitInfo.sha;
          await stream.writeSSE({ data: JSON.stringify({ type: "version_created", data: { sha: commitInfo.sha, messageId } }) });
        }
      } else {
        await autoVersion(projectId, projectPath, content.slice(0, 100), userId);
      }
    } catch (vErr) {
      console.warn("[Chat] Auto-version failed:", vErr);
    }

    try {
      await sql`UPDATE projects SET updated_at = NOW() WHERE id = ${projectId}`;
    } catch { /* Non-critical */ }

    try {
      const summary = content.slice(0, 120).replace(/\n/g, " ");
      await ctxManager.appendToMemory(projectId, `User asked: "${summary}${content.length > 120 ? "..." : ""}" — AI made file changes.`);
    } catch { /* Non-critical */ }
  }

  state.traceCollector?.onSseEmit("post_processing", { phase: "version_control_done" });
  if (state.hadToolCalls) scheduleThumbnailCapture(projectId);

  // Broadcast stream end
  broadcastToRoom(projectId, {
    type: "ai:stream-end",
    messageId,
    finalContent: state.assistantContent.slice(0, 500),
  }, userId).catch(() => {});
}

/** Final save, cleanup, plan save, usage flush, and done signal. */
export async function handleFinalCleanup(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  projectId: string,
  mode: string,
  keepAlive: ReturnType<typeof setInterval>,
  softHeartbeat: ReturnType<typeof setInterval>,
): Promise<void> {
  // Final save assistant message
  state.traceCollector?.onSseEmit("post_processing", { phase: "db_save_start" });
  await finalSaveAssistantMessage(
    state.assistantMessageId,
    state.assistantContent,
    state.hadToolCalls,
    state.assistantToolCalls,
    state.versionSha,
    state.assistantThinking,
  );

  // Clear active stream markers
  activeRequests.delete(projectId);
  sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});

  // In plan mode, save assistant response as .doable/plan.md
  if (mode === "plan" && state.assistantContent) {
    try {
      const planContent = extractPlanFromResponse(state.assistantContent);
      if (planContent) {
        await ctxManager.updateContextFile(projectId, "plan.md", planContent);
      }
    } catch { /* Non-critical */ }
  }

  clearInterval(keepAlive);
  clearInterval(softHeartbeat);

  // Flush usage data
  if (state.usageCollector) {
    try { await state.usageCollector.flush(); } catch { /* non-critical */ }
    const usage = state.usageCollector.getAccumulatedUsage();
    if (usage.tokensAvailable) {
      await stream.writeSSE({ data: JSON.stringify({ type: "usage", data: usage }) });
    }
    if (state.traceCollector) {
      // Intentionally NOT calling setSessionId("") — that would blank the
      // SDK session id we want preserved on chat_traces for post-mortem
      // correlation. The SDK session lifecycle is managed by
      // projectSessions / ai_sessions, not by the trace context.
      if (state.assistantMessageId) state.traceCollector.setMessageId(state.assistantMessageId);
      state.traceCollector.complete("completed", {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        thinkingTokens: usage.thinkingTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        model: usage.model,
      }).catch(() => {});
    }
  } else if (state.traceCollector) {
    // Same rationale as above — do not wipe session_id on the trace row.
    if (state.assistantMessageId) state.traceCollector.setMessageId(state.assistantMessageId);
    state.traceCollector.complete("completed").catch(() => {});
  }

  // Done signal
  try {
    await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "complete", message: "Done" } }) });
  } catch { /* stream already closed */ }
  console.log(`[Chat] Sending [DONE] for ${projectId}`);
  state.traceCollector?.onStreamEnd("done", state.sseFrameCount);
  await stream.writeSSE({ data: "[DONE]" });
}

/** Handle outer catch: error path with partial save and cleanup. */
export async function handleStreamError(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  err: unknown,
  projectId: string,
  keepAlive: ReturnType<typeof setInterval>,
  softHeartbeat: ReturnType<typeof setInterval>,
): Promise<void> {
  activeRequests.delete(projectId);
  sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`.catch(() => {});
  clearInterval(keepAlive);
  clearInterval(softHeartbeat);
  if (state.usageCollector) await state.usageCollector.flush().catch(() => {});

  const errMsg = err instanceof Error ? err.message : String(err);
  if (state.traceCollector) {
    state.traceCollector.onError(errMsg, "catch_block");
    state.traceCollector.onStreamEnd("error", state.sseFrameCount);
    state.traceCollector.complete("error", state.usageCollector ? {
      promptTokens: state.usageCollector.getAccumulatedUsage().promptTokens,
      completionTokens: state.usageCollector.getAccumulatedUsage().completionTokens,
      totalTokens: state.usageCollector.getAccumulatedUsage().totalTokens,
    } : undefined).catch(() => {});
  }
  console.error("[Chat] Copilot SDK error:", errMsg);
  if (err instanceof Error && err.stack) {
    console.error("[Chat] Stack trace:", err.stack);
  }

  // Save partial assistant message
  await finalSaveAssistantMessage(
    state.assistantMessageId,
    state.assistantContent,
    state.hadToolCalls,
    state.assistantToolCalls,
    state.versionSha,
    state.assistantThinking,
  );

  await stream.writeSSE({
    data: JSON.stringify({
      type: "error",
      data: `Copilot SDK error: ${errMsg}. Ensure you have a GitHub Copilot subscription or configure BYOK in settings.`,
    }),
  });
  await stream.writeSSE({ data: "[DONE]" });
}
