// Host-side helper for mounting an MCP App in a sandboxed iframe and
// observing every boundary as an OTel span/event.
//
// Spec: https://modelcontextprotocol.io/extensions/apps/overview
//
// Even when doable does not currently render MCP Apps, this module is the
// entry point for when it does. Every postMessage in/out, every ui/* method,
// every app-initiated tools/call relay is span-traced.

import { SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import { getTracer } from "./tracer-shim";
import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  McpAppManifest,
  ToolsCallParams,
  UiInitializeParams,
  UiInitializeResult,
} from "./types";

export interface HostHooks {
  /** Forward an app-initiated tools/call to the MCP server (host implements). */
  forwardToolsCall: (params: ToolsCallParams) => Promise<unknown>;
  /** Optional: handle ui/setContext notifications from the app. */
  onSetContext?: (ctx: Record<string, unknown>) => void;
  /** Optional: open a link on user behalf (sendOpenLink capability). */
  onOpenLink?: (url: string) => void;
}

export interface MountResult {
  /** End the long-running session span and detach listeners. */
  dispose: () => void;
  /** Send a message to the app (e.g. push fresh tool result). */
  postToApp: (message: JsonRpcMessage) => void;
}

interface HostState {
  iframe: HTMLIFrameElement;
  manifest: McpAppManifest;
  hooks: HostHooks;
  sessionSpan: Span;
  expectedOrigin: string;
  initialized: boolean;
}

const ALLOWED_ORIGINS_FALLBACK = "*"; // sandboxed iframes have a null origin

/**
 * Mount an MCP App inside an existing iframe element. The iframe MUST already
 * have its sandbox attribute set per the host's policy (e.g.
 * "allow-scripts allow-same-origin" — the spec recommends withholding
 * allow-same-origin unless the app needs it).
 */
export function mountMcpApp(
  iframe: HTMLIFrameElement,
  manifest: McpAppManifest,
  hooks: HostHooks,
): MountResult {
  const tracer = getTracer();
  const sessionSpan = tracer.startSpan("mcp.app.session", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "mcp.app.resource_uri": manifest.resourceUri,
      "mcp.app.connector_id": manifest.connectorId,
      "mcp.app.originating_tool": manifest.originatingToolName ?? "",
      "mcp.app.permissions": (manifest.permissions ?? []).join(","),
      "mcp.app.csp_origins": (manifest.csp ?? []).join(","),
    },
  });

  const state: HostState = {
    iframe,
    manifest,
    hooks,
    sessionSpan,
    expectedOrigin: iframe.src ? new URL(iframe.src).origin : ALLOWED_ORIGINS_FALLBACK,
    initialized: false,
  };

  const onLoad = () => {
    sessionSpan.addEvent("iframe.load");
  };
  const onError = (e: ErrorEvent) => {
    const errSpan = tracer.startSpan("mcp.app.iframe_error", { kind: SpanKind.INTERNAL });
    errSpan.recordException(e.error ?? new Error(e.message));
    errSpan.setStatus({ code: SpanStatusCode.ERROR });
    errSpan.end();
    sessionSpan.addEvent("iframe.error", { "error.message": e.message?.slice(0, 200) ?? "" });
  };

  iframe.addEventListener("load", onLoad);
  iframe.addEventListener("error", onError as EventListener);

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return; // not from our app
    handleInbound(state, e);
  };
  window.addEventListener("message", onMessage);

  return {
    dispose() {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError as EventListener);
      window.removeEventListener("message", onMessage);
      sessionSpan.addEvent("session.dispose");
      sessionSpan.setStatus({ code: SpanStatusCode.OK });
      sessionSpan.end();
    },
    postToApp(message: JsonRpcMessage) {
      const tracer = getTracer();
      const sendSpan = tracer.startSpan("mcp.app.send", {
        kind: SpanKind.PRODUCER,
        attributes: {
          "ui.method": "method" in message ? message.method : "(response)",
          "ui.id": "id" in message ? String(message.id) : "(notification)",
          "ui.bytes": JSON.stringify(message).length,
        },
      });
      try {
        iframe.contentWindow?.postMessage(message, state.expectedOrigin === ALLOWED_ORIGINS_FALLBACK ? "*" : state.expectedOrigin);
        sendSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        sendSpan.recordException(err as Error);
        sendSpan.setStatus({ code: SpanStatusCode.ERROR });
      } finally {
        sendSpan.end();
      }
    },
  };
}

function handleInbound(state: HostState, e: MessageEvent): void {
  const tracer = getTracer();
  const recvSpan = tracer.startSpan("mcp.app.recv", {
    kind: SpanKind.CONSUMER,
    attributes: {
      "ui.message.bytes": typeof e.data === "string" ? e.data.length : JSON.stringify(e.data).length,
      "ui.message.origin": e.origin,
    },
  });

  // Origin check — sandboxed iframe with no allow-same-origin will have origin=null.
  if (state.expectedOrigin !== ALLOWED_ORIGINS_FALLBACK && e.origin !== state.expectedOrigin) {
    state.sessionSpan.addEvent("origin_mismatch", {
      "expected.origin": state.expectedOrigin,
      "actual.origin": e.origin,
    });
    recvSpan.setStatus({ code: SpanStatusCode.ERROR, message: "origin_mismatch" });
    recvSpan.end();
    return;
  }

  const msg = e.data as JsonRpcMessage | undefined;
  if (!msg || msg.jsonrpc !== "2.0") {
    recvSpan.setAttribute("ui.parse_error", true);
    recvSpan.setStatus({ code: SpanStatusCode.ERROR, message: "not jsonrpc" });
    recvSpan.end();
    return;
  }

  if ("method" in msg) {
    recvSpan.setAttribute("ui.method", msg.method);
    if ("id" in msg) recvSpan.setAttribute("ui.id", String(msg.id));
  }

  // Dispatch by method
  if ("method" in msg) {
    if (msg.method === "ui/initialize") {
      handleInitialize(state, msg as JsonRpcRequest<UiInitializeParams>, recvSpan);
    } else if (msg.method === "tools/call") {
      handleToolsCall(state, msg as JsonRpcRequest<ToolsCallParams>, recvSpan);
    } else if (msg.method === "ui/setContext") {
      const params = (msg as JsonRpcNotification<{ context: Record<string, unknown> }>).params;
      try { state.hooks.onSetContext?.(params?.context ?? {}); } catch { /* hook errors don't kill recv */ }
      recvSpan.setStatus({ code: SpanStatusCode.OK });
      recvSpan.end();
    } else if (msg.method === "ui/sendOpenLink") {
      const params = (msg as JsonRpcRequest<{ url: string }>).params;
      try { state.hooks.onOpenLink?.(params?.url ?? ""); } catch { /* */ }
      recvSpan.setStatus({ code: SpanStatusCode.OK });
      recvSpan.end();
    } else {
      // Unknown method — record but don't reject; future ui/* methods.
      state.sessionSpan.addEvent("unknown_method", { "ui.method": msg.method });
      recvSpan.setAttribute("ui.unknown_method", true);
      recvSpan.setStatus({ code: SpanStatusCode.OK });
      recvSpan.end();
    }
  } else {
    // Response — app responding to a host-initiated request. Logged.
    recvSpan.setStatus({ code: SpanStatusCode.OK });
    recvSpan.end();
  }
}

function handleInitialize(state: HostState, req: JsonRpcRequest<UiInitializeParams>, span: Span): void {
  state.initialized = true;
  span.setAttribute("ui.protocol_version", req.params?.protocolVersion ?? "");
  span.setAttribute("ui.client_name", req.params?.clientInfo?.name ?? "");
  state.sessionSpan.setAttribute("mcp.app.protocol_version", req.params?.protocolVersion ?? "");
  state.sessionSpan.setAttribute("mcp.app.app_name", req.params?.clientInfo?.name ?? "");

  const result: UiInitializeResult = {
    protocolVersion: req.params?.protocolVersion ?? "2026-01-26",
    capabilities: {
      tools: { call: true },
      setContext: !!state.hooks.onSetContext,
      sendOpenLink: !!state.hooks.onOpenLink,
    },
    serverInfo: { name: "doable-host", version: "0.1.0" },
  };
  state.iframe.contentWindow?.postMessage(
    { jsonrpc: "2.0", id: req.id, result } satisfies JsonRpcResponse<UiInitializeResult>,
    state.expectedOrigin === ALLOWED_ORIGINS_FALLBACK ? "*" : state.expectedOrigin,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function handleToolsCall(state: HostState, req: JsonRpcRequest<ToolsCallParams>, recvSpan: Span): void {
  const tracer = getTracer();
  const relaySpan = tracer.startSpan("mcp.app.relay.tools_call", {
    kind: SpanKind.CLIENT,
    attributes: {
      "mcp.tool.name": req.params?.name ?? "",
      "mcp.args.size": JSON.stringify(req.params?.arguments ?? {}).length,
    },
  });
  recvSpan.end();

  state.hooks
    .forwardToolsCall(req.params ?? { name: "" })
    .then((result) => {
      relaySpan.setStatus({ code: SpanStatusCode.OK });
      relaySpan.end();
      state.iframe.contentWindow?.postMessage(
        { jsonrpc: "2.0", id: req.id, result } satisfies JsonRpcResponse,
        state.expectedOrigin === ALLOWED_ORIGINS_FALLBACK ? "*" : state.expectedOrigin,
      );
    })
    .catch((err: Error) => {
      relaySpan.recordException(err);
      relaySpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message.slice(0, 200) });
      relaySpan.end();
      state.iframe.contentWindow?.postMessage(
        {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32000, message: err.message },
        } satisfies JsonRpcResponse,
        state.expectedOrigin === ALLOWED_ORIGINS_FALLBACK ? "*" : state.expectedOrigin,
      );
    });
}
