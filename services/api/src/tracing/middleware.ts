// Hono middleware: extract incoming W3C traceparent OR generate a new
// request-scoped trace_id, populate AsyncLocalStorage with RequestContext,
// emit the root span for the request.

import type { Context, MiddlewareHandler } from "hono";
import { SpanKind, SpanStatusCode, context as otelContext, trace, propagation } from "@opentelemetry/api";
import { generateRequestId, runWithRequestContext, setRequestContextFields } from "./als.js";
import { getTracer } from "./instrumentation.js";
import type { RequestContext } from "./types.js";

const TRACER_NAME = "doable-api/http";

export const tracingMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? generateRequestId();
  const route = c.req.routePath || c.req.path;

  // Extract traceparent from the incoming headers, if any.
  const carrier: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.req.header() ?? {})) {
    if (typeof v === "string") carrier[k.toLowerCase()] = v;
  }
  const upstream = propagation.extract(otelContext.active(), carrier);

  const tracer = getTracer(TRACER_NAME);
  const span = tracer.startSpan(
    `${c.req.method} ${route}`,
    { kind: SpanKind.SERVER, attributes: { "http.method": c.req.method, "http.route": route, "http.url": c.req.url } },
    upstream,
  );
  const sc = span.spanContext();
  const ctx: RequestContext = {
    requestId,
    traceId: sc.traceId,
    spanId: sc.spanId,
    route,
  };
  c.header("x-request-id", requestId);
  c.set("requestId", requestId);
  c.set("traceId", sc.traceId);

  await runWithRequestContext(ctx, async () => {
    return otelContext.with(trace.setSpan(otelContext.active(), span), async () => {
      try {
        await next();
        const status = c.res.status;
        span.setAttribute("http.status_code", status);
        if (status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
  });
};

/**
 * Helper for routes that have already authenticated the user — call after
 * auth middleware so the user_id/workspace_id/project_id propagate into spans.
 */
export function attachAuthContext(c: Context, fields: { userId?: string; workspaceId?: string; projectId?: string }) {
  setRequestContextFields(fields);
  const span = trace.getActiveSpan();
  if (span) {
    if (fields.userId) span.setAttribute("user_id", fields.userId);
    if (fields.workspaceId) span.setAttribute("workspace_id", fields.workspaceId);
    if (fields.projectId) span.setAttribute("project_id", fields.projectId);
  }
}
