/**
 * SSE event mapper — maps SDK session events to SSE events for the client.
 * Also exports ChannelTokenRouter for model thinking/reasoning tag parsing.
 */

import { sanitizeText, stripServerPaths, friendlyToolResult } from "./tool-messages.js";

export interface SSEEvent {
  type: string;
  data: unknown;
}

/**
 * Stateful parser for model thinking markers.
 *
 * Supports ALL known model thinking/reasoning tag formats:
 * 1. Gemma 4:              `<|channel>thought\n...\n<channel>\n` or `<|channel|>thought`
 * 2. DeepSeek-R1/Qwen3/Llama: `<think>\n...\n</think>`
 * 3. DeepSeek distilled:   (may omit opening `<think>`, only emit `</think>` at end)
 * 4. Claude (prompted):    `<rationale>\n...\n</rationale>`
 * 5. DeepSeek answer:      `<answer>` tag stripped (content kept as text)
 *
 * Because streaming delivers tokens one at a time, the markers may be split
 * across multiple delta events. This class buffers partial markers and routes
 * content between them as `thinking` instead of `text_delta`.
 *
 * Usage: one instance per streaming session.
 */
export class ChannelTokenRouter {
  /** True when we're inside a thinking block */
  private inThinking = false;
  /** Buffer for potential partial opening/closing markers */
  private buffer = "";
  /** Track whether any text has been emitted yet (for distilled model detection) */
  private hasEmittedText = false;

  // ── Regex patterns for opening/closing markers ──────────────────────
  private static OPEN_RE = /<think>|<rationale>|<\|?channel\|?>thought/i;
  private static CLOSE_RE = /<\/think>|<\/rationale>|<\|?channel\|?>/i;
  private static PARTIAL_OPEN_RE =
    /<\/?(?:\|?c?h?a?n?n?e?l?\|?>?t?h?o?u?g?h?t?|t?h?i?n?k?>?|r?a?t?i?o?n?a?l?e?>?)$/i;
  private static PARTIAL_CLOSE_RE =
    /<\/?(?:\|?c?h?a?n?n?e?l?\|?>?|t?h?i?n?k?>?|r?a?t?i?o?n?a?l?e?>?)$/i;
  private static ANSWER_RE = /<\/?answer>/gi;

  /**
   * Process a delta token and return categorized chunks.
   * Returns array of { type: "text" | "thinking", content: string }
   */
  process(delta: string): Array<{ type: "text" | "thinking"; content: string }> {
    const results: Array<{ type: "text" | "thinking"; content: string }> = [];
    const input = this.buffer + delta;
    this.buffer = "";

    let remaining = input.replace(ChannelTokenRouter.ANSWER_RE, "");

    while (remaining.length > 0) {
      if (this.inThinking) {
        const closeIdx = remaining.search(ChannelTokenRouter.CLOSE_RE);
        if (closeIdx === -1) {
          const trailingMatch = remaining.match(ChannelTokenRouter.PARTIAL_CLOSE_RE);
          if (trailingMatch && trailingMatch.index !== undefined) {
            const before = remaining.slice(0, trailingMatch.index);
            if (before) results.push({ type: "thinking", content: before });
            this.buffer = trailingMatch[0];
          } else {
            if (remaining) results.push({ type: "thinking", content: remaining });
          }
          remaining = "";
        } else {
          const before = remaining.slice(0, closeIdx);
          if (before) results.push({ type: "thinking", content: before });
          const closeMatch = remaining.slice(closeIdx).match(ChannelTokenRouter.CLOSE_RE);
          const markerLen = closeMatch ? closeMatch[0].length : 1;
          remaining = remaining.slice(closeIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = false;
        }
      } else {
        const openIdx = remaining.search(ChannelTokenRouter.OPEN_RE);
        const orphanCloseIdx = remaining.search(ChannelTokenRouter.CLOSE_RE);

        if (openIdx === -1 && orphanCloseIdx !== -1 && !this.hasEmittedText) {
          const before = remaining.slice(0, orphanCloseIdx);
          if (before) results.push({ type: "thinking", content: before });
          const closeMatch = remaining.slice(orphanCloseIdx).match(ChannelTokenRouter.CLOSE_RE);
          const markerLen = closeMatch ? closeMatch[0].length : 1;
          remaining = remaining.slice(orphanCloseIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
        } else if (openIdx === -1) {
          const trailingMatch = remaining.match(ChannelTokenRouter.PARTIAL_OPEN_RE);
          if (trailingMatch && trailingMatch.index !== undefined && trailingMatch[0].startsWith("<")) {
            const before = remaining.slice(0, trailingMatch.index);
            if (before) {
              results.push({ type: "text", content: before });
              this.hasEmittedText = true;
            }
            this.buffer = trailingMatch[0];
          } else {
            if (remaining) {
              results.push({ type: "text", content: remaining });
              this.hasEmittedText = true;
            }
          }
          remaining = "";
        } else {
          const before = remaining.slice(0, openIdx);
          if (before) {
            results.push({ type: "text", content: before });
            this.hasEmittedText = true;
          }
          const openMatch = remaining.slice(openIdx).match(/<think>|<rationale>|<\|?channel\|?>thought[^\n]*/i);
          const markerLen = openMatch ? openMatch[0].length : 1;
          remaining = remaining.slice(openIdx + markerLen);
          if (remaining.startsWith("\n")) remaining = remaining.slice(1);
          this.inThinking = true;
        }
      }
    }

    return results;
  }

  /** Flush any buffered content at stream end */
  flush(): Array<{ type: "text" | "thinking"; content: string }> {
    if (!this.buffer) return [];
    const content = this.buffer;
    this.buffer = "";
    return [{ type: this.inThinking ? "thinking" : "text", content }];
  }
}

export function mapEventToSSE(event: Record<string, unknown>): SSEEvent | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;

  switch (type) {
    // ─── Streaming text deltas (token-by-token from SDK) ──
    case "assistant.message_delta": {
      const delta = (data?.deltaContent ?? "") as string;
      if (!delta) return null;
      return { type: "text_delta", data: sanitizeText(delta) };
    }

    // ─── SDK v0.2.0 streaming delta (raw text chunks) ────
    case "assistant.streaming_delta": {
      const streamDelta = (data?.deltaContent ?? data?.content ?? data?.delta ?? "") as string;
      if (!streamDelta) return null;
      return { type: "text_delta", data: sanitizeText(streamDelta) };
    }

    // ─── Final complete message (sent after streaming ends) ─
    case "assistant.message":
      return null;

    // ─── Legacy / direct provider text events ─────────────
    case "text_delta": {
      const raw = (data?.content ?? data ?? "") as string;
      return { type: "text_delta", data: sanitizeText(String(raw)) };
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
    case "external_tool.requested":
      return null;

    // ─── Tool results (completed) ─────────────────────────
    case "tool.completed":
    case "tool.execution_complete": {
      const resultToolName = (data?.toolName ?? data?.name) as string;
      return {
        type: "tool_result",
        data: {
          name: resultToolName,
          success: data?.success,
          friendlyMessage: friendlyToolResult(resultToolName, data?.result, data?.success),
        },
      };
    }
    case "external_tool.completed":
      return null;

    // ─── Errors ───────────────────────────────────────────
    case "session.error": {
      const rawMsg = String(data?.message ?? data?.errorType ?? "Unknown error");
      const statusCode = data?.statusCode as number | undefined;
      let userMsg: string;
      if (statusCode === 404 || rawMsg.includes("404")) {
        userMsg = "The AI model is unavailable (404). Check your model ID and provider settings.";
      } else if (statusCode === 401 || rawMsg.includes("unauthorized") || rawMsg.includes("not authorized")) {
        userMsg = "Authentication failed with the AI provider. Check your API key.";
      } else if (statusCode === 429 || rawMsg.includes("rate limit")) {
        userMsg = "Rate limit reached. Please wait and try again.";
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
