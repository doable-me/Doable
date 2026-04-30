// Structured logger built on pino. Auto-injects trace_id/span_id/user_id
// from AsyncLocalStorage so every log line correlates with the active trace.

import pino, { type Logger } from "pino";
import { trace } from "@opentelemetry/api";
import { getRequestContext } from "../tracing/als.js";

const level = process.env.LOG_LEVEL
  ?? (process.env.TRACING_LEVEL === "debug" ? "trace"
     : process.env.TRACING_LEVEL === "full" ? "debug"
     : process.env.TRACING_LEVEL === "off" ? "warn"
     : "info");

export const logger: Logger = pino({
  level,
  base: {
    service: process.env.SERVICE_NAME ?? "doable-api",
    env: process.env.NODE_ENV ?? "dev",
    pid: process.pid,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const span = trace.getActiveSpan();
    const sc = span?.spanContext();
    const ctx = getRequestContext();
    const out: Record<string, unknown> = {};
    if (sc?.traceId) out.trace_id = sc.traceId;
    if (sc?.spanId) out.span_id = sc.spanId;
    if (ctx?.requestId) out.request_id = ctx.requestId;
    if (ctx?.userId) out.user_id = ctx.userId;
    if (ctx?.workspaceId) out.workspace_id = ctx.workspaceId;
    if (ctx?.projectId) out.project_id = ctx.projectId;
    if (ctx?.route) out.route = ctx.route;
    return out;
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      '*.password', '*.passwd', '*.secret',
      '*.api_key', '*.apiKey', '*.token',
      '*.refresh_token', '*.access_token',
      '*.client_secret',
      '*.private_key', '*.privateKey',
      '*.jwt',
      'message.content',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Helper to record a swallowed catch on the active span + warn-level log.
 * Replaces the 25+ silent `catch {}` blocks across the codebase.
 */
export function logSwallowed(label: string, err: unknown): void {
  const span = trace.getActiveSpan();
  const e = err instanceof Error ? err : new Error(String(err));
  if (span) {
    span.addEvent("swallowed_exception", { label, "exception.type": e.name, "exception.message": e.message });
  }
  logger.warn({ err: { type: e.name, message: e.message }, label }, `swallowed exception: ${label}`);
}
