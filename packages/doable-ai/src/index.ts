/**
 * @doable/ai — Runtime AI client SDK.
 *
 * Calls the server-side AI proxy (/__doable/ai/*) using the same
 * project-scoped token that @doable/data uses. Zero dependencies.
 *
 * Usage:
 *   import { ai } from "@doable/ai";
 *
 *   // Streaming chat (async-iterator)
 *   for await (const token of ai.chat([{ role: "user", content: "Hello" }])) {
 *     setResponse(r => r + token);
 *   }
 *
 *   // Non-streaming (full response in one promise)
 *   const result = await ai.chatSync([{ role: "user", content: "Hello" }]);
 *
 *   // Batch embeddings
 *   const { vectors } = await ai.embed(["semantic search text"]);
 *
 *   // MCP tool-calling assistant (ReAct loop over connected MCP tools)
 *   import { runMcpAgent } from "@doable/ai";
 *   import { createDoableClient } from "@doable/sdk";
 *   const doable = createDoableClient();
 *   const { answer } = await runMcpAgent({ mcp: doable.mcp, prompt: "how many cases?" });
 */

import { stripThinking } from "./thinking.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  /** Provider-side max_tokens hint, capped by project settings. */
  max_tokens?: number;
  /** Called on each streamed text token. Alternative to the async-iterator. */
  onToken?: (token: string) => void;
  /**
   * Called when the project/per-user token budget is exhausted (HTTP 402
   * BUDGET_EXCEEDED). When provided, the generator returns gracefully rather
   * than throwing, so callers can show a friendly inline message without a
   * try/catch.
   *
   * @param message Human-readable message from the server (e.g. "Project
   *   token budget exceeded").
   */
  onQuotaExceeded?: (message: string) => void;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatResult {
  content: string;
  usage?: ChatUsage;
  elapsed_ms: number;
  /**
   * True when the server returned 402 BUDGET_EXCEEDED and
   * `opts.onQuotaExceeded` was provided. The generator returned early
   * without throwing so the caller can render a friendly message.
   */
  quotaExceeded?: boolean;
}

export interface EmbedResult {
  ok: boolean;
  /** First vector for the single-string overload, all vectors for the array overload. */
  vectors: number[][];
  /** Convenience: first vector when only one text was embedded. */
  embedding: number[];
  model: string;
  dimensions?: number;
  elapsed_ms: number;
  error?: { code: string; message: string };
}

export interface AiClientOptions {
  /** When provided, used directly. When empty, the client reads
   *  globalThis.__DOABLE_DATA_TOKEN at call time (lazy resolution). */
  token: string;
  /** Base URL for the API. Default "" = same-origin (preview iframe). */
  baseUrl?: string;
}

export interface AiError extends Error {
  code?: string;
  status?: number;
}

// ── Client ─────────────────────────────────────────────────────────────────

/** Max time to wait for a runtime-injected token before giving up (ms). */
const TOKEN_WAIT_MS = 5000;
/** Poll interval while waiting for the token global to be populated (ms). */
const TOKEN_POLL_MS = 50;

export class DoableAiClient {
  private opts: AiClientOptions;

  constructor(opts: AiClientOptions) {
    this.opts = opts;
  }

  /**
   * Streaming chat — returns an async-iterator of text tokens.
   * Each yielded string is one text_delta from the server SSE stream.
   *
   * If opts.onToken is provided it is called for every token AND the
   * iterator still yields the same tokens — callers can use either style.
   *
   * @example
   *   for await (const tok of ai.chat(messages)) setReply(r => r + tok);
   */
  async *chat(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): AsyncGenerator<string, ChatResult, undefined> {
    // Resolve token, awaiting a bounded window for the bridge to inject it so an
    // on-mount call doesn't race the (async) token arrival and send an empty
    // Bearer. No-op when a token is already present.
    let token = await this._resolveToken();
    const url = `${this.opts.baseUrl ?? ""}/__doable/ai/chat`;
    const doFetch = (bearer: string) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          messages,
          stream: true,
          max_tokens: opts.max_tokens,
        }),
      });

    let res = await doFetch(token);

    // If we sent an empty token (token arrived after _resolveToken gave up) or
    // the server rejected an in-flight/expired token with 401, re-resolve once
    // and retry — by now the bridge has very likely populated the global. Only
    // when the constructor token was empty (lazy global-bound client).
    if ((res.status === 401 || token === "") && this.opts.token === "") {
      const fresh = await this._resolveToken();
      if (fresh && fresh !== token) {
        token = fresh;
        res = await doFetch(token);
      }
    }

    if (!res.ok || !res.body) {
      let parsed: { error?: { code: string; message: string } } = {};
      try { parsed = await res.json() as typeof parsed; } catch { /* not JSON */ }
      const code = parsed.error?.code ?? "NETWORK_ERROR";
      const message = parsed.error?.message ?? res.statusText;

      // Phase 3 quota UX: 402 BUDGET_EXCEEDED → call onQuotaExceeded and
      // return gracefully instead of throwing, so the generated app can
      // render a friendly inline message without a try/catch.
      if (res.status === 402 && code === "BUDGET_EXCEEDED" && opts.onQuotaExceeded) {
        opts.onQuotaExceeded(message);
        return { content: "", elapsed_ms: 0, quotaExceeded: true };
      }

      const err = new Error(message) as AiError;
      err.code = code;
      err.status = res.status;
      throw err;
    }

    let fullContent = "";
    let usage: ChatUsage | undefined;
    let elapsed = 0;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines. Each frame may have
      // multiple `data:` lines but we emit one per line and that is OK
      // since our server only ever sends one data line per event.
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        let event: { type: string; data?: unknown };
        try { event = JSON.parse(data) as { type: string; data?: unknown }; } catch { continue; }

        if (event.type === "text_delta" && typeof event.data === "string") {
          fullContent += event.data;
          opts.onToken?.(event.data);
          yield event.data;
        } else if (event.type === "done" && event.data && typeof event.data === "object") {
          const d = event.data as { usage?: ChatUsage; elapsed_ms?: number };
          usage = d.usage;
          elapsed = d.elapsed_ms ?? 0;
        } else if (event.type === "error" && typeof event.data === "string") {
          const err = new Error(event.data) as AiError;
          err.code = "PROVIDER_ERROR";
          throw err;
        }
      }
    }

    return { content: fullContent, usage, elapsed_ms: elapsed };
  }

  /**
   * Non-streaming chat — awaits the full response then returns it.
   * Convenience wrapper around the streaming method.
   */
  async chatSync(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    let content = "";
    const gen = this.chat(messages, {
      ...opts,
      onToken: (t) => { content += t; opts.onToken?.(t); },
    });

    let step = await gen.next();
    while (!step.done) {
      step = await gen.next();
    }
    const final: ChatResult = step.value ?? { content, elapsed_ms: 0 };
    if (!final.content) final.content = content;
    return final;
  }

  /**
   * Batch embeddings — returns vectors for each input text.
   * Accepts a single string (returns embedding[]) or array of strings.
   * The embedding model is configured workspace-side; the app cannot pick it.
   */
  async embed(input: string | string[]): Promise<EmbedResult> {
    // Resolve token, awaiting a bounded window for the bridge to inject it so an
    // on-mount call doesn't race the (async) token arrival. No-op when present.
    let token = await this._resolveToken();
    const texts = Array.isArray(input) ? input : [input];

    const url = `${this.opts.baseUrl ?? ""}/__doable/ai/embed`;
    const doFetch = (bearer: string) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${bearer}`,
        },
        body: JSON.stringify({ texts }),
      });

    let res = await doFetch(token);

    // Re-resolve once and retry on a 401 (or empty initial token) when the
    // constructor token was empty — by now the bridge has likely injected it.
    if ((res.status === 401 || token === "") && this.opts.token === "") {
      const fresh = await this._resolveToken();
      if (fresh && fresh !== token) {
        token = fresh;
        res = await doFetch(token);
      }
    }

    let body: Partial<EmbedResult> & { error?: { code: string; message: string } } = {};
    try { body = await res.json() as typeof body; } catch { /* not JSON */ }

    const vectors = Array.isArray(body.vectors) ? body.vectors as number[][] : [];
    const embedding = vectors[0] ?? [];
    return {
      ok: res.ok && body.ok !== false,
      vectors,
      embedding,
      model: body.model ?? "",
      dimensions: body.dimensions ?? embedding.length,
      elapsed_ms: body.elapsed_ms ?? 0,
      error: body.error,
    };
  }

  /**
   * Token resolution: read from opts.token, then from globalThis.__DOABLE_DATA_TOKEN.
   * The SAME token covers both @doable/data and @doable/ai — one credential
   * for the entire data+ai plane. Token is injected at preview time by the
   * CONNECTOR_BRIDGE_SNIPPET in routes/preview-proxy/injected-scripts.ts and
   * baked into published apps by deploy/auto-api-key.ts:injectDataToken.
   *
   * The bridge delivers the token asynchronously, so an app's on-mount call can
   * fire before the token lands. When that happens this method waits — bounded
   * to TOKEN_WAIT_MS — for the global to appear instead of sending an empty
   * Bearer (which the server rejects with 401). Fast path: when a token is
   * already present it resolves immediately with zero added latency. SSR/no-
   * window safe: if there is no global the loop simply times out and returns "".
   */
  private async _resolveToken(): Promise<string> {
    if (this.opts.token) return this.opts.token;

    const readGlobal = (): string =>
      ((globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] as string) || "";

    const immediate = readGlobal();
    if (immediate) return immediate;

    // Token not here yet — bounded poll for the bridge to inject it.
    const deadline = Date.now() + TOKEN_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, TOKEN_POLL_MS));
      const t = readGlobal();
      if (t) return t;
    }
    return "";
  }
}

// ── Default lazily-bound singleton ─────────────────────────────────────────

/**
 * Default client. Token is read from globalThis.__DOABLE_DATA_TOKEN at each
 * call (same lazy-binding pattern as @doable/data's `db` export). In preview
 * this global is set by the CONNECTOR_BRIDGE_SNIPPET before any user script
 * runs. In a published app the deploy injector writes the same global into
 * index.html (see auto-api-key.ts:injectDataToken).
 */
export const ai = new DoableAiClient({ token: "" });

export function createAiClient(opts: AiClientOptions): DoableAiClient {
  return new DoableAiClient(opts);
}

// ── MCP tool-calling assistant (ReAct loop) ────────────────────────────────
//
// Generated "AI assistant / chatbot over MCP" apps need a model↔tool loop:
// the model decides which connected MCP tool to call, the app calls it, feeds
// the REAL result back, and the model answers from that data. Hand-written
// versions of this loop are the #1 source of broken MCP chatbots — a greedy
// `/\{[\s\S]*\}/` match spans the first "{" to the LAST "}", so the moment the
// model emits more than one tool-call object (or wraps it in prose) JSON.parse
// throws, the tool never executes, and the model's fabricated text leaks to the
// UI as if it were real data. `runMcpAgent` centralises a robust version here
// so every generated app gets it for free — no per-app parsing code.

/**
 * Structural shape of the MCP client returned by
 * `createDoableClient().mcp` in @doable/sdk. Declared structurally so
 * @doable/ai stays dependency-free (no import of @doable/sdk).
 */
export interface McpClientLike {
  list(): Promise<{
    success: boolean;
    data: Array<{
      fullName?: string;
      name?: string;
      connectorName?: string;
      toolName?: string;
      description?: string;
    }>;
    error: { code: string; message: string } | null;
  }>;
  call(
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    data: unknown;
    error: { code: string; message: string; loginUrl?: string } | null;
  }>;
}

export interface McpToolInvocation {
  tool: string;
  args: Record<string, unknown>;
}

export interface RunMcpAgentOptions {
  /** MCP client — pass `createDoableClient().mcp` from @doable/sdk. */
  mcp: McpClientLike;
  /** The user's message/question for this turn. */
  prompt: string;
  /** Extra domain/system instructions prepended to the agent system prompt. */
  system?: string;
  /** Prior conversation turns (user/assistant) — excludes the system message. */
  history?: ChatMessage[];
  /** AI client to use. Defaults to the shared `ai` singleton. */
  client?: DoableAiClient;
  /** Max tool-call rounds before forcing a final answer. Default 6. */
  maxSteps?: number;
  /** Fires right before each MCP tool executes (for a "calling X…" indicator). */
  onToolCall?: (ev: McpToolInvocation) => void;
  /** Fires after each MCP tool returns. */
  onToolResult?: (ev: McpToolInvocation & { success: boolean }) => void;
  /** Max characters of a single tool result fed back to the model. Default 6000. */
  maxToolResultChars?: number;
}

export interface RunMcpAgentResult {
  /** The assistant's final natural-language answer (markdown). */
  answer: string;
  /** Tool fullNames that were executed, in call order. */
  toolsUsed: string[];
  /** Full transcript (system + turns) — pass back as `history` to continue. */
  messages: ChatMessage[];
  /** True when an MCP tool reported it needs (re)authentication. */
  authRequired: boolean;
  /** A login URL when the MCP server requires (re)auth. */
  loginUrl?: string;
}

/**
 * Extract the FIRST valid `{"tool":…,"args":…}` object from model output.
 *
 * Strips `[TOOL_CALL]`/`[/TOOL_CALL]` wrappers, then scans BALANCED-BRACE
 * candidates (string-literal aware) and `JSON.parse`s each, returning the first
 * that has a string `tool` field. Robust to multiple JSON objects, surrounding
 * prose, and code fences — unlike a greedy `/\{[\s\S]*\}/` match.
 *
 * Exported so apps/tests can reuse it, but generated apps normally just call
 * `runMcpAgent` and never touch this directly.
 */
export function extractMcpToolCall(
  text: string,
): { tool: string; args: Record<string, unknown> } | null {
  const t = text.replace(/\[\/?TOOL_CALL\]/gi, "");
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(t.slice(i, j + 1)) as Record<string, unknown>;
            if (obj && typeof obj === "object" && typeof obj.tool === "string") {
              const args =
                obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
                  ? (obj.args as Record<string, unknown>)
                  : {};
              return { tool: obj.tool, args };
            }
          } catch {
            // not valid JSON — keep scanning from the next "{"
          }
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Run a model↔MCP-tool ReAct loop and return a final answer composed from REAL
 * tool results. The single robust entry point for AI-assistant / chatbot apps
 * built over connected MCP servers — generic to ANY MCP server, workspace, or
 * project. Generated apps should call this instead of writing their own
 * tool-call parsing/loop.
 *
 * Flow: discover tools via `mcp.list()` → build a system prompt with the tool
 * catalogue → loop: `ai.chatSync` → extract first tool call → `mcp.call` →
 * feed the real `TOOL_RESULT` back → repeat until the model answers in prose
 * (or `maxSteps` is hit). Never fabricates data; if a tool errors, the error is
 * fed back so the model can recover or explain.
 */
export async function runMcpAgent(
  opts: RunMcpAgentOptions,
): Promise<RunMcpAgentResult> {
  const client = opts.client ?? ai;
  const maxSteps = opts.maxSteps ?? 6;
  const maxChars = opts.maxToolResultChars ?? 6000;
  const toolsUsed: string[] = [];
  let authRequired = false;
  let loginUrl: string | undefined;

  // 1. Discover tools at runtime — never hardcode tool names.
  let toolCatalog = "";
  try {
    const listed = await opts.mcp.list();
    if (listed.success && Array.isArray(listed.data)) {
      toolCatalog = listed.data
        .map((tl) => {
          const name = tl.fullName || tl.name || "";
          const desc = (tl.description || "").replace(/\s+/g, " ").slice(0, 200);
          return name ? `- ${name}${desc ? `: ${desc}` : ""}` : "";
        })
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    // Listing failed — the loop still runs; the model can answer directly.
  }

  const system =
    (opts.system ? opts.system.trim() + "\n\n" : "") +
    "You are an assistant that answers using ONLY real data returned by MCP tools. " +
    "NEVER invent, guess, or use placeholder/mock data.\n\n" +
    "AVAILABLE MCP TOOLS (call by EXACT name):\n" +
    (toolCatalog || "(none discovered — answer from the conversation only)") +
    "\n\n" +
    "To call a tool, reply with ONLY a single JSON object and nothing else:\n" +
    '{"tool":"<exact_tool_name>","args":{ ...arguments }}\n\n' +
    "After each tool call you receive a message starting with TOOL_RESULT containing the real data. " +
    "You may call multiple tools (one per reply) before answering. " +
    "When you have enough information, reply with the FINAL answer in clear natural language " +
    "(markdown tables/bullets welcome) and DO NOT include any JSON tool call in that final reply.";

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...(opts.history ?? []),
    { role: "user", content: opts.prompt },
  ];

  let answer = "";

  for (let step = 0; step < maxSteps; step++) {
    const { content } = await client.chatSync(messages);
    const reply = stripThinking(content).visible.trim();

    const call = extractMcpToolCall(reply);
    if (!call) {
      // No tool call — this is the model's final natural-language answer.
      answer = reply;
      break;
    }

    // Record the tool call as an assistant turn for conversation context.
    messages.push({
      role: "assistant",
      content: JSON.stringify({ tool: call.tool, args: call.args }),
    });
    opts.onToolCall?.({ tool: call.tool, args: call.args });

    let result: Awaited<ReturnType<McpClientLike["call"]>>;
    try {
      result = await opts.mcp.call(call.tool, call.args);
    } catch (err) {
      opts.onToolResult?.({ tool: call.tool, args: call.args, success: false });
      messages.push({
        role: "user",
        content: `TOOL_ERROR for ${call.tool}: ${err instanceof Error ? err.message : "tool call threw"}. Do not retry identically; try a different tool/args or explain the issue to the user.`,
      });
      continue;
    }

    toolsUsed.push(call.tool);
    opts.onToolResult?.({ tool: call.tool, args: call.args, success: !!result.success });

    if (!result.success) {
      if (result.error?.loginUrl) {
        authRequired = true;
        loginUrl = result.error.loginUrl;
      }
      messages.push({
        role: "user",
        content: `TOOL_ERROR for ${call.tool}: ${result.error?.message ?? "tool call failed"}${result.error?.loginUrl ? ` (login required: ${result.error.loginUrl})` : ""}. Do not retry identically; try different args/tool or explain to the user.`,
      });
      continue;
    }

    let resultStr: string;
    try {
      resultStr = JSON.stringify(result.data);
    } catch {
      resultStr = String(result.data);
    }
    if (resultStr.length > maxChars) {
      resultStr = resultStr.slice(0, maxChars) + " …(truncated)";
    }
    messages.push({
      role: "user",
      content: `TOOL_RESULT for ${call.tool}:\n${resultStr}\n\nUse ONLY this real data. If you have enough information, give the final answer now in natural language (no JSON). Otherwise call another tool.`,
    });
  }

  if (!answer) {
    // Hit the step cap without a plain answer — force a final prose answer.
    messages.push({
      role: "user",
      content:
        "Provide your best FINAL answer now using the real tool data above, in natural language. Do NOT output any JSON tool call.",
    });
    try {
      const { content } = await client.chatSync(messages);
      answer = stripThinking(content).visible.trim();
    } catch {
      answer = "";
    }
    if (!answer) {
      answer =
        "I gathered the data but couldn't compose a final answer. Please try rephrasing your question.";
    }
  }

  return { answer, toolsUsed, messages, authRequired, loginUrl };
}

// ── Thinking-tag helpers (exported for generated apps + Doable's own UI) ───

export {
  stripThinking,
  createThinkingStripper,
  THINKING_TAGS,
  type StripThinkingResult,
  type ThinkingStripper,
  type ThinkingTagName,
} from "./thinking.js";
