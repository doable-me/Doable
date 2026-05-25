/**
 * Gemini OpenAI-compatibility proxy
 *
 * The @github/copilot SDK sends parameters unsupported by Google's
 * `/v1beta/openai/chat/completions` endpoint (e.g. `parallel_tool_calls`,
 * `frequency_penalty`, `presence_penalty`). Gemini returns HTTP 400 with
 * no body when it encounters these, causing "400 400 status code (no body)"
 * CAPIErrors on multi-turn tool-calling conversations (i.e. bigger app
 * generation).
 *
 * This lightweight proxy strips those parameters and forwards the request
 * to the real Gemini endpoint. The Copilot CLI's provider `baseUrl` is
 * rewritten at session-creation time to point here instead of directly
 * at generativelanguage.googleapis.com.
 */

import { Hono } from "hono";
import { setRateLimitState, clearRateLimitState } from "../ai/rate-limit-state.js";

export const geminiProxyRoutes = new Hono({ strict: false });

/**
 * Recursively walk the request payload and replace any null values with
 * "" (for string-typed fields) or remove them entirely. Gemini's OpenAI
 * compat layer returns 400 "Value is not a string: null" for any null
 * in a position where a string is expected. Rather than guessing which
 * fields, we sanitize all nulls to empty strings in the JSON tree.
 */
function sanitizeNulls(obj: unknown): unknown {
  if (obj === null) return "";
  if (Array.isArray(obj)) return obj.map(sanitizeNulls);
  if (typeof obj === "object" && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null) {
        // For known object-typed fields, omit entirely rather than coercing
        // to empty string (e.g. `function_call`, `tool_calls` when null → omit)
        if (k === "function_call" || k === "tool_calls" || k === "tool_choice") continue;
        out[k] = "";
      } else {
        out[k] = sanitizeNulls(v);
      }
    }
    return out;
  }
  return obj;
}
/** Parameters that Gemini's OpenAI-compat endpoint does not support. */
const UNSUPPORTED_PARAMS = new Set([
  "parallel_tool_calls",
  "frequency_penalty",
  "presence_penalty",
  "logprobs",
  "top_logprobs",
  "logit_bias",
  "user",
  // OpenAI-specific extensions the SDK may inject
  "service_tier",
  "store",
  "metadata",
  // stream_options (e.g. include_usage) not supported by Gemini compat layer
  "stream_options",
]);

/**
 * Catch-all: POST /__gemini-proxy/<path>
 *
 * The CLI calls baseUrl + "chat/completions", so a request arrives at
 * `/__gemini-proxy/v1beta/openai/chat/completions`.
 */
geminiProxyRoutes.post("/*", async (c) => {
  const subPath = c.req.path.replace(/^\/__gemini-proxy/, "");
  const targetUrl = `https://generativelanguage.googleapis.com${subPath}`;

  // Read the original request body
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Strip unsupported parameters
  for (const param of UNSUPPORTED_PARAMS) {
    delete body[param];
  }

  // Also strip the non-standard `thinking` field if present (Copilot SDK
  // extension for reasoning models — not part of the OpenAI spec and not
  // supported by Gemini's compatibility layer).
  if ("thinking" in body) {
    delete body["thinking"];
  }

  // BUG-GEMINI-NULL: Gemini rejects "Value is not a string: null" when
  // messages contain null values anywhere that a string is expected.
  // The OpenAI spec allows `content: null` for assistant messages with
  // tool_calls, but Gemini's compat layer does not.
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages as Record<string, unknown>[]) {
      // Coerce null/undefined content to empty string
      if (msg.content === null || msg.content === undefined) {
        msg.content = "";
      }
      // Strip null `name` fields
      if ("name" in msg && msg.name === null) {
        delete msg.name;
      }
      // Coerce null function arguments in tool_calls
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls as Record<string, unknown>[]) {
          const fn = tc.function as Record<string, unknown> | undefined;
          if (fn) {
            if (fn.arguments === null || fn.arguments === undefined) {
              fn.arguments = "{}";
            }
          }
        }
      }
      // Coerce null `tool_call_id` (tool response messages)
      if ("tool_call_id" in msg && msg.tool_call_id === null) {
        msg.tool_call_id = "";
      }
    }
  }

  // Strip null descriptions from tools definitions
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools as Record<string, unknown>[]) {
      const fn = tool.function as Record<string, unknown> | undefined;
      if (fn) {
        if (fn.description === null || fn.description === undefined) {
          delete fn.description;
        }
      }
    }
  }

  // Final catch-all: recursively sanitize any remaining nulls in the entire
  // body. This handles edge cases where nulls appear in nested structures
  // we didn't explicitly handle above.
  body = sanitizeNulls(body) as Record<string, unknown>;

  // Forward all original headers (Authorization carries the Gemini API key)
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const authHeader = c.req.header("authorization");
  if (authHeader) headers["authorization"] = authHeader;
  const apiKeyHeader = c.req.header("x-goog-api-key");
  if (apiKeyHeader) headers["x-goog-api-key"] = apiKeyHeader;

  // Determine if streaming
  const isStreaming = body.stream === true;
  const bodyJson = JSON.stringify(body);

  // Retry logic for 429/503 rate limiting with exponential backoff.
  // Gemini free tier has low RPM limits (30/min). A single app generation
  // triggers 10-20+ API calls, so hitting rate limits mid-generation is
  // normal. We retry patiently (up to ~2.5 min) to ride through the rate
  // limit window rather than failing.
  const MAX_RETRIES = 12;
  const BASE_DELAY_MS = 2000;
  const MAX_DELAY_MS = 20_000; // cap individual wait at 20s

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: bodyJson,
      });

      // If rate limited (429) or overloaded (503), retry with backoff
      if ((resp.status === 429 || resp.status === 503) && attempt < MAX_RETRIES) {
        // Read the raw error body from the provider
        let rawBody = "";
        try { rawBody = await resp.text(); } catch {}
        const retryAfter = resp.headers.get("retry-after");
        const expDelay = BASE_DELAY_MS * Math.pow(2, attempt);
        const delayMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000) // respect retry-after but cap at 60s
          : Math.min(expDelay, MAX_DELAY_MS);

        // Broadcast rate limit state so the chat heartbeat can show it to the user
        setRateLimitState({
          rawError: rawBody.slice(0, 500) || `HTTP ${resp.status} from Gemini API`,
          statusCode: resp.status,
          hitAt: Date.now(),
          nextRetryAt: Date.now() + delayMs,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
        });

        console.warn(`[GeminiProxy] ${resp.status} rate limited, retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms. Raw: ${rawBody.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      // Success or non-rate-limit response — clear the rate limit state
      clearRateLimitState();

      // After all retries exhausted for 429/503, return a non-retryable error
      // so the SDK surfaces the error to the user.
      if (resp.status === 429 || resp.status === 503) {
        let rawBody = "";
        try { rawBody = await resp.text(); } catch {}
        console.error(`[GeminiProxy] ${resp.status} rate limit exhausted after ${MAX_RETRIES} retries (~2.5 min) — returning 400. Raw: ${rawBody.slice(0, 300)}`);
        clearRateLimitState();
        return c.json(
          {
            error: {
              message: `Rate limit exceeded on AI provider (Gemini). Retried for over 2 minutes. Provider response: ${rawBody.slice(0, 300) || `HTTP ${resp.status}`}`,
              type: "rate_limit_exceeded",
              code: "rate_limit",
            },
          },
          400,
        );
      }

      if (!resp.ok || !isStreaming) {
        // Non-streaming or error: pass through as-is
        const responseBody = await resp.text();
        if (!resp.ok) {
          console.error(`[GeminiProxy] ${resp.status} from Gemini (attempt ${attempt + 1}). Body keys: ${Object.keys(body).join(", ")}. Response: ${responseBody.slice(0, 500)}`);
        }
        return new Response(responseBody, {
          status: resp.status,
          headers: {
            "content-type": resp.headers.get("content-type") ?? "application/json",
          },
        });
      }

      // Streaming: pipe through SSE
      if (!resp.body) {
        return new Response("No response body", { status: 502 });
      }

      return new Response(resp.body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        },
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        console.warn(`[GeminiProxy] Fetch error, retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms:`, err instanceof Error ? err.message : String(err));
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[GeminiProxy] Fetch failed after retries:", msg);
      return c.json({ error: { message: `Proxy error: ${msg}`, type: "proxy_error" } }, 502);
    }
  }

  // Should not reach here, but just in case
  return c.json({ error: { message: "Max retries exceeded", type: "proxy_error" } }, 502);
});

/** GET passthrough — e.g. /models listing (no body to strip). */
geminiProxyRoutes.get("/*", async (c) => {
  const subPath = c.req.path.replace(/^\/__gemini-proxy/, "");
  const targetUrl = `https://generativelanguage.googleapis.com${subPath}`;

  const headers: Record<string, string> = {};
  const authHeader = c.req.header("authorization");
  if (authHeader) headers["authorization"] = authHeader;
  const apiKeyHeader = c.req.header("x-goog-api-key");
  if (apiKeyHeader) headers["x-goog-api-key"] = apiKeyHeader;

  try {
    const resp = await fetch(targetUrl, { method: "GET", headers });
    const responseBody = await resp.text();
    return new Response(responseBody, {
      status: resp.status,
      headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: { message: `Proxy error: ${msg}`, type: "proxy_error" } }, 502);
  }
});
