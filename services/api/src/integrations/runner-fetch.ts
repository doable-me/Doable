import { AsyncLocalStorage } from "node:async_hooks";
import { getActiveTrace } from "../ai/trace-collector.js";
import type { XrayCallHandle } from "./xray.js";

// ─── Per-call fetch isolation via AsyncLocalStorage ─────

export interface FetchContext {
  tracedFetch: typeof globalThis.fetch;
  xrayHandle: XrayCallHandle | null;
  supabaseApiKey: string | null;
}

export const fetchCtx = new AsyncLocalStorage<FetchContext>();

// One-time global fetch patch
const _originalFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(input: any, init?: RequestInit): Promise<Response> {
  const ctx = fetchCtx.getStore();
  if (ctx) {
    if (ctx.supabaseApiKey) {
      const headers = new Headers(init?.headers);
      if (!headers.has("apikey")) {
        headers.set("apikey", ctx.supabaseApiKey);
      }
      return ctx.tracedFetch(input, { ...init, headers });
    }
    return ctx.tracedFetch(input, init);
  }
  return _originalFetch(input, init);
} as typeof globalThis.fetch;

// ─── HTTP Trace Types ───────────────────────────────────

export interface HttpTraceEntry {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  durationMs: number;
  responseBody: string | null;
  error?: string;
}

/** Headers whose values should be redacted in traces */
const REDACTED_HEADERS = new Set([
  "authorization", "x-api-key", "cookie", "set-cookie",
  "x-access-token", "x-refresh-token", "proxy-authorization",
]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function headersToRecord(init?: any): Record<string, string> {
  if (!init) return {};
  if (typeof init === "object" && typeof init.forEach === "function") {
    const r: Record<string, string> = {};
    init.forEach((v: string, k: string) => { r[k] = v; });
    return r;
  }
  if (Array.isArray(init)) return Object.fromEntries(init);
  return { ...init } as Record<string, string>;
}

/**
 * Create a fetch wrapper that records HTTP calls into the provided array
 * AND feeds the xray handle with per-request phase data.
 */
export function createTracedFetch(
  traces: HttpTraceEntry[],
  projectId?: string,
  xrayHandle?: XrayCallHandle | null,
): typeof globalThis.fetch {
  return async function tracedFetch(input: any, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    // Skip tracing for internal broadcast/WS calls
    if (url.includes('/internal/broadcast') || url.includes('/internal/collab') || url.includes('/internal/yjs')) {
      return _originalFetch(input, init);
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const reqHeaders = redactHeaders(headersToRecord(init?.headers));
    const start = Date.now();

    let requestBody: string | null = null;
    try {
      if (init?.body) {
        if (typeof init.body === "string") {
          requestBody = init.body.length > 4096 ? init.body.slice(0, 4096) + `... [${init.body.length - 4096} chars truncated]` : init.body;
        } else if (init.body instanceof URLSearchParams) {
          requestBody = init.body.toString();
        } else {
          requestBody = "[non-string body]";
        }
      }
    } catch { /* body capture failed — ok */ }

    const xrayHttp = xrayHandle?.httpStart(method, url, requestBody) ?? null;

    try {
      const res = await _originalFetch(input, init);
      const durationMs = Date.now() - start;

      const resHeaders = redactHeaders(headersToRecord(res.headers));

      let bodyText: string | null = null;
      try {
        const clone = res.clone();
        const raw = await clone.text();
        bodyText = raw.length > 4096 ? raw.slice(0, 4096) + `... [${raw.length - 4096} chars truncated]` : raw;
      } catch { /* body read failed — ok */ }

      const entry: HttpTraceEntry = { url, method, requestHeaders: reqHeaders, requestBody, statusCode: res.status, responseHeaders: resHeaders, durationMs, responseBody: bodyText };
      traces.push(entry);

      console.log(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.log(`[Integration:HTTP] ── RESPONSE ${res.status} (${durationMs}ms) ──\n  Headers: ${JSON.stringify(resHeaders)}\n  Body: ${bodyText ?? "(empty)"}`);

      const trace = projectId ? getActiveTrace(projectId) : null;
      trace?.pushRaw("integration_http", entry);

      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, res.status, durationMs, bodyText);

      return res;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      const entry: HttpTraceEntry = {
        url, method, requestHeaders: reqHeaders, requestBody, statusCode: null,
        responseHeaders: {}, durationMs, responseBody: null, error: errMsg,
      };
      traces.push(entry);
      console.error(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.error(`[Integration:HTTP] ── FAILED (${durationMs}ms) ──\n  Error: ${errMsg}\n  Stack: ${err instanceof Error ? err.stack : "n/a"}`);

      const trace = projectId ? getActiveTrace(projectId) : null;
      trace?.pushRaw("integration_http_error", entry);

      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, null, durationMs, null, errMsg);

      throw err;
    }
  };
}
