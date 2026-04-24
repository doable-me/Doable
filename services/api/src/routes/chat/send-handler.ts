/**
 * POST /projects/:id/chat — SSE streaming handler (orchestrator).
 * Coordinates all chat stream phases: setup, session management,
 * message sending, recovery, and post-processing.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { sql } from "../../db/index.js";
import { projectQueries, workspaceQueries } from "@doable/db";
import { createAllTools,
  onToolEvent,
  type ByokProviderConfig,
} from "../../ai/providers/copilot.js";
import { getCopilotManager } from "../../ai/providers/copilot-manager.js";
import { createUsageCollector } from "../../ai/usage-collector.js";
import { createTraceCollector, type TraceCollector } from "../../ai/trace-collector.js";
import { creditQueries } from "@doable/db/queries/credits";
import { getProjectPath } from "../../projects/file-manager.js";
import { resolveAiEngine } from "../../ai/engine-resolver.js";
import { buildProjectContextForMode } from "../../ai/context-builder.js";
import { processAttachments } from "../../ai/attachments.js";
import { ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { stripServerPaths } from "../../ai/tool-messages.js";
import { broadcastToRoom } from "../../ai/yjs-bridge.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { createInitialState } from "./types.js";
import { projectSessions, activeRequests } from "./session-state.js";
import { buildSystemPrompt } from "./system-prompts.js";
import { createRecordAssistantToolCall, createToolProgressCallbacks } from "./tool-callbacks.js";
import { createProcessEvent } from "./event-processor.js";
import { popArtifacts } from "./artifact-stash.js";
import { scaffoldAndStartDev, emitConfigTraces, logToolManifest, handleToolEndEvent } from "./send-helpers.js";
import { checkAndEvictOnModeChange, resolveSession, persistSessionToDb, filterToolsForMode, recreateSession } from "./session-manager.js";
import { resolveUserDisplay, saveUserMessage, preInsertAssistantMessage } from "./message-persistence.js";
import { handleAutoContinue, handleEmptyResponseRetry } from "./stream-recovery.js";
import { handleAutoFixPreview, handleVersionAndMemory, handleFinalCleanup, handleStreamError } from "./post-processing.js";

async function assertToolCapableModel(providerId: string | undefined, modelId: string | undefined): Promise<void> {
  if (!providerId || !modelId) return;

  const [modelRow] = await sql<{ supports_tools: boolean }[]>`
    SELECT supports_tools
    FROM ai_provider_models
    WHERE provider_id = ${providerId} AND model_id = ${modelId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (modelRow && modelRow.supports_tools === false) {
    throw new Error("Selected model does not support tool calling. Choose a model with tool calling enabled in AI Settings.");
  }

  // Fallback to provider-level capability when model-level metadata is unavailable.
  const [providerRow] = await sql<{ supports_tools: boolean | null }[]>`
    SELECT supports_tools
    FROM ai_providers
    WHERE id = ${providerId}
    LIMIT 1
  `;
  if (!modelRow && providerRow?.supports_tools === false) {
    throw new Error("Selected provider does not support tool calling. Switch to a provider/model that supports tools.");
  }
}

const sendMessageSchema = z.object({
  content: z.string().min(1).max(100_000),
  // Optional short label to persist in chat history in place of `content` (which
  // may contain large injected tool/skill instructions that shouldn't pollute
  // the user-visible transcript). The LLM still receives the full `content`.
  displayContent: z.string().max(4_000).optional(),
  mode: z.enum(["agent", "plan", "visual-edit"]).default("agent"),
  model: z.string().optional(),
  provider: z.object({
    type: z.enum(["openai", "azure", "anthropic"]).optional(),
    baseUrl: z.string(),
    apiKey: z.string().optional(),
  }).optional(),
  providerId: z.string().uuid().optional(),
  copilotAccountId: z.string().uuid().optional(),
  attachments: z.array(z.object({
    type: z.string(),
    data: z.string(),
    name: z.string(),
  })).max(5).optional(),
});

export function registerSendHandler(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat",
    bodyLimit({ maxSize: 20 * 1024 * 1024 }),
    zValidator("json", sendMessageSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const { content, displayContent, mode, model, provider, providerId, copilotAccountId, attachments } = c.req.valid("json");
      const userId = c.get("userId")!;

      // Verify project access — must be at least a member (viewers are read-only)
      const chatProject = await projectQueries(sql).findById(projectId);
      if (!chatProject) return c.json({ error: "Project not found" }, 404);
      const chatRole = await workspaceQueries(sql).getMemberRole(chatProject.workspace_id, userId);
      if (!chatRole) {
        // Check project_collaborators as fallback
        const [collab] = await sql<{ role: string }[]>`
          SELECT role FROM project_collaborators
          WHERE project_id = ${projectId} AND user_id = ${userId}
        `;
        if (!collab) return c.json({ error: "Access denied" }, 403);
      }
      const effectiveRole = chatRole ?? "member"; // collaborators treated as members
      if (effectiveRole === "viewer") {
        return c.json({ error: "Viewers cannot use AI chat" }, 403);
      }

      let augmentedContent = content;
      let fileAttachments: Array<{ type: "file"; path: string; displayName?: string }> = [];
      if (attachments && attachments.length > 0) {
        const processed = processAttachments(attachments, content);
        augmentedContent = processed.augmentedPrompt;
        fileAttachments = processed.fileAttachments;
      }

      c.header("X-Accel-Buffering", "no");

      // Detach generation from the HTTP request: when the client disconnects
      // (page refresh, navigation, network blip), do NOT abort the in-flight
      // Copilot session. Generation continues in the background and the final
      // assistant message is persisted via finalSaveAssistantMessage in
      // handleFinalCleanup. On reconnect, the client rehydrates via
      // GET /chat/history (full saved message) + /chat/status (streaming flag).
      //
      // We still track the disconnect so SSE writes become no-ops, preventing
      // the async handler from throwing before it reaches the DB save.
      let clientDisconnected = false;
      c.req.raw.signal.addEventListener("abort", () => {
        clientDisconnected = true;
        console.log(`[Chat] client disconnected for ${projectId.slice(0, 8)} — generation continues in background`);
      });

      return streamSSE(c, async (stream) => {
        // Make SSE writes resilient after client disconnect so the rest of the
        // pipeline (tool events, final save, cleanup) still runs to completion.
        const originalWriteSSE = stream.writeSSE.bind(stream);
        stream.writeSSE = async (message: Parameters<typeof originalWriteSSE>[0]) => {
          if (clientDisconnected) return;
          try {
            await originalWriteSSE(message);
          } catch {
            clientDisconnected = true;
          }
        };

        const state = createInitialState();
        const keepAlive = setInterval(async () => {
          try { await stream.writeSSE({ data: JSON.stringify({ type: "keep_alive" }) }); } catch {}
        }, 10_000);
        const softHeartbeat = setInterval(async () => {
          const sseSilence = Date.now() - state.lastSseEmitAt;
          if (sseSilence < 3_000) return;
          const realSilence = Date.now() - state.lastRealEventAt;
          let msg: string;
          if (realSilence < 15_000) msg = state.friendlyLastTool ? `Working on ${state.friendlyLastTool}\u2026` : "Thinking\u2026";
          else if (realSilence < 30_000) msg = state.friendlyLastTool ? `Still working on ${state.friendlyLastTool}\u2026` : "Still thinking\u2026";
          else if (realSilence < 60_000) msg = "Working on a complex step \u2014 hold on\u2026";
          else msg = "This one's taking a while \u2014 still going\u2026";
          try {
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: msg } }) });
            state.lastSseEmitAt = Date.now();
            state.sseFrameCount++;
          } catch {}
        }, 3_000);
        const recordAssistantToolCall = createRecordAssistantToolCall(state);

        try {
          await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: "Setting up..." }) });
          await scaffoldAndStartDev(projectId, stream, userId);

          const sessionKey = mode === "visual-edit" ? `${projectId}:visual-edit` : projectId;
          const [aiConfig, workspaceRow] = await Promise.all([
            resolveAiEngine(projectId, userId, { copilotAccountId, providerId, provider: provider as ByokProviderConfig | undefined, model }),
            sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`.catch(() => []),
          ]);
          const {
            model: resolvedModel,
            provider: resolvedProvider,
            githubToken: resolvedGithubToken,
            providerId: resolvedProviderId,
            modelSource,
            providerSource,
          } = aiConfig;
          const workspaceId: string | undefined = workspaceRow[0]?.workspace_id;

          await assertToolCapableModel(resolvedProviderId, resolvedModel);

          state.usageCollector = workspaceId ? createUsageCollector({ userId, workspaceId, projectId, provider: resolvedProvider ? "byok" : "copilot", providerLabel: resolvedProvider?.type ?? "GitHub Copilot", byokProviderId: providerId, mode }) : null;
          state.traceCollector = workspaceId ? createTraceCollector({ projectId, userId, workspaceId, provider: resolvedProvider ? "byok" : "copilot", providerLabel: resolvedProvider?.type ?? "GitHub Copilot", model: resolvedModel }) : null;
          state.traceCollector?.onRequestStart(augmentedContent?.length ?? null, mode ?? "agent", !!(attachments?.length));
          state.traceCollector?.onStreamStart();
          state.traceCollector?.recordUserMessage(augmentedContent);

          if (!resolvedProvider && !resolvedGithubToken) {
            const missingAuthMsg = "AI is not configured for this workspace/user. Connect a GitHub Copilot account or add a custom provider key in Settings > AI.";
            state.traceCollector?.onError(missingAuthMsg, "AUTH", "missing_auth_or_provider");
            throw new Error(missingAuthMsg);
          }

          const [projectContext, allTools] = await Promise.all([
            buildProjectContextForMode(projectId, mode, workspaceId, userId),
            createAllTools(projectId, workspaceId, userId),
          ]);
          const systemPrompt = buildSystemPrompt(mode, projectId, projectContext);
          const projectPath = getProjectPath(projectId);
          emitConfigTraces(state.traceCollector, resolvedModel, modelSource, resolvedProvider, providerSource, resolvedGithubToken, systemPrompt, projectContext);

          const sessionTools = await filterToolsForMode(allTools, mode);
          logToolManifest(allTools, sessionTools, mode, projectId, state.traceCollector);

          const toolProgress = createToolProgressCallbacks(stream, state, state.traceCollector, recordAssistantToolCall, projectId);
          const modeChanged = checkAndEvictOnModeChange(sessionKey, mode, state.traceCollector);
          let sessionId = await resolveSession(projectId, userId, sessionKey, mode, modeChanged, resolvedModel, resolvedProvider, resolvedGithubToken, projectPath, systemPrompt, sessionTools, toolProgress, state.traceCollector, stream);
          const dbSessionId = await persistSessionToDb(projectId, userId, mode, sessionId);
          if (state.usageCollector && dbSessionId) state.usageCollector.setSessionId(dbSessionId);

          const { displayName, color } = await resolveUserDisplay(userId);
          if (dbSessionId) await saveUserMessage(dbSessionId, displayContent ?? content, userId, displayName, color);
          const messageId = crypto.randomUUID();
          broadcastToRoom(projectId, { type: "ai:message-sent", userId, displayName, content: content.slice(0, 200), messageId }, userId).catch(() => {});

          activeRequests.set(projectId, { mode, startedAt: Date.now() });
          sql`INSERT INTO ai_active_streams (project_id, message_id) VALUES (${projectId}, ${messageId}) ON CONFLICT (project_id) DO UPDATE SET message_id = ${messageId}, started_at = now()`.catch(() => {});
          if (dbSessionId) state.assistantMessageId = await preInsertAssistantMessage(dbSessionId);

          const unsubToolEvents = onToolEvent(projectId, (toolName, status, args) => {
            if (status === "start") {
              const fileName = args?.path ?? args?.filePath ?? args?.file ?? args?.name ?? args?.target ?? "";
              const shortName = typeof fileName === "string" ? fileName.split("/").pop() ?? "" : "";
              if (shortName) {
                let statusMsg = "";
                if (toolName.toLowerCase().includes("create") || toolName.toLowerCase().includes("write")) statusMsg = `Creating ${shortName}...`;
                else if (toolName.toLowerCase().includes("edit") || toolName.toLowerCase().includes("update")) statusMsg = `Updating ${shortName}...`;
                else if (toolName.toLowerCase().includes("read")) statusMsg = `Reading ${shortName}...`;
                else if (toolName.toLowerCase().includes("delete")) statusMsg = `Deleting ${shortName}...`;
                else statusMsg = `Working on ${shortName}...`;
                const ssePayload = { type: "status", data: { phase: "building", message: statusMsg } };
                stream.writeSSE({ data: JSON.stringify(ssePayload) }).catch(() => {});
                broadcastToRoom(projectId, { type: "ai:status", messageId, data: ssePayload.data }, userId).catch(() => {});
              }
            }
            if (status !== "end") return;
            handleToolEndEvent(stream, toolName, args, projectId);
          });
          const releaseTracker = getCopilotManager().trackRequest(projectId);

          try {
            const manager = getCopilotManager();
            let currentEngine = await manager.getEngine(projectId, resolvedGithubToken);
            if (mode === "plan" && sessionId) {
              try { await currentEngine.setSessionMode(sessionId, "plan"); state.traceCollector?.onSessionModeSwitch(sessionId, "interactive", "plan"); } catch (err) { console.warn(`[Chat] setSessionMode(plan) failed:`, err instanceof Error ? err.message : err); }
            }
            const channelRouter = new ChannelTokenRouter();
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: "Waiting for AI model to respond..." } }) });

            const processEvent = createProcessEvent(stream, state, channelRouter, projectId, userId, messageId, mode, recordAssistantToolCall,
              (sid, reqId, action) => currentEngine.respondToExitPlanMode(sid, reqId, action).catch((e: unknown) => console.warn("[Chat] respondToExitPlanMode failed:", e instanceof Error ? e.message : e)),
              () => sessionId,
            );

            try {
              await currentEngine.sendMessage(sessionId!, augmentedContent, fileAttachments.length > 0 ? fileAttachments : undefined, processEvent);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes("not found") || msg.includes("not started") || msg.includes("stopped")) {
                console.log(`[Chat] Session/engine lost for ${projectId}: ${msg.slice(0, 80)}`);
                state.traceCollector?.onSessionEvict(sessionId!, `session_lost:${msg.slice(0, 80)}`);
                stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "reconnecting", message: "Reconnecting to AI..." } }) }).catch(() => {});
                const recreated = await recreateSession(projectId, userId, sessionKey, mode, resolvedModel, resolvedProvider, resolvedGithubToken, projectPath, systemPrompt, toolProgress, state.traceCollector, workspaceId, dbSessionId);
                sessionId = recreated.sessionId;
                currentEngine = recreated.engine;
                await currentEngine.sendMessage(sessionId, augmentedContent, fileAttachments.length > 0 ? fileAttachments : undefined, processEvent);
              } else {
                throw err;
              }
            }

            for (const chunk of channelRouter.flush()) {
              if (!chunk.content) continue;
              if (chunk.type === "text") {
                state.assistantContent += chunk.content;
                await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) });
              } else if (chunk.type === "thinking") {
                state.assistantThinking += chunk.content;
                await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) });
              } else {
                state.sawToolDelta = true;
                await stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) });
              }
            }
            console.log(`[Chat][${projectId.slice(0, 8)}] stream done — content: ${state.assistantContent.length}, thinking: ${state.assistantThinking.length}, tools: ${state.hadToolCalls}`);

            // Save pre-recovery content length to detect if auto-continue added anything
            const contentBeforeRecovery = state.assistantContent.length;
            await handleAutoContinue(stream, state, currentEngine, sessionId!, projectId, mode, recordAssistantToolCall, content);
            await handleEmptyResponseRetry(stream, state, currentEngine, sessionId!, projectId, augmentedContent, fileAttachments);

            if (!state.hadToolCalls && state.sawToolDelta) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "error",
                  data: "This model streamed tool-like text but did not execute any tools. Switch to a model with tool calling support in AI Settings.",
                }),
              });
            }

            // Emit deferred session.error only if auto-continue didn't produce new content
            if (state.deferredError && state.assistantContent.length <= contentBeforeRecovery) {
              console.log(`[Chat][${projectId.slice(0, 8)}] emitting deferred error (no recovery): ${state.deferredError.slice(0, 80)}`);
              await stream.writeSSE({ data: JSON.stringify({ type: "error", data: state.deferredError }) });
            } else if (state.deferredError) {
              console.log(`[Chat][${projectId.slice(0, 8)}] swallowed deferred error — auto-continue recovered (${state.assistantContent.length - contentBeforeRecovery} chars added)`);
            }
            state.deferredError = undefined;

            // Flush pending tool names
            for (const pendingName of state.pendingToolNames) {
              const arts = state.pendingArtifacts.get(pendingName) ?? popArtifacts(pendingName);
              const data: Record<string, unknown> = { name: pendingName, success: true, friendlyMessage: "Done" };
              if (arts && arts.length > 0) {
                data.artifacts = arts;
                state.pendingArtifacts.delete(pendingName);
              }
              await stream.writeSSE({ data: JSON.stringify({ type: "tool_result", data }) });
            }
            state.pendingToolNames.length = 0;
            // Any artifacts not flushed via pendingToolNames (e.g. tool name
            // wasn't queued there): emit a tool_result per remaining entry so
            // the client still surfaces the download card.
            for (const [toolName, arts] of state.pendingArtifacts.entries()) {
              if (arts.length === 0) continue;
              await stream.writeSSE({ data: JSON.stringify({
                type: "tool_result",
                data: { name: toolName, success: true, friendlyMessage: "Done", artifacts: arts },
              }) });
            }
            state.pendingArtifacts.clear();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("not authorized") || msg.includes("policy") || msg.includes("unauthorized")) {
              const manager = getCopilotManager();
              await manager.evictEngine(projectId);
              state.traceCollector?.onSessionEvict(sessionId ?? "unknown", `auth_error:${msg.slice(0, 80)}`);
              projectSessions.delete(sessionKey);
              console.log("[Chat] Evicted stale engine after streaming auth error");
            }
            await stream.writeSSE({ data: JSON.stringify({ type: "error", data: msg }) });
          } finally {
            unsubToolEvents();
            releaseTracker();
            console.log(`[Chat] AI streaming complete for ${projectId}, starting post-processing...`);
          }

          await handleAutoFixPreview(stream, state, projectId, resolvedGithubToken, sessionId!);
          await handleVersionAndMemory(stream, state, projectId, userId, content, messageId);
          await handleFinalCleanup(stream, state, projectId, mode, keepAlive, softHeartbeat);

          // Consume 1 credit after successful chat completion
          if (workspaceId && state.assistantContent) {
            try {
              const credits = creditQueries(sql);
              await credits.consumeCredits(userId, workspaceId, 1, {
                actionType: "chat_message",
                projectId,
              });
            } catch (err) {
              console.warn("[Chat] Failed to consume credit:", err instanceof Error ? err.message : err);
            }
          }
        } catch (err) {
          await handleStreamError(stream, state, err, projectId, keepAlive, softHeartbeat);
        }
      });
    },
  );
}
