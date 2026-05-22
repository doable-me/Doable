// MCP Apps protocol message types — host ↔ sandboxed iframe.
// Spec: https://modelcontextprotocol.io/extensions/apps/overview
// JSON-RPC dialect over postMessage. Some methods are shared with core MCP
// (e.g. tools/call), most have a `ui/` prefix.

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: P;
}

export interface JsonRpcResponse<R = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: R;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ─── Method-specific param/result types ────────────────────────────────

export interface UiInitializeParams {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  clientInfo?: { name: string; version: string };
}

export interface UiInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { call?: boolean };
    setContext?: boolean;
    sendOpenLink?: boolean;
    [k: string]: unknown;
  };
  serverInfo?: { name: string; version: string };
}

export interface UiSetContextParams {
  context: Record<string, unknown>;
}

export interface ToolsCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// ─── App manifest (from the host's perspective) ───────────────────────

export interface McpAppManifest {
  /** ui:// URI of the resource this app was loaded from */
  resourceUri: string;
  /** MCP connector that served the resource */
  connectorId: string;
  /** Tool that returned the UI resource (so we can correlate iframe ↔ tool call) */
  originatingToolName?: string;
  /** Permissions the app requested (camera, mic, etc.) — host enforces */
  permissions?: string[];
  /** Origins the app's CSP allows resources from */
  csp?: string[];
}
