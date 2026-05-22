import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerCapabilities,
  McpToolDefinition,
  McpToolCallResult,
} from "./types.js";
import type { McpTransport } from "./transport.js";

/**
 * MCP Client — communicates with an MCP server via a transport.
 * Handles the JSON-RPC 2.0 protocol including initialization handshake.
 */
export class McpClient {
  private requestId = 1;
  private capabilities: McpServerCapabilities | null = null;
  private initialized = false;

  constructor(private transport: McpTransport) {}

  /** Initialize the MCP connection with protocol handshake */
  async initialize(): Promise<McpServerCapabilities> {
    await this.transport.connect();

    const response = await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "doable", version: "1.0.0" },
    });

    this.capabilities = (response.result as { capabilities: McpServerCapabilities })?.capabilities ?? {};

    // Send initialized notification
    await this.transport.sendNotification({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    this.initialized = true;
    return this.capabilities;
  }

  /** List available tools from the MCP server */
  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) throw new Error("Client not initialized");

    const response = await this.request("tools/list", {});
    const result = response.result as { tools: McpToolDefinition[] } | undefined;
    return result?.tools ?? [];
  }

  /** Call a tool on the MCP server */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    if (!this.initialized) throw new Error("Client not initialized");

    const response = await this.request("tools/call", { name, arguments: args });

    if (response.error) {
      const errorDetail = response.error.data
        ? ` (data: ${JSON.stringify(response.error.data)})`
        : "";
      return {
        content: [{ type: "text", text: `Error [${response.error.code ?? "unknown"}]: ${response.error.message}${errorDetail}` }],
        isError: true,
      };
    }

    return response.result as McpToolCallResult;
  }

  /** Disconnect the client */
  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    this.initialized = false;
  }

  /** Check if client is connected and initialized */
  isReady(): boolean {
    return this.initialized && this.transport.isConnected();
  }

  /** Get cached server capabilities */
  getCapabilities(): McpServerCapabilities | null {
    return this.capabilities;
  }

  private async request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params,
    };

    return this.transport.sendRequest(request);
  }
}
