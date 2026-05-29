/**
 * Stream recovery: auto-continue (stall detection) and empty-response retry.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import type { CopilotEngine } from "../../ai/providers/copilot.js";
import { mapEventToSSE, ChannelTokenRouter } from "../../ai/sse-mapper.js";
import { stripServerPaths } from "../../ai/tool-messages.js";
import { recordToolEventForTrace } from "./tool-event-bookkeeping.js";

const MAX_AUTO_CONTINUE = 6;
const MAX_READ_ONLY_CYCLES = 3;
// BUG-VISUAL-EDIT-001: Visual Edit prompts arrive with full selector
// context, so the model SHOULD edit immediately. But it sometimes does up
// to 3-4 reads (locate the JSX, peek related components) before committing
// — bumping the stall ceiling from 3 to 5 keeps the watchdog protective on
// truly stuck turns while not killing the legitimate visual-edit "explore
// then edit" pattern.
const MAX_READ_ONLY_CYCLES_VISUAL_EDIT = 5;
const FILE_WRITE_TOOLS = new Set(["create_file", "edit_file", "write_file", "create", "edit", "write"]);
const READ_TOOLS = new Set(["read_file", "list_files", "search_files", "read", "list", "search"]);

/**
 * Returns true when the user message is a Visual Edit turn (the editor
 * auto-prefixes `[Visual Edit] For the <tag> element with class "..."
 * (selector: ...): <user instruction>`). These turns ALWAYS want a build
 * intent regardless of what verb the user used ("animate this text",
 * "make it red", etc.) — the selector + element tag is implicit context
 * that the request is to MUTATE the element.
 */
function isVisualEditPrompt(userMessage: string | undefined): boolean {
  if (!userMessage) return false;
  return /^\s*\[Visual Edit\]/i.test(userMessage);
}
/**
 * MCP tools that produce a finished artifact (UI resource, download, etc.)
 * — calling one of these IS the deliverable, so auto-continue must NOT
 * pester the model to "continue building" afterwards. Match by suffix so
 * connector-prefixed names (mcp_<connector>_<tool>) are covered too.
 */
// Only RENDERERS belong here — not the "create_*" kick-off tools. The kick-off
// returns a status card that injects a BUILD_* prompt for the model's NEXT
// turn; the actual artifact (xlsx / pdf / slides / md) is produced by the
// matching build_* / render_*. Listing the kick-offs here made auto-continue
// declare "deliverable produced" after the status card alone, so the model
// never reached build_* and the project's index.html / App.tsx stayed at the
// default Vite scaffold (no SheetJS viewer, no .xlsx file, no preview).
const PRODUCTIVE_TOOL_SUFFIXES = [
  // presentation-builder
  "build_deck",
  "render_deck",
  "render_pptx",
  "render_web_slides",
  "build_presentation",
  // markdown-builder
  "build_markdown",
  // spreadsheet-builder
  "build_spreadsheet",
  // pdf-builder
  "build_pdf",
];
function isProductiveToolName(name: string | undefined): boolean {
  if (!name) return false;
  return PRODUCTIVE_TOOL_SUFFIXES.some((s) => name === s || name.endsWith(`_${s}`) || name.endsWith(`.${s}`));
}

/**
 * Heuristically decide whether the user actually asked the AI to BUILD/MODIFY
 * something. Auto-continue exists to nudge the model when it explored but
 * forgot to write files for a build request — it must NOT fire when the user
 * only asked a read-only / informational question ("read X", "what does Y do?",
 * "show me Z"), because then the model is correctly done after one read.
 */
function userWantsBuild(userMessage: string | undefined): boolean {
  if (!userMessage) return true; // unknown intent → preserve old behaviour
  // BUG-VISUAL-EDIT-001: Visual Edit prompts ALWAYS want a build — the
  // selector + element tag are implicit "mutate this" context regardless
  // of which verb the user used ("animate this", "make it red", etc.).
  if (isVisualEditPrompt(userMessage)) return true;
  const m = userMessage.toLowerCase().trim();
  if (m.length === 0) return true;
  // Strong informational/read-only signals — short messages dominated by these
  // verbs are almost never build requests.
  const readOnly = /\b(read|show|tell me|what is|what does|what's|explain|describe|summari[sz]e|list|find|search|check|inspect|look at|view|open|display|print|how does|why does|count)\b/;
  const buildIntent = /\b(build|create|make|add|implement|fix|update|modify|change|edit|write|generate|scaffold|refactor|deploy|publish|install|setup|set up|configure|design|develop|extend|enhance|improve|delete|remove|rename|move)\b/;
  const hasBuild = buildIntent.test(m);
  const hasRead = readOnly.test(m);
  if (hasBuild) return true;
  if (hasRead) return false;
  // No clear signal — be conservative: if the AI already invoked tools (MCP
  // calls, search, etc.) and is otherwise "done", forcing a "continue building"
  // turn is far worse than under-continuing. Only auto-continue when the user
  // gave a long, descriptive product brief (>= 25 words) which implies a build.
  return m.split(/\s+/).length >= 25;
}

/** Run auto-continue loops if AI explored but wrote 0 files. */
export async function handleAutoContinue(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  engine: CopilotEngine,
  sessionId: string,
  projectId: string,
  mode: string,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
  userMessage?: string,
): Promise<void> {
  if (mode === "plan") return;

  // If the user's request was clearly informational ("read X", "what is Y?"),
  // don't push the model to start writing files. This was the source of the
  // "Stall: same files read in consecutive continues" error.
  if (!userWantsBuild(userMessage)) {
    console.log(`[Chat][${projectId.slice(0, 8)}] auto-continue skipped — read-only user intent`);
    return;
  }

  // If an MCP interactive widget was shown (e.g. format picker), the session
  // is intentionally waiting for a user click — do NOT auto-continue, that
  // would force the model to bypass the picker and start generating files.
  if (state.awaitingMcpWidget) {
    console.log(`[Chat][${projectId.slice(0, 8)}] auto-continue skipped — awaiting MCP widget click`);
    return;
  }

  // BUG-VISUAL-EDIT-001: a Visual Edit turn arrives with full selector
  // context, so 3 read-only cycles is too tight a ceiling — the model often
  // legitimately needs 3-4 reads to locate the JSX before committing the
  // edit. Use the wider cap for these turns; everyone else keeps the old
  // 3-cycle ceiling.
  const isVisualEdit = isVisualEditPrompt(userMessage);
  const readOnlyCycleCeiling = isVisualEdit ? MAX_READ_ONLY_CYCLES_VISUAL_EDIT : MAX_READ_ONLY_CYCLES;

  let autoContinueCount = 0;
  let prevReadFingerprint = "";
  let consecutiveReadOnlyCycles = 0;

  while (autoContinueCount < MAX_AUTO_CONTINUE) {
    const wroteFiles = state.assistantToolCalls.some(
      (tc) => FILE_WRITE_TOOLS.has((tc as { name?: string }).name ?? ""),
    );
    const producedArtifact = state.assistantToolCalls.some(
      (tc) => isProductiveToolName((tc as { name?: string }).name),
    );
    if (!state.hadToolCalls || wroteFiles || producedArtifact) break;

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
    if (consecutiveReadOnlyCycles >= readOnlyCycleCeiling) {
      state.traceCollector?.onError(`Stall: ${consecutiveReadOnlyCycles} consecutive read-only continues (visualEdit=${isVisualEdit})`, "auto_continue_write_free");
      console.warn(`[Chat][${projectId.slice(0, 8)}] stall detected — ${consecutiveReadOnlyCycles} read-only continues`);
      // BUG-VISUAL-EDIT-001: tailor the bail message — Visual Edit users
      // already gave a precise selector, so "provide more guidance" is
      // misleading; the real problem is the model's planning.
      const bailMessage = isVisualEdit
        ? "I couldn't apply the visual edit automatically. Try rephrasing — for example, name the exact change ('add a fade-in animation', 'change the color to red')."
        : "The AI has been investigating without making changes. Please provide more specific guidance, or check the preview console for errors.";
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", data: bailMessage }),
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
      // BUG-VISUAL-EDIT-001: when a Visual Edit turn enters auto-continue,
      // use a sharper, selector-aware nudge instead of the generic "create
      // all the files" prompt. The Visual Edit user already specified the
      // exact element; the model just needs to commit to an `edit_file`
      // call now.
      const continuePrompt = isVisualEdit
        ? "You have the selector and the user's intent. Make the edit NOW with edit_file — modify the JSX/HTML for that exact element only. Do not read any more files. Apply the change in a single edit_file call. Reply with one short sentence describing what you changed."
        : "You explored the project and installed packages but haven't created any files yet. Continue building NOW — create all the files the user asked for. Do NOT stop until the app is working in the preview.";
      await engine.sendMessage(
        sessionId,
        continuePrompt,
        undefined,
        (evt: import("@github/copilot-sdk").SessionEvent) => {
          if (state.usageCollector) state.usageCollector.onUsageEvent(evt);
          state.traceCollector?.onSdkEvent(evt as Record<string, unknown>);
          // BUG-TRACE-001: route tool start/end through the same helper the
          // main turn uses, so auto-continue's tool calls (read_file /
          // edit_file etc.) increment `tool_call_count` and produce
          // tool_start/tool_end trace events.  Previously this inline
          // callback only matched `tool.execution_start` /
          // `tool.execution_complete` / `tool.completed` — missing
          // `tool.running` and `external_tool.completed`, which silently
          // dropped MCP-channel tool events from the trace.
          recordToolEventForTrace(state, evt as Record<string, unknown>, recordAssistantToolCall);
          const sseData = mapEventToSSE(evt as Record<string, unknown>);
          if (!sseData) return;
          state.lastRealEventAt = Date.now();
          // Suppress session.error during auto-continue — the loop handles recovery
          if (sseData.type === "error") return;
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
          } else if (sseData.type === "tool_delta") {
            state.sawToolDelta = true;
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

  // If we already have a deferred error that indicates rate limiting,
  // surface it immediately — retrying would just hit the same limit.
  if (state.deferredError) {
    const deferredLower = state.deferredError.toLowerCase();
    const isRateLimit = deferredLower.includes("rate limit") || deferredLower.includes("429") || deferredLower.includes("quota") || deferredLower.includes("too many requests");
    if (isRateLimit) {
      console.warn(`[Chat][${projectId.slice(0, 8)}] empty response with rate limit error — skipping retry, surfacing error`);
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", data: state.deferredError }),
      });
      state.deferredError = undefined; // consumed — don't emit again in send-handler
      return;
    }
  }

  console.warn(`[Chat][${projectId.slice(0, 8)}] empty response — auto-retrying once`);
  await stream.writeSSE({
    data: JSON.stringify({ type: "status", data: { phase: "retrying", message: "Model returned empty — retrying..." } }),
  });

  let retryErrorMsg = "";
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
        // Capture error events from retry attempt
        if (retrySseData?.type === "error" && typeof retrySseData.data === "string") {
          retryErrorMsg = retrySseData.data;
        }
        if (retrySseData?.type === "text_delta") {
          state.lastRealEventAt = Date.now();
          const rawDelta = typeof retrySseData.data === "string" ? retrySseData.data : "";
          for (const chunk of retryRouter.process(rawDelta)) {
            if (!chunk.content) continue;
            if (chunk.type === "text") {
              state.assistantContent += chunk.content;
              stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: chunk.content }) }).catch(() => {});
            } else if (chunk.type === "thinking") {
              state.assistantThinking += chunk.content;
              stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) }).catch(() => {});
            } else {
              state.sawToolDelta = true;
              stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) }).catch(() => {});
            }
          }
        } else if (retrySseData?.type === "thinking") {
          state.lastRealEventAt = Date.now();
          const td = typeof retrySseData.data === "string" ? retrySseData.data : "";
          state.assistantThinking += td;
          stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(td) }) }).catch(() => {});
        } else if (retrySseData && retrySseData.type !== "done" && retrySseData.type !== "error") {
          state.lastRealEventAt = Date.now();
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
      } else if (chunk.type === "thinking") {
        state.assistantThinking += chunk.content;
        await stream.writeSSE({ data: JSON.stringify({ type: "thinking", data: stripServerPaths(chunk.content) }) });
      } else {
        state.sawToolDelta = true;
        await stream.writeSSE({ data: JSON.stringify({ type: "tool_delta", data: chunk.content }) });
      }
    }
    console.log(`[Chat][${projectId.slice(0, 8)}] retry result — content: ${state.assistantContent.length}, thinking: ${state.assistantThinking.length}, tools: ${state.hadToolCalls}`);
  } catch (retryErr) {
    const errDetail = retryErr instanceof Error ? retryErr.message : String(retryErr);
    console.warn(`[Chat][${projectId.slice(0, 8)}] retry failed:`, errDetail);
    if (!retryErrorMsg) retryErrorMsg = errDetail;
  }

  // If STILL empty, inform the user with the actual error details
  if (!state.assistantContent && !state.assistantThinking && !state.hadToolCalls) {
    // Prefer: deferred error from event-processor > error from retry > generic fallback
    const actualError = state.deferredError || retryErrorMsg || "";
    const errorMessage = actualError
      ? `AI provider error: ${actualError}`
      : "The AI model returned an empty response. This may be a temporary provider issue — try again in a moment, or switch to a different model in AI Settings.";
    await stream.writeSSE({
      data: JSON.stringify({ type: "error", data: errorMessage }),
    });
    if (state.deferredError) state.deferredError = undefined; // consumed
  }
}
