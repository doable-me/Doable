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
// US-011: per-project builtin data connector registration
import { ensureDataConnectorForProject } from "../../mcp/builtin/data/register.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { resolveAiEngine } from "../../ai/engine-resolver.js";
import { buildProjectContextForMode, parseSkillInvocations } from "../../ai/context-builder.js";
import { materializeSkillsForSession } from "../../ai/skills-materializer.js";
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
import { checkAndEvictOnModeChange, checkAndEvictOnProviderChange, resolveSession, persistSessionToDb, filterToolsForMode, recreateSession } from "./session-manager.js";
import { resolveUserDisplay, saveUserMessage, preInsertAssistantMessage } from "./message-persistence.js";
import { handleAutoContinue, handleEmptyResponseRetry } from "./stream-recovery.js";
import { handleAutoFixPreview, handleVersionAndMemory, handleFinalCleanup, handleStreamError } from "./post-processing.js";
import { writeStreamBuffer, shouldBufferType, type BufferedEvent, type StreamBuffer } from "./stream-buffer.js";
import { getRateLimitState } from "../../ai/rate-limit-state.js";

/**
 * BUG-TRACE-002 instrumentation helper. Wraps a post-stream phase so the
 * trace timeline shows `post_processing_phase_start`/`post_processing_phase_end`
 * boundaries with millisecond timing, plus a periodic
 * `post_processing_phase_pending` heartbeat every 5s so any await > 5s shows
 * up in the trace as an explicit "still in <phase>…" event instead of
 * silently consuming wall-clock between recorded events.
 *
 * Use one wrapper per await between SDK stream resolution and the SSE
 * `done` event so any 100s+ stall is attributable to a specific phase.
 */
async function tracePhase<T>(
  state: { traceCollector?: { pushRaw: (type: string, data: unknown) => void } | null },
  phase: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  state.traceCollector?.pushRaw("post_processing_phase_start", { phase });
  let pingTicks = 0;
  const pinger = setInterval(() => {
    pingTicks += 1;
    state.traceCollector?.pushRaw("post_processing_phase_pending", {
      phase,
      elapsed_ms: Date.now() - startedAt,
      ping: pingTicks,
    });
  }, 5_000);
  try {
    const result = await fn();
    return result;
  } catch (err) {
    state.traceCollector?.pushRaw("post_processing_phase_error", {
      phase,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearInterval(pinger);
    state.traceCollector?.pushRaw("post_processing_phase_end", {
      phase,
      duration_ms: Date.now() - startedAt,
    });
  }
}

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
  // NOTE: Only log a warning here — do NOT hard-block. The provider-level supports_tools
  // flag defaults to false for newly-created providers whose model metadata hasn't been
  // populated yet, which creates false negatives. If no model-row says explicitly false,
  // we attempt the request and let the model API surface a real error if tools are unsupported.
  if (!modelRow) {
    const [providerRow] = await sql<{ supports_tools: boolean | null }[]>`
      SELECT supports_tools
      FROM ai_providers
      WHERE id = ${providerId}
      LIMIT 1
    `;
    if (providerRow?.supports_tools === false) {
      console.warn(`[Chat] Provider ${providerId} has supports_tools=false but no model-level row for model "${modelId}". Proceeding — model metadata may be missing.`);
    }
  }
}

// modelSource values that mean a model was selected from a CUSTOM / BYOK /
// workspace / personal / platform-default origin — i.e. NOT the gh-copilot/CLI
// path. For these, an orphaned model (provider removed → provider_id nulled by
// ON DELETE SET NULL) must FAIL LOUDLY rather than silently borrow the CLI path.
const PROVIDER_BACKED_MODEL_SOURCES = new Set([
  "user_preference",
  "workspace_default",
  "platform_default",
  "admin_override",
]);

/**
 * Sibling to assertToolCapableModel: enforces that a non-empty model resolved
 * from a provider-backed source actually has a resolved provider. Guards the
 * orphaned-model case (model string left behind after its provider was deleted)
 * that assertToolCapableModel no-ops past because providerId is undefined.
 */
function assertModelHasProvider(
  resolvedModel: string | undefined,
  resolvedProvider: ByokProviderConfig | undefined,
  modelSource: string,
): void {
  if (resolvedModel && !resolvedProvider && PROVIDER_BACKED_MODEL_SOURCES.has(modelSource)) {
    throw new Error(`No AI provider configured for the selected model "${resolvedModel}". Open AI Settings and pick a model from a connected provider.`);
  }
}

const sendMessageSchema = z.object({
  // BUG-AI-002: trim before length check so "   \n\t  " is rejected as empty
  // rather than silently passing validation, scaffolding, and burning a credit.
  content: z.string().max(100_000).transform((s) => s.trim()).refine((s) => s.length >= 1, {
    message: "content must be non-empty after trim",
  }),
  // Optional short label to persist in chat history in place of `content` (which
  // may contain large injected tool/skill instructions that shouldn't pollute
  // the user-visible transcript). The LLM still receives the full `content`.
  displayContent: z.string().max(4_000).optional(),
  mode: z.enum(["agent", "plan", "visual-edit", "chat"]).default("agent"),
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
  // Project files to attach as context (relative paths within the project)
  projectFiles: z.array(z.string().max(500)).max(10).optional(),
  // BUG-AI-003: explicit opt-in for the /editor/new auto-scaffold flow.
  // When false (default), POST to a nonexistent project ID returns 404
  // instead of silently creating a phantom project + burning a credit.
  createIfMissing: z.boolean().optional().default(false),
});

export function registerSendHandler(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat",
    bodyLimit({ maxSize: 20 * 1024 * 1024 }),
    zValidator("json", sendMessageSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const { content, displayContent, mode, model, provider, providerId, copilotAccountId, attachments, projectFiles, createIfMissing } = c.req.valid("json");
      const userId = c.get("userId")!;

      // Verify project access — must be at least a member (viewers are read-only)
      let chatProject = await projectQueries(sql).findById(projectId);

      // BUG-AI-003: never auto-scaffold a phantom project on POST unless the
      // caller explicitly opts in via createIfMissing=true (the /editor/new
      // flow). Without this gate, anyone could POST to a random UUID and burn
      // a credit while the server scaffolds, starts a dev server, and runs an
      // agent against a project that never existed.
      if (!chatProject && createIfMissing) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const NIL_UUID = "00000000-0000-0000-0000-000000000000";
        // BUG-CORPUS-PROJ-004: never auto-mint the nil UUID. Earlier runs
        // created a placeholder row keyed on `00000000-...` here, which then
        // made PATCH/DELETE return 200 instead of 404 on what was supposed
        // to be a non-existent project.
        if (uuidRegex.test(projectId) && projectId.toLowerCase() !== NIL_UUID) {
          const userWorkspaces = await workspaceQueries(sql).listByUser(userId);
          const wsId = userWorkspaces.length > 0 ? userWorkspaces[0]!.id : null;
          if (!wsId) return c.json({ error: "No workspace found" }, 400);
          const name = content.slice(0, 100) || "New Project";
          const slug = `p-${Date.now().toString(36)}`;
          const [created] = await sql<[{ id: string; workspace_id: string; name: string; slug: string; status: string }]>`
            INSERT INTO projects (id, workspace_id, name, slug)
            VALUES (${projectId}::uuid, ${wsId}, ${name}, ${slug})
            RETURNING *
          `;
          if (created) {
            chatProject = await projectQueries(sql).findById(projectId);
            // US-011: register builtin doable.data MCP connector for the new project.
            if (process.env.DOABLE_APP_DB_ENABLED !== "0") {
              ensureDataConnectorForProject(projectId, wsId, userId).catch((err) => {
                console.error("[builtin-data] Failed to provision data connector:", err);
              });
            }
          }
        }
      }

      if (!chatProject) return c.json({ error: "Project not found" }, 404);
      const chatRole = await workspaceQueries(sql).getMemberRole(chatProject.workspace_id, userId);
      if (!chatRole) {
        // Check project_collaborators as fallback
        const [collab] = await sql<{ role: string }[]>`
          SELECT role FROM project_collaborators
          WHERE project_id = ${projectId} AND user_id = ${userId}
        `;
        if (!collab) {
          // Platform admin bypass
          const [adminCheck] = await sql<{ is_platform_admin: boolean }[]>`
            SELECT is_platform_admin FROM users WHERE id = ${userId}
          `;
          if (!adminCheck?.is_platform_admin) return c.json({ error: "Access denied" }, 403);
        }
      }
      const effectiveRole = chatRole ?? "member"; // collaborators/admins treated as members
      if (effectiveRole === "viewer") {
        return c.json({ error: "Viewers cannot use AI chat" }, 403);
      }

      // BUG-AI-020: enforce zero-balance before streaming begins. Previously
      // the credit pre-check did not exist, so workspaces with monthlyMax=0
      // (or fully-consumed balances) could still trigger a full chat stream
      // and burn server resources. We pull total_available via the existing
      // creditQueries helper which already initializes a balance row + handles
      // daily/monthly auto-reset. Unlimited plans (Number.isFinite=false on
      // PLAN_LIMITS) bypass this gate; in that case the balance row stores
      // MAX_INT and total_available remains effectively unbounded.
      try {
        const credits = creditQueries(sql);
        const balance = await credits.getCreditBalance(userId, chatProject.workspace_id);
        if (balance.total_available <= 0) {
          return c.json(
            {
              error: "Credit balance exhausted",
              code: "INSUFFICIENT_CREDITS",
              daily_remaining: balance.daily_remaining,
              monthly_remaining: balance.monthly_remaining,
              rollover_credits: balance.rollover_credits,
              total_available: balance.total_available,
            },
            429,
          );
        }
      } catch (err) {
        console.warn(
          "[Chat] pre-stream credit check failed:",
          err instanceof Error ? err.message : err,
        );
        // Fall through — do not block on DB hiccups; deduction post-stream
        // still guards the bulk of the cost.
      }

      let augmentedContent = content;
      let fileAttachments: Array<{ type: "file"; path: string; displayName?: string }> = [];
      // NOTE: attachment processing (PDF text extraction, etc.) is deferred
      // until inside the SSE stream so we can send early status events to the
      // client, preventing the "stuck at Building..." appearance.
      const hasAttachments = attachments && attachments.length > 0;

      // Resolve project files as SDK file attachments (relative paths → absolute)
      if (projectFiles && projectFiles.length > 0) {
        const projectPath = getProjectPath(projectId);
        for (const relPath of projectFiles) {
          try {
            const { resolve } = await import("node:path");
            const { existsSync } = await import("node:fs");
            const absPath = resolve(projectPath, relPath);
            // Prevent path traversal
            if (!absPath.startsWith(projectPath)) {
              console.warn(`[Chat] project file path traversal blocked: ${relPath}`);
              continue;
            }
            if (!existsSync(absPath)) {
              console.warn(`[Chat] project file not found: ${relPath}`);
              continue;
            }
            fileAttachments.push({ type: "file", path: absPath, displayName: relPath });
          } catch (err) {
            console.warn(`[Chat] failed to resolve project file "${relPath}":`, err);
          }
        }
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

      // Ephemeral messageId for this stream — also written to ai_active_streams
      // so /chat/status can hand it to clients that want to resume via
      // /chat/stream-resume after a refresh/disconnect.
      const messageId = crypto.randomUUID();

      // In-memory event buffer mirrored to KV on every write — enables
      // stream-resume after client refresh. Snapshot-write avoids races.
      const bufferedEvents: BufferedEvent[] = [];
      let bufferSeq = 0;
      const flushBuffer = (done: boolean, error?: string) => {
        const snapshot: StreamBuffer = {
          events: bufferedEvents,
          done,
          updatedAt: Date.now(),
        };
        if (error) snapshot.error = error;
        writeStreamBuffer(messageId, snapshot).catch(() => {});
      };

      // Register this stream IMMEDIATELY — before any of the (potentially
      // slow) session-resolution work below. This closes the race window
      // where a user refreshing within the first few hundred ms of a send
      // would hit /chat/status before the DB row existed and miss the
      // stream-resume path entirely.
      activeRequests.set(projectId, { mode, startedAt: Date.now() });
      sql`INSERT INTO ai_active_streams (project_id, message_id) VALUES (${projectId}, ${messageId}) ON CONFLICT (project_id) DO UPDATE SET message_id = ${messageId}, started_at = now()`.catch(() => {});
      // Prime the KV buffer so the resume endpoint sees an empty-but-active
      // buffer even if the user refreshes before the first SSE event fires.
      flushBuffer(false);

      return streamSSE(c, async (stream) => {
        // Make SSE writes resilient after client disconnect so the rest of the
        // pipeline (tool events, final save, cleanup) still runs to completion.
        // Also mirror every non-noise event to the KV stream buffer so a
        // refreshed client can resume via GET /chat/stream-resume.
        const originalWriteSSE = stream.writeSSE.bind(stream);
        stream.writeSSE = async (message: Parameters<typeof originalWriteSSE>[0]) => {
          // Mirror to buffer BEFORE the direct write — so even if the client
          // is disconnected, the buffer still captures the event for resume.
          try {
            const raw = typeof message.data === "string" ? message.data : "";
            if (raw && raw !== "[DONE]") {
              const parsed = JSON.parse(raw) as { type?: string; data?: unknown };
              if (parsed && typeof parsed.type === "string" && shouldBufferType(parsed.type)) {
                bufferSeq += 1;
                bufferedEvents.push({
                  seq: bufferSeq,
                  type: parsed.type,
                  data: parsed.data,
                  ts: Date.now(),
                });
                flushBuffer(false);
              }
            }
          } catch {
            // Non-JSON payloads (e.g. "[DONE]") — skip buffer mirror.
          }
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
        const isBuildDeckTurn = content.trimStart().startsWith("BUILD_DECK");

        // ─── Thinking-loop watchdog (BUG-PWA-001) ───────────────────────────
        // If the model goes silent (no real SDK events: no text, no tool calls,
        // no tool deltas) for THINKING_LOOP_ABORT_MS while still producing
        // nothing, abort the stream with a recoverable error so the client can
        // retry instead of hanging on a "thinking" spinner forever.
        //
        //   CHAT_THINKING_LOOP_ABORT_MS  default 180000 (3 min). 0 disables.
        //   CHAT_THINKING_LOOP_GRACE_MS  default 15000  (don't fire in first N ms).
        const thinkingAbortMs = (() => {
          const v = process.env.CHAT_THINKING_LOOP_ABORT_MS;
          const n = v === undefined || v === "" ? 180_000 : Number(v);
          return Number.isFinite(n) && n >= 0 ? n : 180_000;
        })();
        const thinkingGraceMs = (() => {
          const v = process.env.CHAT_THINKING_LOOP_GRACE_MS;
          const n = v === undefined || v === "" ? 15_000 : Number(v);
          return Number.isFinite(n) && n >= 0 ? n : 15_000;
        })();
        const turnStartedAt = Date.now();
        let thinkingLoopAborted = false;
        const thinkingLoopWatchdog = thinkingAbortMs > 0 ? setInterval(async () => {
          if (thinkingLoopAborted) return;
          const sinceTurnStart = Date.now() - turnStartedAt;
          if (sinceTurnStart < thinkingGraceMs) return;
          const realSilence = Date.now() - state.lastRealEventAt;
          if (realSilence < thinkingAbortMs) return;
          // Stuck thinking: no real progress for N ms, no tools, no text.
          if (state.hadToolCalls) return; // tool work in progress is real progress
          if (state.assistantContent.length > 0 || state.assistantThinking.length > 0) {
            // Some output already produced — don't kill productive turns. Bump
            // lastRealEventAt forward so we don't refire on the next tick.
            state.lastRealEventAt = Date.now();
            return;
          }
          thinkingLoopAborted = true;
          console.warn(`[Chat][${projectId.slice(0, 8)}] thinking_loop watchdog firing — realSilence=${realSilence}ms, no tools, no content`);
          state.traceCollector?.onError("thinking_loop", "STREAM", "thinking_loop_timeout");
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                type: "error",
                data: "AI got stuck thinking. Please retry.",
              }),
            });
          } catch {}
          // Evict the engine so the next attempt starts fresh.
          try {
            const mgr = getCopilotManager();
            await mgr.evictEngine(projectId);
          } catch {}
          // Abort the underlying request signal where supported (forces SDK
          // sendMessage to throw and unwind cleanly).
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c.req.raw as any).signal?.dispatchEvent?.(new Event("abort"));
          } catch {}
        }, 5_000) : null;
        const softHeartbeat = setInterval(async () => {
          const sseSilence = Date.now() - state.lastSseEmitAt;
          if (sseSilence < 3_000) return;
          const realSilence = Date.now() - state.lastRealEventAt;
          let msg: string;
          if (isBuildDeckTurn) {
            // Presentation-specific status messages for long BUILD_DECK generation
            if (realSilence < 15_000) msg = "Designing slide layouts\u2026";
            else if (realSilence < 45_000) msg = "Crafting slide content and styling\u2026";
            else if (realSilence < 120_000) msg = "Building detailed presentation \u2014 this may take a couple of minutes\u2026";
            else if (realSilence < 240_000) msg = "Finishing up your presentation \u2014 creating interactive slides\u2026";
            else msg = "Almost done \u2014 finalizing your presentation deck\u2026";
          } else if (realSilence < 15_000) msg = state.friendlyLastTool ? `Working on ${state.friendlyLastTool}\u2026` : "Thinking\u2026";
          else if (realSilence < 30_000) msg = state.friendlyLastTool ? `Still working on ${state.friendlyLastTool}\u2026` : "Still thinking\u2026";
          else {
            // Check if the proxy is actively rate-limited — show the RAW provider error + countdown
            const rlState = getRateLimitState();
            if (rlState && Date.now() < rlState.nextRetryAt + 5_000) {
              const secsLeft = Math.max(0, Math.ceil((rlState.nextRetryAt - Date.now()) / 1000));
              const rawSnippet = rlState.rawError.slice(0, 200);
              msg = `⚠️ Provider error (${rlState.statusCode}): ${rawSnippet}\n\nRetrying in ${secsLeft}s\u2026 (attempt ${rlState.attempt}/${rlState.maxRetries})`;
            } else if (realSilence < 60_000) {
              msg = state.friendlyLastTool ? `Still working on ${state.friendlyLastTool}\u2026` : "Generating content \u2014 complex requests take a moment\u2026";
            } else {
              msg = "Waiting for AI provider response\u2026";
            }
          }
          try {
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: msg } }) });
            state.lastSseEmitAt = Date.now();
            state.sseFrameCount++;
          } catch {}
        }, 3_000);
        const recordAssistantToolCall = createRecordAssistantToolCall(state);

        try {
          await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: "Preparing workspace..." }) });

          // Process attachments inside the stream so the client sees status
          // events immediately instead of waiting for PDF extraction to finish.
          if (hasAttachments) {
            const attachmentNames = attachments!.map((a: { name?: string }) => a.name || "file").join(", ");
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: `Analyzing ${attachmentNames}...` } }) });
            const processed = await processAttachments(attachments!, content);
            augmentedContent = processed.augmentedPrompt;
            fileAttachments = [...fileAttachments, ...processed.fileAttachments];
            await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: "Attachment processed — setting up project..." } }) });
          }

          await scaffoldAndStartDev(projectId, stream, userId);
          await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: " Connecting to AI model...\n" }) });
          await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking", message: "Connecting to AI..." } }) });

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
          // Sibling guard to assertToolCapableModel (which no-ops when
          // providerId is undefined): a non-empty model from a provider-backed
          // source MUST have a resolved provider. Catches the orphaned-model
          // case regardless of any incidental github token state.
          assertModelHasProvider(resolvedModel, resolvedProvider, modelSource);

          state.usageCollector = workspaceId ? createUsageCollector({ userId, workspaceId, projectId, provider: resolvedProvider ? "byok" : "copilot", providerLabel: resolvedProvider?.type ?? "GitHub Copilot", byokProviderId: providerId, mode }) : null;
          state.traceCollector = workspaceId ? createTraceCollector({ projectId, userId, workspaceId, provider: resolvedProvider ? "byok" : "copilot", providerLabel: resolvedProvider?.type ?? "GitHub Copilot", model: resolvedModel }) : null;
          state.traceCollector?.onRequestStart(augmentedContent?.length ?? null, mode ?? "agent", !!(attachments?.length));
          state.traceCollector?.onStreamStart();
          state.traceCollector?.recordUserMessage(augmentedContent);

          if (!resolvedProvider && !resolvedGithubToken) {
            // Fail loudly on an ORPHANED model: a model string resolved from a
            // custom/BYOK/workspace/personal/platform-default source whose
            // provider was removed (provider_id nulled by ON DELETE SET NULL).
            // This must throw EVEN when CLI fallback would be available, so an
            // orphaned custom model can never silently borrow the gh-CLI path.
            // Only the genuine copilot/CLI source (modelSource NOT in the
            // provider-backed set) is allowed to fall through to CLI fallback.
            if (resolvedModel && PROVIDER_BACKED_MODEL_SOURCES.has(modelSource)) {
              const orphanMsg = `No AI provider configured for the selected model "${resolvedModel}". Open AI Settings and pick a model from a connected provider.`;
              state.traceCollector?.onError(orphanMsg, "AUTH", "orphaned_model_no_provider");
              throw new Error(orphanMsg);
            }
            // CLI fallback: only allow the workspace owner to use the local
            // `gh` CLI auth in dev mode. Other users must have a configured
            // provider (workspace default, platform default, or personal
            // override). This prevents registered users from consuming the
            // admin's personal Copilot quota.
            let isWorkspaceOwner = false;
            if (workspaceId) {
              const [ownerRow] = await sql<{ owner_id: string }[]>`SELECT owner_id FROM workspaces WHERE id = ${workspaceId}`;
              isWorkspaceOwner = ownerRow?.owner_id === userId;
            }
            const hasCLIFallback = process.env.NODE_ENV !== "production" && isWorkspaceOwner;
            console.log(`[Chat][${projectId.slice(0, 8)}] No provider/token — hasCLIFallback=${hasCLIFallback} (isOwner=${isWorkspaceOwner}, NODE_ENV=${process.env.NODE_ENV})`);
            if (!hasCLIFallback) {
              const missingAuthMsg = "AI is not configured for this workspace/user. Connect a GitHub Copilot account or add a custom provider key in Settings > AI.";
              state.traceCollector?.onError(missingAuthMsg, "AUTH", "missing_auth_or_provider");
              throw new Error(missingAuthMsg);
            }
          } else {
            console.log(`[Chat][${projectId.slice(0, 8)}] Auth resolved — provider=${!!resolvedProvider}, githubToken=${!!resolvedGithubToken}`);
          }

          console.log(`[Chat][${projectId.slice(0, 8)}] Building context + tools...`);
          // Parse /skill-name invocations from user message
          const { invokedSkillNames, cleanMessage } = parseSkillInvocations(content);
          if (invokedSkillNames.length > 0) {
            console.log(`[Chat][${projectId.slice(0, 8)}] Skill invocation: ${invokedSkillNames.join(", ")}`);
            // Strip the /skill prefix from the message sent to AI
            augmentedContent = cleanMessage + (augmentedContent !== content ? augmentedContent.slice(content.length) : "");
          }
          const [projectContext, allTools] = await Promise.all([
            buildProjectContextForMode(projectId, mode, workspaceId, userId, {
              invokedSkillNames,
              userMessage: content,
            }),
            createAllTools(projectId, workspaceId, userId),
          ]);
          const systemPrompt = await buildSystemPrompt(mode, projectId, projectContext);
          const projectPath = getProjectPath(projectId);
          emitConfigTraces(state.traceCollector, resolvedModel, modelSource, resolvedProvider, providerSource, resolvedGithubToken, systemPrompt, projectContext);

          const sessionTools = await filterToolsForMode(allTools, mode);
          logToolManifest(allTools, sessionTools, mode, projectId, state.traceCollector);

          const toolProgress = createToolProgressCallbacks(stream, state, state.traceCollector, recordAssistantToolCall, projectId);
          const modeChanged = checkAndEvictOnModeChange(sessionKey, mode, state.traceCollector);
          await checkAndEvictOnProviderChange(projectId, sessionKey, resolvedProvider, resolvedModel, state.traceCollector);

          // Materialize DB skills to disk for SDK skillDirectories. Best-effort:
          // if this fails, we still proceed without skills rather than blocking chat.
          let skillDirectories: string[] | undefined;
          if (workspaceId) {
            try {
              const mat = await materializeSkillsForSession({ workspaceId, projectId, userId });
              skillDirectories = mat.skillDirectories.length > 0 ? mat.skillDirectories : undefined;
            } catch (err) {
              console.warn(`[Chat][${projectId.slice(0, 8)}] Skills materialization failed:`, err instanceof Error ? err.message : err);
            }
          }

          let sessionId = await resolveSession(projectId, userId, sessionKey, mode, modeChanged, resolvedModel, resolvedProvider, resolvedGithubToken, projectPath, systemPrompt, sessionTools, toolProgress, state.traceCollector, stream, skillDirectories);
          // persistSessionToDb now THROWS on real DB failures (see R11 fix —
          // it used to swallow errors and return undefined, which caused the
          // entire user/assistant message pair to be silently dropped). A
          // returned value here is always a non-empty uuid.
          const dbSessionId = await persistSessionToDb(projectId, userId, mode, sessionId);
          state.usageCollector?.setSessionId(dbSessionId);

          const { displayName, color } = await resolveUserDisplay(userId);
          await saveUserMessage(dbSessionId, displayContent ?? content, userId, displayName, color, attachments);
          broadcastToRoom(projectId, { type: "ai:message-sent", userId, displayName, content: content.slice(0, 200), messageId }, userId).catch(() => {});

          // ai_active_streams + activeRequests already registered above,
          // before streamSSE opened, to close the refresh-race window.
          state.assistantMessageId = await preInsertAssistantMessage(dbSessionId);

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
            console.log(`[Chat][${projectId.slice(0, 8)}] Getting engine (githubToken=${!!resolvedGithubToken})...`);
            let currentEngine = await manager.getEngine(projectId, resolvedGithubToken);
            console.log(`[Chat][${projectId.slice(0, 8)}] Engine acquired, preparing to send...`);
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
                const recreated = await recreateSession(projectId, userId, sessionKey, mode, resolvedModel, resolvedProvider, resolvedGithubToken, projectPath, systemPrompt, toolProgress, state.traceCollector, workspaceId, dbSessionId, skillDirectories);
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

            // ── Finalize leading-text buffer at stream end ──
            // Post-tool text stays as thinking — tool results (file changes,
            // build cards, MCP UI resources) provide all the visible UI the
            // user needs. Converting the buffer to content leaks internal
            // reasoning (BUG-119: MiniMax emits untagged reasoning as text).
            // However, if no tool calls occurred AND no content was emitted,
            // the buffer is the actual response (e.g. simple chat greeting).
            if (state.leadingTextBuffer) {
              const bufLen = state.leadingTextBuffer.length;
              if (!state.hadToolCalls && state.assistantContent.length === 0) {
                // No tool calls, no content — this IS the response, not reasoning
                const buffered = state.leadingTextBuffer;
                state.leadingTextBuffer = "";
                state.leadingTextFlushed = true;
                // Strip any <think>...</think> blocks that the channel router
                // didn't catch during streaming (token boundary issue)
                const visibleContent = buffered.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
                if (visibleContent) {
                  // Move buffer from thinking to content (only the visible portion)
                  state.assistantThinking = state.assistantThinking.slice(0, state.assistantThinking.length - buffered.length);
                  state.assistantContent += visibleContent;
                  console.log(`[Chat][${projectId.slice(0, 8)}] Flushing ${visibleContent.length} chars as content (stripped from ${bufLen} buffer, no tools)`);
                  broadcastToRoom(projectId, { type: "ai:stream-chunk", chunk: visibleContent, messageId, isThinking: false }, userId).catch(() => {});
                  await stream.writeSSE({ data: JSON.stringify({ type: "thinking_to_text", data: visibleContent }) });
                } else {
                  console.log(`[Chat][${projectId.slice(0, 8)}] Keeping ${bufLen} chars as thinking (all thinking, no visible content)`);
                }
              } else {
                state.leadingTextBuffer = "";
                state.leadingTextFlushed = true;
                console.log(`[Chat][${projectId.slice(0, 8)}] Keeping ${bufLen} chars as thinking (stream end, hadTools=${state.hadToolCalls})`);
              }
            }

            console.log(`[Chat][${projectId.slice(0, 8)}] stream done — content: ${state.assistantContent.length}, thinking: ${state.assistantThinking.length}, tools: ${state.hadToolCalls}`);
            // BUG-TRACE-002: mark the SDK stream resolution boundary so the
            // dead-gap between sendAndWait completion and post-processing
            // start is attributable to a specific phase (autoContinue,
            // emptyRetry, autoFixPreview, versionAndMemory).
            state.traceCollector?.pushRaw("post_stream_boundary", {
              phase: "sdk_stream_resolved",
              content_chars: state.assistantContent.length,
              thinking_chars: state.assistantThinking.length,
              had_tool_calls: state.hadToolCalls,
            });

            // Save pre-recovery content length to detect if auto-continue added anything
            const contentBeforeRecovery = state.assistantContent.length;
            await tracePhase(state, "auto_continue", () =>
              handleAutoContinue(stream, state, currentEngine, sessionId!, projectId, mode, recordAssistantToolCall, content),
            );
            await tracePhase(state, "empty_response_retry", () =>
              handleEmptyResponseRetry(stream, state, currentEngine, sessionId!, projectId, augmentedContent, fileAttachments),
            );

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
            // Stop heartbeat messages immediately — post-processing (auto-fix,
            // version, memory) can take seconds and we don't want the frontend
            // to show stale "Building detailed presentation…" status.
            clearInterval(softHeartbeat);
            if (thinkingLoopWatchdog) clearInterval(thinkingLoopWatchdog);
            console.log(`[Chat] AI streaming complete for ${projectId}, starting post-processing...`);
          }

          // Skip post-processing entirely if the watchdog already aborted —
          // the stream is in an error state and there's no real assistant
          // content to fix/version/save.
          if (!thinkingLoopAborted) {
            await tracePhase(state, "auto_fix_preview", () =>
              handleAutoFixPreview(stream, state, projectId, resolvedGithubToken, sessionId!),
            );
            await tracePhase(state, "version_and_memory", () =>
              handleVersionAndMemory(stream, state, projectId, userId, content, messageId),
            );
          }
          await tracePhase(state, "final_cleanup", () =>
            handleFinalCleanup(stream, state, projectId, mode, keepAlive, softHeartbeat),
          );

          // Mark stream buffer complete with shortened TTL so late reconnects
          // can still replay the 'complete' event before it expires.
          flushBuffer(true);

          // BUG-AI-019: previously gated on `state.assistantContent` being
          // non-empty, which silently skipped deduction for the common case
          // of a turn whose only output was tool calls (file writes, build
          // cards, MCP UI resources). That's how 26 sends could land while
          // daily_remaining dropped by 1. Now we deduct on any successful
          // turn that produced *some* AI work — either assistant text, real
          // thinking output, or at least one tool call — and we await the
          // call so the response really reflects the consumed balance.
          const didRealWork =
            !!state.assistantContent ||
            !!state.assistantThinking ||
            state.hadToolCalls;
          if (workspaceId && didRealWork && !thinkingLoopAborted) {
            try {
              const credits = creditQueries(sql);
              const result = await credits.consumeCredits(userId, workspaceId, 1, {
                actionType: "chat_message",
                projectId,
              });
              if (!result.success) {
                console.warn(
                  `[Chat] Credit consumption failed (remaining=${result.remaining}) for user=${userId.slice(0, 8)} ws=${workspaceId.slice(0, 8)}`,
                );
              }
            } catch (err) {
              console.warn("[Chat] Failed to consume credit:", err instanceof Error ? err.message : err);
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (thinkingLoopWatchdog) clearInterval(thinkingLoopWatchdog);
          await handleStreamError(stream, state, err, projectId, keepAlive, softHeartbeat);
          // Mark buffer as done + record error so resume clients can surface it.
          flushBuffer(true, errMsg);
        }
      });
    },
  );
}
