import type { ChatStreamState } from "./types.js";

/**
 * Ordinary text is provisionally routed to thinking while waiting to see
 * whether another tool call follows. A successfully completed final segment
 * is the answer, even when earlier segments invoked tools. Explicit reasoning
 * events and text confirmed by a subsequent tool call are never promoted.
 */
export function finalizeLeadingResponse(state: ChatStreamState): string {
  const buffered = state.leadingTextBuffer;
  state.leadingTextBuffer = "";
  state.leadingTextFlushed = true;
  if (!buffered || state.deferredError) return "";

  // Remove only the exact provisional segment, not an arbitrary suffix: a
  // native reasoning event may have arrived after the ordinary text.
  const index = state.assistantThinking.lastIndexOf(buffered);
  if (index < 0) return "";
  const visible = buffered.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
  if (!visible) return "";

  state.assistantThinking =
    state.assistantThinking.slice(0, index) +
    state.assistantThinking.slice(index + buffered.length);
  state.assistantContent += visible;
  return visible;
}
