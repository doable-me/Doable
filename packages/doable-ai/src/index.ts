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
 */

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

// ── Thinking-tag helpers (exported for generated apps + Doable's own UI) ───

export {
  stripThinking,
  createThinkingStripper,
  THINKING_TAGS,
  type StripThinkingResult,
  type ThinkingStripper,
  type ThinkingTagName,
} from "./thinking.js";
