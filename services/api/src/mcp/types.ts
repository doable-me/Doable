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

// ─── MCP Interactive UI Contract ─────────────────────────────────────────────

/** Supported widget types that Doable can render */
export type McpUiType = "table" | "form" | "confirm" | "select";

/** A column definition for the table widget */
export interface McpUiColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "boolean" | "date" | "badge";
}

/** An action button that can appear in a widget */
export interface McpUiAction {
  id: string;
  label: string;
  variant?: "default" | "destructive" | "outline";
  /** If true, action applies to selected rows (table widget) */
  requiresSelection?: boolean;
}

/** A field definition for the form widget */
export interface McpUiFormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: unknown;
}

/** Schema for a select widget */
export interface McpUiSelectOption {
  value: string;
  label: string;
  description?: string;
}

/** The structured UI payload an MCP tool can return inside its result */
export interface McpUiPayload {
  uiType: McpUiType;
  /** Unique identifier matching the originating tool call */
  toolCallId: string;
  /** Connector that owns this widget */
  connectorId: string;
  /** Human-readable widget title */
  title: string;
  /** Schema describes the structure of the widget */
  schema: {
    columns?: McpUiColumn[];
    fields?: McpUiFormField[];
    options?: McpUiSelectOption[];
    actions?: McpUiAction[];
    /** Confirm-specific prompt message */
    message?: string;
  };
  /** Initial data / state of the widget */
  state: Record<string, unknown>;
}

/**
 * Envelope returned by the MCP tool handler when a UI payload is present.
 * The text `result` is still included so the AI can narrate it.
 * The `__ui` field is intercepted by tool-callbacks and emitted as an SSE event.
 */
export interface McpToolEnvelope {
  success: boolean;
  result?: string;
  error?: string;
  __ui?: McpUiPayload;
  _mcpTrace?: unknown;
}
