/**
 * HTTP-based MCP transports: Streamable HTTP and Legacy SSE.
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./types.js";

/** Default timeout for HTTP-based MCP requests (ms) */
export const MCP_HTTP_TIMEOUT_MS = 60_000;

/** Wrap fetch with an AbortController timeout */
export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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
    // Mark as connected — the actual initialize handshake is done by McpClient.initialize()
    // which sends the initialize request via sendRequest() and extracts the session ID.
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
      "Accept": "application/json, text/event-stream",
      ...this.headers,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const reqBody = JSON.stringify(request);
    console.log(`[MCP:HTTP] ── REQUEST ──\n  POST ${this.serverUrl}\n  Headers: ${JSON.stringify(headers)}\n  Body: ${reqBody.slice(0, 2000)}${reqBody.length > 2000 ? `... [${reqBody.length}c]` : ""}`);
    const startMs = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(this.serverUrl, {
        method: "POST",
        headers,
        body: reqBody,
      }, MCP_HTTP_TIMEOUT_MS);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const durationMs = Date.now() - startMs;
        console.error(`[MCP:HTTP] ── TIMEOUT (${durationMs}ms) ── request aborted after ${MCP_HTTP_TIMEOUT_MS}ms`);
        return { jsonrpc: "2.0", id: request.id, error: { code: -32000, message: `MCP request timed out after ${MCP_HTTP_TIMEOUT_MS / 1000}s` } };
      }
      throw err;
    }

    const durationMs = Date.now() - startMs;

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[MCP:HTTP] ── RESPONSE ${response.status} (${durationMs}ms) ──\n  Error: ${errBody.slice(0, 2000)}`);
      throw new Error(`MCP request failed: ${response.status} — ${errBody.slice(0, 500)}`);
    }

    // Capture session ID from response header (set on first request, e.g. initialize)
    const respSessionId = response.headers.get("mcp-session-id");
    if (respSessionId) {
      this.sessionId = respSessionId;
    }

    const contentType = response.headers.get("content-type") ?? "";

    // Handle SSE response (streaming)
    if (contentType.includes("text/event-stream")) {
      console.log(`[MCP:HTTP] ── RESPONSE SSE (${durationMs}ms) ── streaming...`);
      return this.parseSSEResponse(response, request.id);
    }

    // Handle direct JSON response
    const jsonResp = (await response.json()) as JsonRpcResponse;
    const respStr = JSON.stringify(jsonResp);
    console.log(`[MCP:HTTP] ── RESPONSE ${response.status} (${durationMs}ms) ──\n  Body: ${respStr.slice(0, 2000)}${respStr.length > 2000 ? `... [${respStr.length}c]` : ""}`);
    return jsonResp;
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

    await fetchWithTimeout(this.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(notification),
    }, MCP_HTTP_TIMEOUT_MS);
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
    const response = await fetchWithTimeout(this.sseUrl, {
      headers: { ...this.headers, Accept: "text/event-stream" },
    }, MCP_HTTP_TIMEOUT_MS);

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

    const reqBody = JSON.stringify(request);
    console.log(`[MCP:SSE] ── REQUEST ──\n  POST ${this.messageEndpoint}\n  Body: ${reqBody.slice(0, 2000)}${reqBody.length > 2000 ? `... [${reqBody.length}c]` : ""}`);
    const startMs = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(this.messageEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers },
        body: reqBody,
      }, MCP_HTTP_TIMEOUT_MS);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const durationMs = Date.now() - startMs;
        console.error(`[MCP:SSE] ── TIMEOUT (${durationMs}ms) ── request aborted after ${MCP_HTTP_TIMEOUT_MS}ms`);
        return { jsonrpc: "2.0", id: request.id, error: { code: -32000, message: `MCP request timed out after ${MCP_HTTP_TIMEOUT_MS / 1000}s` } };
      }
      throw err;
    }

    const durationMs = Date.now() - startMs;

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[MCP:SSE] ── RESPONSE ${response.status} (${durationMs}ms) ──\n  Error: ${errBody.slice(0, 2000)}`);
      throw new Error(`Legacy SSE request failed: ${response.status} — ${errBody.slice(0, 500)}`);
    }

    const jsonResp = (await response.json()) as JsonRpcResponse;
    const respStr = JSON.stringify(jsonResp);
    console.log(`[MCP:SSE] ── RESPONSE ${response.status} (${durationMs}ms) ──\n  Body: ${respStr.slice(0, 2000)}${respStr.length > 2000 ? `... [${respStr.length}c]` : ""}`);
    if (jsonResp.error) {
      console.error(`[MCP:SSE] ── ERROR ── code=${jsonResp.error.code} message=${jsonResp.error.message} data=${JSON.stringify(jsonResp.error.data ?? null).slice(0, 500)}`);
    }
    return jsonResp;
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    if (!this.connected || !this.messageEndpoint) return;

    await fetchWithTimeout(this.messageEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(notification),
    }, MCP_HTTP_TIMEOUT_MS);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
