// Server-side hooks for the MCP Apps extension protocol.
// Spec: https://modelcontextprotocol.io/extensions/apps/overview
//
// MCP tools may declare `_meta.ui.resourceUri` pointing to a `ui://` resource
// (HTML + JS for an interactive iframe). The host fetches the resource and
// renders it in a sandbox. This module wraps both:
//   1. detection of `_meta.ui` on tool descriptions when the host first sees them
//   2. fetching the `ui://` resource (one OTel span per fetch)

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";

export interface ToolMetaUi {
  resourceUri?: string;
  permissions?: string[];
  csp?: string[];
  [k: string]: unknown;
}

export interface ToolDescription {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: { ui?: ToolMetaUi; [k: string]: unknown };
}

/**
 * Inspect a list of tool descriptions and emit a span event on the active
 * span for each tool that declares an MCP App UI resource. Useful for
 * dashboards: how many connectors expose UIs, which tools, etc.
 *
 * Pass `connectorId` so the event is attributable to the specific connector.
 */
export function detectAppsInToolList(connectorId: string, tools: ToolDescription[]): void {
  const tracer = getTracer("doable-api/mcp-apps");
  const span = tracer.startSpan("mcp.app.detect", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "mcp.connector.id": connectorId,
      "mcp.tools.count": tools.length,
    },
  });
  let appCount = 0;
  for (const tool of tools) {
    const ui = tool._meta?.ui;
    if (ui?.resourceUri && typeof ui.resourceUri === "string" && ui.resourceUri.startsWith("ui://")) {
      appCount++;
      span.addEvent("mcp.app.detected", {
        "mcp.tool.name": tool.name,
        "mcp.app.resource_uri": ui.resourceUri,
        "mcp.app.permissions": (ui.permissions ?? []).join(","),
        "mcp.app.csp_count": (ui.csp ?? []).length,
      });
    }
  }
  span.setAttribute("mcp.app.detected_count", appCount);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Wrap an MCP `resources/read` (or equivalent) call when the host fetches a
 * `ui://` resource. Returns the result of `fetcher` after recording the span.
 */
export async function tracedAppResourceFetch<T>(
  args: { connectorId: string; resourceUri: string },
  fetcher: () => Promise<T>,
): Promise<T> {
  const tracer = getTracer("doable-api/mcp-apps");
  const span = tracer.startSpan("mcp.app.resource_fetch", {
    kind: SpanKind.CLIENT,
    attributes: {
      "mcp.connector.id": args.connectorId,
      "mcp.app.resource_uri": args.resourceUri,
    },
  });
  const t0 = Date.now();
  try {
    const result = await fetcher();
    span.setAttribute("mcp.app.fetch.duration_ms", Date.now() - t0);
    if (typeof result === "object" && result != null) {
      const r = result as { contents?: Array<{ text?: string; blob?: string }> };
      if (r.contents && r.contents.length > 0) {
        const first = r.contents[0];
        const bytes = (first?.text?.length ?? 0) + (first?.blob?.length ?? 0);
        span.setAttribute("mcp.app.bytes", bytes);
        span.setAttribute("mcp.app.content_count", r.contents.length);
      }
    }
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setAttribute("mcp.app.fetch.duration_ms", Date.now() - t0);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message.slice(0, 200) });
    throw err;
  } finally {
    span.end();
  }
}
