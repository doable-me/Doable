/**
 * `stripThinking` — chain-of-thought tag splitter for chatbot answers.
 *
 * Many open-weights and reasoning models leak their internal reasoning
 * into the assistant message inside one of a handful of tag conventions
 * (`<think>...</think>`, `<reasoning>...</reasoning>`, `[plan]...[/plan]`,
 * etc). This helper extracts those blocks so a chatbot UI can collapse
 * them inside a "💭 Thinking…" disclosure (or hide them entirely) while
 * still rendering the visible answer normally.
 *
 * Design notes:
 *  - Both XML-style (`<tag>…</tag>`) AND bracket-style (`[tag]…[/tag]`)
 *    are recognised, case-insensitively. The bracket form is what some
 *    models emit when the runner instructed them to use Markdown-safe
 *    delimiters.
 *  - Streaming chunks are handled by `createThinkingStripper()` which
 *    buffers any partial opening tag until the close arrives. The
 *    one-shot `stripThinking()` is a thin wrapper around the streamer.
 *  - Nested tags are preserved: if a `<think>` block contains another
 *    `<plan>` block, the inner block stays inside the outer thinking
 *    string instead of being extracted to its own entry.
 *  - Triple-backtick fenced code blocks are NEVER stripped, even when
 *    the language tag is one of the recognised thinking tag names. This
 *    is the "don't strip ```think...``` code" rule from the spec.
 *  - Returns `{ visible, thinking }`. `thinking` is the array of
 *    extracted blocks in the order they were encountered.
 */

export type ThinkingTagName =
  | "think"
  | "thinking"
  | "analysis"
  | "reasoning"
  | "scratchpad"
  | "reflection"
  | "plan"
  | "cot"
  | "thought"
  | "deliberation"
  | "rationale"
  | "inner_monologue"
  | "chain_of_thought"
  | "meta_reasoning"
  | "self_reflection"
  | "solve"
  | "planner";

export const THINKING_TAGS: readonly string[] = [
  "think",
  "thinking",
  "analysis",
  "reasoning",
  "scratchpad",
  "reflection",
  "plan",
  "cot",
  "thought",
  "deliberation",
  "rationale",
  "inner_monologue",
  "chain_of_thought",
  "meta_reasoning",
  "self_reflection",
  "solve",
  "planner",
] as const;

const TAG_GROUP = THINKING_TAGS.join("|");

/**
 * Single regex matching either `<tag>…</tag>` or `[tag]…[/tag]` (any
 * registered thinking tag name). Case-insensitive, dot-matches-newline
 * via the `[\s\S]` token (regex flag `s` works but `[\s\S]` is portable
 * to older JS targets).
 *
 * The two halves of the alternation deliberately don't try to enforce
 * matching delimiter style across open + close (i.e. `<think>…[/think]`
 * is matched by neither half). In practice models pick one style and
 * stick with it; cross-style "blocks" almost always indicate a partial
 * stream and should remain visible until the stream completes.
 */
function buildBlockRegex(): RegExp {
  return new RegExp(
    `(?:<(${TAG_GROUP})\\b[^>]*>[\\s\\S]*?<\\/\\1>)` +
      `|(?:\\[(${TAG_GROUP})\\b[^\\]]*\\][\\s\\S]*?\\[\\/\\2\\])`,
    "gi",
  );
}

/**
 * Replace fenced code blocks with placeholders so the thinking-tag
 * regex never touches code. Placeholders are restored at the end.
 * We treat any ``` (triple-backtick) span as a code fence regardless
 * of the language tag. Single-backtick inline code is left alone —
 * model thinking tags rarely appear inside one-line inline code, and
 * the matching cost isn't worth it.
 */
function maskCodeFences(input: string): { masked: string; fences: string[] } {
  const fences: string[] = [];
  const masked = input.replace(/```[\s\S]*?```/g, (m) => {
    const idx = fences.length;
    fences.push(m);
    return `\u0000FENCE${idx}\u0000`;
  });
  return { masked, fences };
}

function unmaskCodeFences(input: string, fences: string[]): string {
  if (fences.length === 0) return input;
  return input.replace(/\u0000FENCE(\d+)\u0000/g, (_m, idx) => fences[Number(idx)] ?? _m);
}

/** Strip the outer XML- or bracket-style envelope from a captured block. */
function stripEnvelope(block: string): string {
  // XML form: <tag …> body </tag>. The `i` flag also covers the backref so
  // `<Think>…</THINK>` matches.
  const xml = block.match(/^<([A-Za-z_][\w]*)\b[^>]*>([\s\S]*?)<\/\1>$/i);
  if (xml) return xml[2] ?? "";
  // Bracket form: [tag …] body [/tag]
  const brk = block.match(/^\[([A-Za-z_][\w]*)\b[^\]]*\]([\s\S]*?)\[\/\1\]$/i);
  if (brk) return brk[2] ?? "";
  return block;
}

export interface StripThinkingResult {
  /** The model output with all thinking blocks removed. */
  visible: string;
  /** The raw inner contents of each extracted thinking block, in order. */
  thinking: string[];
}

/**
 * One-shot split — for non-streamed messages or any fully-assembled
 * string. Equivalent to feeding the entire text through
 * `createThinkingStripper()` and calling `.flush()` once.
 */
export function stripThinking(input: string): StripThinkingResult {
  if (!input) return { visible: "", thinking: [] };
  const { masked, fences } = maskCodeFences(input);
  const regex = buildBlockRegex();
  const thinking: string[] = [];
  const visible = masked.replace(regex, (match) => {
    thinking.push(stripEnvelope(match));
    return "";
  });
  return {
    visible: unmaskCodeFences(visible, fences).trim(),
    thinking: thinking.map((t) => t.trim()).filter((t) => t.length > 0),
  };
}

// ── Streaming variant ────────────────────────────────────────────────────────

export interface ThinkingStripper {
  /**
   * Feed a new chunk. Returns the safe-to-render slice. Any tail that
   * may be the start of an opening tag is buffered internally.
   */
  push(chunk: string): { visible: string; thinking: string[] };
  /**
   * Flush any buffered tail. Should be called once the stream ends.
   * Returns whatever remains after a final pass.
   */
  flush(): { visible: string; thinking: string[] };
}

/**
 * Maximum chars of buffered tail we'll hold before deciding "this isn't
 * a tag, just send it." Generous to cover the longest registered tag
 * name (e.g. `chain_of_thought` = 16 chars plus angle brackets, attrs,
 * and a small safety margin) plus a few extra characters for whitespace.
 */
const MAX_PARTIAL_TAIL = 64;

/**
 * Cheapest possible "looks like a partial open tag" check. Returns the
 * number of characters at the end of `s` that look like the start of
 * `<tag`, `<tag-attr`, `[tag` etc. If none, returns 0.
 *
 * This is intentionally permissive: anything that LOOKS like the start
 * of a recognised opener is held back until either a closer arrives or
 * we hit `MAX_PARTIAL_TAIL`. Whitespace inside the tag body counts as
 * part of the tag for buffering purposes.
 */
function partialOpenerLen(s: string): number {
  for (let len = Math.min(s.length, MAX_PARTIAL_TAIL); len > 0; len--) {
    const tail = s.slice(s.length - len);
    if (tail[0] !== "<" && tail[0] !== "[") continue;
    // If the tail already contains the closer ('>' or ']'), it's a
    // complete-looking open tag and we let the main regex handle it.
    if (tail.includes(">") || tail.includes("]")) continue;
    // Does the tail prefix match any recognised tag name?
    const namePart = tail.slice(1).toLowerCase();
    if (namePart === "" || THINKING_TAGS.some((t) => t.startsWith(namePart))) {
      return len;
    }
  }
  return 0;
}

export function createThinkingStripper(): ThinkingStripper {
  let buffer = "";
  return {
    push(chunk: string) {
      if (!chunk) return { visible: "", thinking: [] };
      buffer += chunk;
      const { visible: emittedVisible, thinking, remainder } = drainComplete(buffer);
      buffer = remainder;
      return { visible: emittedVisible, thinking };
    },
    flush() {
      if (!buffer) return { visible: "", thinking: [] };
      // Final pass — anything still buffered is what it is.
      const out = stripThinking(buffer);
      buffer = "";
      return out;
    },
  };
}

/**
 * Pulls every COMPLETE block out of `buffer`, returning everything safe
 * to emit and what should remain buffered for the next chunk.
 *
 * Algorithm:
 *  1. Mask code fences (don't strip thinking from inside ``` … ```).
 *  2. Greedy regex over the masked buffer — every full match is removed
 *     from visible output and appended to the thinking array.
 *  3. Detect a trailing partial opener; the tail (and an in-flight open
 *     tag with no close yet) stays in the buffer. Everything before the
 *     tail is safe to emit.
 */
function drainComplete(buffer: string): {
  visible: string;
  thinking: string[];
  remainder: string;
} {
  // Hold back any unclosed code fence at the tail — we never strip from
  // inside one, but we shouldn't emit half of it either.
  const lastFenceOpen = lastUnclosedFenceStart(buffer);
  let head = buffer;
  let bufferedFence = "";
  if (lastFenceOpen !== -1) {
    head = buffer.slice(0, lastFenceOpen);
    bufferedFence = buffer.slice(lastFenceOpen);
  }

  const { masked, fences } = maskCodeFences(head);
  const regex = buildBlockRegex();
  const thinking: string[] = [];
  const stripped = masked.replace(regex, (match) => {
    thinking.push(stripEnvelope(match));
    return "";
  });

  // Hold back any open thinking tag whose close hasn't arrived yet.
  // We do this by scanning for a stray `<tag>` / `[tag]` with no
  // matching closer in the remaining (post-regex) `stripped` string.
  const openerInfo = trailingUnclosedOpener(stripped);
  let emit = stripped;
  let bufferedOpen = "";
  if (openerInfo) {
    emit = stripped.slice(0, openerInfo.index);
    bufferedOpen = stripped.slice(openerInfo.index);
  } else {
    // Even with no clear unclosed-opener, the chunk MAY end in something
    // like `<th` or `[plan` that we should hold back.
    const tailLen = partialOpenerLen(emit);
    if (tailLen > 0) {
      bufferedOpen = emit.slice(emit.length - tailLen);
      emit = emit.slice(0, emit.length - tailLen);
    }
  }

  // Re-thread the fences into the emitted slice — anything still inside
  // `bufferedFence` or `bufferedOpen` stays unprocessed.
  const visible = unmaskCodeFences(emit, fences);
  const remainder = bufferedOpen + bufferedFence;
  return {
    visible,
    thinking: thinking.map((t) => t.trim()).filter((t) => t.length > 0),
    remainder,
  };
}

/**
 * Find the position of the most-recent triple-backtick fence opener
 * that has not yet been closed by another triple-backtick. Returns -1
 * if every fence is balanced.
 */
function lastUnclosedFenceStart(s: string): number {
  let inFence = false;
  let fenceStart = -1;
  for (let i = 0; i <= s.length - 3; i++) {
    if (s[i] === "`" && s[i + 1] === "`" && s[i + 2] === "`") {
      if (inFence) {
        inFence = false;
        fenceStart = -1;
      } else {
        inFence = true;
        fenceStart = i;
      }
      i += 2;
    }
  }
  return inFence ? fenceStart : -1;
}

/**
 * Scan `s` for the first thinking-tag opener that has NO matching close
 * later in the string. Returns its start index or null.
 */
function trailingUnclosedOpener(s: string): { index: number; tag: string; style: "xml" | "bracket" } | null {
  const tagAlt = TAG_GROUP;
  // Find every opener. For each, look ahead for its matching closer.
  const openerRe = new RegExp(`<(${tagAlt})\\b[^>]*>|\\[(${tagAlt})\\b[^\\]]*\\]`, "gi");
  let m: RegExpExecArray | null;
  while ((m = openerRe.exec(s))) {
    const tag = (m[1] ?? m[2] ?? "").toLowerCase();
    const style: "xml" | "bracket" = m[1] ? "xml" : "bracket";
    const closer = style === "xml"
      ? new RegExp(`<\\/${tag}>`, "i")
      : new RegExp(`\\[\\/${tag}\\]`, "i");
    const after = s.slice(m.index + m[0].length);
    if (!closer.test(after)) {
      return { index: m.index, tag, style };
    }
  }
  return null;
}
