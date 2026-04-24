/** MCP transport types */
export type McpTransportType = "streamable_http" | "http_sse" | "stdio";
export type McpConnectorScope = "workspace" | "project" | "user";
export type McpAuthType = "none" | "api_key" | "oauth2" | "bearer_token";
export type McpConnectorStatus = "active" | "inactive" | "error" | "connecting";

/** JSON-RPC 2.0 message types */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** MCP protocol types */
export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface McpToolCallResult {
  content: McpContent[];
  isError?: boolean;
}

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; blob?: string; mimeType?: string } };

/** Connector configuration stored in DB */
export interface McpConnectorConfig {
  id: string;
  workspaceId: string;
  projectId?: string;
  scope: McpConnectorScope;
  name: string;
  description?: string;
  transportType: McpTransportType;
  serverUrl?: string;
  serverCommand?: string;
  serverArgs?: string[];
  authType: McpAuthType;
  status: McpConnectorStatus;
  capabilitiesCache?: McpServerCapabilities;
  lastConnectedAt?: Date;
  errorMessage?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Phase 2B: inline stdio env override for VIRTUAL connectors that have no
   * DB row. When set, the connector-manager skips the `connectors.getDecrypted`
   * round-trip and passes this map straight to the stdio transport. Only used
   * by preset-synthesized connectors (e.g., the Supabase MCP preset) — never
   * persisted and never exposed to clients.
   */
  inlineServerEnv?: Record<string, string>;
}

/** Resolved MCP tool with connector info */
export interface ResolvedMcpTool {
  connectorId: string;
  connectorName: string;
  tool: McpToolDefinition;
}

// ─── MCP Tool Result Envelope ────────────────────────────────────────────────

/**
 * Envelope returned by the MCP tool handler. The host streams `result` to the
 * model and emits any `ui://` resources from the underlying MCP content array
 * as `mcp_ui_resource` SSE events (see tool-bridge.ts → tool-callbacks.ts).
 */
export interface McpToolEnvelope {
  success: boolean;
  result?: string;
  error?: string;
  _mcpTrace?: unknown;
}
