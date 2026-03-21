// ─── MCP Connector Types (shared between API + frontend) ────

export type McpTransportType = "streamable_http" | "http_sse" | "stdio";
export type McpConnectorScope = "workspace" | "project" | "user";
export type McpAuthType = "none" | "api_key" | "oauth2" | "bearer_token";
export type McpConnectorStatus = "active" | "inactive" | "error" | "connecting";

export interface McpConnector {
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
  lastConnectedAt?: string;
  errorMessage?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpTestResult {
  success: boolean;
  toolCount: number;
  tools?: McpToolInfo[];
  error?: string;
}
