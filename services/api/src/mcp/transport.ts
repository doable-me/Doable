import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./types.js";

/** Abstract transport interface for MCP communication */
export interface McpTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  sendNotification(notification: JsonRpcNotification): Promise<void>;
  isConnected(): boolean;
}

/** Streamable HTTP transport — current MCP standard */
export class StreamableHttpTransport implements McpTransport {
  private connected = false;
  private sessionId: string | null = null;

  constructor(
    private serverUrl: string,
    private headers: Record<string, string> = {},
  ) {}

  async connect(): Promise<void> {
    // Validate server is reachable
    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "doable", version: "1.0.0" },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
    }

    // Extract session ID from response header if present
    this.sessionId = response.headers.get("mcp-session-id");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.sessionId = null;
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.connected) throw new Error("Transport not connected");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.headers,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    // Handle SSE response (streaming)
    if (contentType.includes("text/event-stream")) {
      return this.parseSSEResponse(response, request.id);
    }

    // Handle direct JSON response
    return (await response.json()) as JsonRpcResponse;
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected) throw new Error("Transport not connected");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.headers,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    await fetch(this.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(notification),
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async parseSSEResponse(response: Response, requestId: number | string): Promise<JsonRpcResponse> {
    const text = await response.text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as JsonRpcResponse;
          if (parsed.id === requestId) return parsed;
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    throw new Error("No matching response found in SSE stream");
  }
}

/** Legacy SSE transport for older MCP servers */
export class LegacySseTransport implements McpTransport {
  private connected = false;
  private messageEndpoint: string | null = null;

  constructor(
    private sseUrl: string,
    private headers: Record<string, string> = {},
  ) {}

  async connect(): Promise<void> {
    // For legacy SSE, we do a GET to the SSE endpoint to discover the message endpoint
    const response = await fetch(this.sseUrl, {
      headers: { ...this.headers, Accept: "text/event-stream" },
    });

    if (!response.ok) {
      throw new Error(`SSE endpoint returned ${response.status}`);
    }

    const text = await response.text();
    const endpointLine = text.split("\n").find((l) => l.startsWith("data: ") && l.includes("endpoint"));
    if (endpointLine) {
      try {
        const data = JSON.parse(endpointLine.slice(6));
        this.messageEndpoint = data.endpoint ?? this.sseUrl;
      } catch {
        this.messageEndpoint = this.sseUrl;
      }
    } else {
      this.messageEndpoint = this.sseUrl;
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.messageEndpoint = null;
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.connected || !this.messageEndpoint) throw new Error("Transport not connected");

    const response = await fetch(this.messageEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Legacy SSE request failed: ${response.status}`);
    }

    return (await response.json()) as JsonRpcResponse;
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected || !this.messageEndpoint) return;

    await fetch(this.messageEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(notification),
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Stdio transport for local subprocess MCP servers */
export class StdioTransport implements McpTransport {
  private connected = false;
  private process: import("node:child_process").ChildProcess | null = null;
  private pendingRequests = new Map<number | string, {
    resolve: (r: JsonRpcResponse) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private buffer = "";

  constructor(
    private command: string,
    private args: string[] = [],
    private env?: Record<string, string>,
  ) {}

  async connect(): Promise<void> {
    const { spawn } = await import("node:child_process");

    this.process = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
      shell: process.platform === "win32",
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr!.on("data", (data: Buffer) => {
      console.error(`[MCP:stdio:${this.command}]`, data.toString());
    });

    this.process.on("exit", (code) => {
      this.connected = false;
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP process exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.connected = false;
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Transport disconnected"));
    }
    this.pendingRequests.clear();
  }

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.connected || !this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`MCP request timed out after 30s: ${request.method}`));
      }, 30_000);

      this.pendingRequests.set(request.id, { resolve, reject, timer });

      const message = JSON.stringify(request) + "\n";
      this.process!.stdin!.write(message);
    });
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected || !this.process?.stdin) return;
    const message = JSON.stringify(notification) + "\n";
    this.process.stdin.write(message);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        // Non-JSON output, ignore
      }
    }
  }
}

/** Create the appropriate transport for a connector config */
export function createTransport(
  transportType: string,
  opts: {
    serverUrl?: string;
    serverCommand?: string;
    serverArgs?: string[];
    serverEnv?: Record<string, string>;
    headers?: Record<string, string>;
  },
): McpTransport {
  switch (transportType) {
    case "streamable_http":
      if (!opts.serverUrl) throw new Error("serverUrl required for streamable_http transport");
      return new StreamableHttpTransport(opts.serverUrl, opts.headers);

    case "http_sse":
      if (!opts.serverUrl) throw new Error("serverUrl required for http_sse transport");
      return new LegacySseTransport(opts.serverUrl, opts.headers);

    case "stdio":
      if (!opts.serverCommand) throw new Error("serverCommand required for stdio transport");
      return new StdioTransport(opts.serverCommand, opts.serverArgs, opts.serverEnv);

    default:
      throw new Error(`Unknown transport type: ${transportType}`);
  }
}
