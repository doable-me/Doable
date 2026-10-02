import {toolSucceeded} from "./tool-outcome.js";
import {classifyProviderError} from "./provider-error.js";
/**
 * SSE event mapper — maps SDK session events to SSE events for the client.
 * Also exports ChannelTokenRouter for model thinking/reasoning tag parsing.
 */

import { sanitizeText, stripServerPaths, friendlyToolResult } from "./tool-messages.js";

export interface SSEEvent {
  type: string;
  data: unknown;
}

export type ChunkType = "text" | "thinking" | "tool";

/**
 * Stateful parser for model thinking markers and tool call tags.
 *
 * Supports ALL known model thinking/reasoning tag formats:
 * 1. Gemma 4:              `<|channel>thought\n...\n<channel>\n` or `<|channel|>thought`
 * 2. DeepSeek-R1/Qwen3/Llama: `<think>\n...\n</think>`
 * 3. DeepSeek distilled:   (may omit opening `<think>`, only emit `</think>` at end)
 * 4. Claude (prompted):    `<rationale>\n...\n</rationale>`
 * 5. Tool Calls (XML):     `<function name="...">...</function>`
 *
 * Because streaming delivers tokens one at a time, the markers may be split
 * across multiple delta events. This class buffers partial markers and routes
 * content between them as `thinking` or `tool` instead of `text_delta`.
 *
 * Usage: one instance per streaming session.
 */
export class ChannelTokenRouter {
  /** True when we're inside a thinking block */
  private inThinking = false;
  /** True when we're inside a tool call block */
  private inTool = false;
  /** Buffer for potential partial opening/closing markers */
  private buffer = "";
  /** Track whether any text has been emitted yet (for distilled model detection) */
  private hasEmittedText = false;

  // ── Regex patterns for markers ──────────────────────────────────────
  private static THINK_OPEN_RE = /<think>|<rationale>|<\|?channel\|?>thought/i;
  private static THINK_CLOSE_RE = /<\/think>|<\/rationale>|<\|?channel\|?>/i;
  private static TOOL_OPEN_RE = /<function\b[^>]*>/i;
  private static TOOL_CLOSE_RE = /<\/function>/i;

  private static PARTIAL_MARKER_RE = /<(?:\/?[a-z|!]*|\|?[a-z|]*)$/i;

  private static ANSWER_RE = /<\/?answer>/gi;

  /**
   * Process a delta token and return categorized chunks.
   * Returns array of { type: ChunkType, content: string }
   */
  process(delta: string): Array<{ type: ChunkType; content: string }> {
    const results: Array<{ type: ChunkType; content: string }> = [];
    const input = this.buffer + delta;
    this.buffer = "";

    let remaining = input.replace(ChannelTokenRouter.ANSWER_RE, "");

    while (remaining.length > 0) {
      if (this.inThinking) {
        const closeIdx = remaining.search(ChannelTokenRouter.THINK_CLOSE_RE);
        if (closeIdx === -1) {
          remaining = this.handlePartial(remaining, ChannelTokenRouter.THINK_CLOSE_RE, "thinking", results);
        } else {
          const before = remaining.slice(0, closeIdx);
          if (before) results.push({ type: "thinking", content: before });
          const match = remaining.slice(closeIdx).match(ChannelTokenRouter.THINK_CLOSE_RE);
          remaining = remaining.slice(closeIdx + (match ? match[0].length : 1));
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = false;
        }
      } else if (this.inTool) {
        const closeIdx = remaining.search(ChannelTokenRouter.TOOL_CLOSE_RE);
        if (closeIdx === -1) {
          remaining = this.handlePartial(remaining, ChannelTokenRouter.TOOL_CLOSE_RE, "tool", results);
        } else {
          const before = remaining.slice(0, closeIdx);
          if (before) results.push({ type: "tool", content: before });
          const match = remaining.slice(closeIdx).match(ChannelTokenRouter.TOOL_CLOSE_RE);
          remaining = remaining.slice(closeIdx + (match ? match[0].length : 1));
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inTool = false;
        }
      } else {
        // Look for any opening tag or thinking close (for distilled models)
        const thinkOpenIdx = remaining.search(ChannelTokenRouter.THINK_OPEN_RE);
        const toolOpenIdx = remaining.search(ChannelTokenRouter.TOOL_OPEN_RE);
        const thinkOrphanCloseIdx = remaining.search(ChannelTokenRouter.THINK_CLOSE_RE);

        // Priority 1: Tool Open
        if (toolOpenIdx !== -1 && (thinkOpenIdx === -1 || toolOpenIdx < thinkOpenIdx)) {
          const before = remaining.slice(0, toolOpenIdx);
          if (before) {
            results.push({ type: "text", content: before });
            this.hasEmittedText = true;
          }
          const match = remaining.slice(toolOpenIdx).match(ChannelTokenRouter.TOOL_OPEN_RE);
          const rawMatch = match ? match[0] : "";
          // Emit the opening tag itself as 'tool' type so the UI knows which tool started
          results.push({ type: "tool", content: rawMatch });
          remaining = remaining.slice(toolOpenIdx + rawMatch.length);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inTool = true;
        }
        // Priority 2: Thinking Open
        else if (thinkOpenIdx !== -1) {
          const before = remaining.slice(0, thinkOpenIdx);
          if (before) {
            results.push({ type: "text", content: before });
            this.hasEmittedText = true;
          }
          const match = remaining.slice(thinkOpenIdx).match(ChannelTokenRouter.THINK_OPEN_RE);
          remaining = remaining.slice(thinkOpenIdx + (match ? match[0].length : 1));
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = true;
        }
        // Priority 3: Orphan Thinking Close (Distilled models like DeepSeek)
        else if (thinkOrphanCloseIdx !== -1 && !this.hasEmittedText) {
          const before = remaining.slice(0, thinkOrphanCloseIdx);
          if (before) results.push({ type: "thinking", content: before });
          const match = remaining.slice(thinkOrphanCloseIdx).match(ChannelTokenRouter.THINK_CLOSE_RE);
          remaining = remaining.slice(thinkOrphanCloseIdx + (match ? match[0].length : 1));
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
        }
        // Default: Text
        else {
          const partialMatch = remaining.match(ChannelTokenRouter.PARTIAL_MARKER_RE);
          if (partialMatch && partialMatch.index !== undefined) {
            const before = remaining.slice(0, partialMatch.index);
            if (before) {
              results.push({ type: "text", content: before });
              this.hasEmittedText = true;
            }
            this.buffer = partialMatch[0];
          } else {
            if (remaining) {
              results.push({ type: "text", content: remaining });
              this.hasEmittedText = true;
            }
          }
          remaining = "";
        }
      }
    }

    return results;
  }

  private handlePartial(remaining: string, closeRe: RegExp, type: ChunkType, results: any[]): string {
    const trailingMatch = remaining.match(ChannelTokenRouter.PARTIAL_MARKER_RE);
    if (trailingMatch && trailingMatch.index !== undefined) {
      const before = remaining.slice(0, trailingMatch.index);
      if (before) results.push({ type, content: before });
      this.buffer = trailingMatch[0];
      return "";
    } else {
      results.push({ type, content: remaining });
      return "";
    }
  }

  /** Flush any buffered content at stream end */
  flush(): Array<{ type: ChunkType; content: string }> {
    if (!this.buffer) return [];
    const content = this.buffer;
    this.buffer = "";
    const type = this.inThinking ? "thinking" : this.inTool ? "tool" : "text";
    return [{ type, content }];
  }
}


/** Decode SDK envelopes once so lifecycle bookkeeping and rendering agree. */
export function extractToolArguments(data: Record<string, unknown>): Record<string, unknown> | undefined {
  let value: unknown = data.arguments ?? data.args ?? data.input;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { return undefined; } }
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (record.arguments !== undefined) { value = record.arguments; continue; }
    return record;
  }
  return undefined;
}

/** requestId-only external completions acknowledge dispatch, not tool execution. */
export function isExternalToolAcknowledgement(data: Record<string, unknown> | undefined): boolean {
  return !data?.toolCallId || (data.result === undefined && data.output === undefined && typeof data.success !== "boolean");
}

export function mapEventToSSE(event: Record<string, unknown>, options: { preserveThinkingMarkers?: boolean } = {}): SSEEvent | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;

  switch (type) {
    // ─── Streaming text deltas (token-by-token from SDK) ──
    case "assistant.message_delta": {
      const delta = (data?.deltaContent ?? "") as string;
      if (!delta) return null;
      return { type: "text_delta", data: sanitizeText(delta, options) };
    }

    // ─── SDK v0.2.0 streaming delta (raw text chunks) ────
    case "assistant.streaming_delta": {
      const streamDelta = (data?.deltaContent ?? data?.content ?? data?.delta ?? "") as string;
      if (!streamDelta) return null;
      return { type: "text_delta", data: sanitizeText(streamDelta, options) };
    }

    // ─── Final complete message (sent after streaming ends) ─
    case "assistant.message":
      return null;

    // ─── Legacy / direct provider text events ─────────────
    case "text_delta": {
      const raw = (data?.content ?? data ?? "") as string;
      return { type: "text_delta", data: sanitizeText(String(raw), options) };
    }

    // ─── Streaming reasoning deltas (token-by-token thinking) ──
    case "assistant.reasoning_delta": {
      const reasoningDelta = (data?.deltaContent ?? "") as string;
      if (!reasoningDelta) return null;
      return { type: "thinking", data: stripServerPaths(reasoningDelta) };
    }

    // ─── Final reasoning block ────────────────────────────
    case "assistant.reasoning":
      return null;

    // ─── Thinking / reasoning (legacy events) ─────────────
    case "assistant.thinking":
      return { type: "thinking", data: stripServerPaths(String(data?.content ?? "")) };

    // ─── Tool calls (starting) ────────────────────────────
    case "tool.running":
    case "tool.execution_start":
    case "external_tool.requested": {
      const startToolName = (data?.toolName ?? data?.name) as string | undefined;
      if (!startToolName) return null;
      if (startToolName === "report_task_status") return null;
      const startArgs = extractToolArguments(data ?? {});
      const startPath = (startArgs?.path ?? startArgs?.filePath ?? startArgs?.file ?? startArgs?.target) as string | undefined;
      return {
        type: "tool_call",
        data: {
          name: startToolName,
          toolCallId: data?.toolCallId,
          ...(startArgs ? { arguments: startArgs } : {}),
          ...(startPath ? { path: startPath } : {}),
        },
      };
    }

    // ─── Tool results (completed) ─────────────────────────
    case "tool.completed":
    case "tool.execution_complete":
    case "external_tool.completed": {
      if (type === "external_tool.completed" && isExternalToolAcknowledgement(data)) return null;
      const resultToolName = (data?.toolName ?? data?.name) as string;
      const toolResult = data?.result as Record<string, unknown> | undefined;
      if (resultToolName === "report_task_status") return null;
      const reqArgs = extractToolArguments(data ?? {});
      const reqPath = (reqArgs?.path ?? reqArgs?.filePath ?? reqArgs?.file ?? reqArgs?.target) as string | undefined;
      return {
        type: "tool_result",
        data: {
          name: resultToolName,
          success: toolSucceeded(data?.result ?? data?.output,data?.success),
          toolCallId: data?.toolCallId,
          friendlyMessage: friendlyToolResult(resultToolName, data?.result ?? data?.output, toolSucceeded(data?.result ?? data?.output,data?.success)),
          // Pass through request args so the client can label cards with the
          // correct file name (BUG: "Reading file" instead of "Reading App.tsx").
          ...(reqArgs ? { args: reqArgs } : {}),
          // Diff metadata for file-editing tools
          path:         (toolResult?.path as string  | undefined) ?? reqPath,
          linesAdded:   toolResult?.linesAdded   as number  | undefined,
          linesRemoved: toolResult?.linesRemoved as number  | undefined,
        },
      };
    }

    // ─── Errors ───────────────────────────────────────────
    case "session.error": {
      const rawMsg = String(data?.message ?? data?.errorType ?? "Unknown error");
      const category=classifyProviderError(data ?? rawMsg);
      let userMsg: string;
      if (category === "NOT_FOUND") {
        userMsg = "The AI model is unavailable (404). Check your model ID and provider settings.";
      } else if (category === "AUTH") {
        userMsg = "Authentication failed with the AI provider. Check your API key.";
      } else if (category === "RATE_LIMIT" || category === "QUOTA") {
        userMsg = `⚠️ Rate limit exceeded — the AI provider is rejecting requests due to too many calls. Please wait a minute before trying again, or switch to a different model in AI Settings. (Provider error: ${rawMsg.slice(0, 200)})`;
      } else {
        userMsg = sanitizeText(rawMsg);
      }
      return { type: "error", data: userMsg };
    }

    // ─── Done ─────────────────────────────────────────────
    case "session.idle":
    case "done":
      return { type: "done", data: {} };

    // ─── Skip noise events ────────────────────────────────
    case "pending_messages.modified":
    case "session.tools_updated":
    case "session.usage_info":
    case "session.background_tasks_changed":
    case "session.custom_agents_updated":
    case "tool.execution_partial_result":
    case "assistant.usage":
    case "hook.start":
    case "hook.end":
    case "user.message":
    case "assistant.turn_start":
    case "assistant.turn_end":
    case "permission.requested":
    case "permission.completed":
    case "model_call":
    case "model_call.start":
    case "model_call.end":
      return null;

    default:
      console.debug(`[mapEventToSSE] unhandled event type: ${type}`);
      return null;
  }
}
