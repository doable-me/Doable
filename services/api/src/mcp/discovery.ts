/**
 * MCP Server Discovery — probes a URL for .well-known/mcp.json server card
 * and auto-detects capabilities, transport, and auth requirements.
 *
 * Implements:
 * - .well-known/mcp.json / .well-known/mcp/server-card.json (Server Card spec)
 * - Fallback to direct MCP endpoint probing via initialize handshake
 * - tools/list for immediate tool discovery
 */

import { fetchWithTimeout, MCP_HTTP_TIMEOUT_MS } from "./transport-http.js";
import type { McpToolDefinition, McpServerCapabilities } from "./types.js";

/** Discovery timeout — shorter than normal requests since this is pre-connection */
const DISCOVERY_TIMEOUT_MS = 15_000;

/** Server Card as defined by the MCP discovery spec */
export interface McpServerCard {
  $schema?: string;
  version?: string;
  protocolVersion?: string;
  serverInfo?: {
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
  };
  transport?: {
    type?: string;
    url?: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  auth?: {
    type?: string;
    // Additional auth fields vary by type
    [key: string]: unknown;
  };
}

/** Result of a discovery probe */
export interface DiscoveryResult {
  /** Whether discovery was successful */
  success: boolean;
  /** How the server was discovered */
  method: "server-card" | "mcp-probe" | "none";
  /** Server card data (if found) */
  serverCard?: McpServerCard;
  /** Auto-detected name */
  name?: string;
  /** Auto-detected description */
  description?: string;
  /** Detected transport type */
  transportType?: "streamable_http" | "http_sse";
  /** Resolved MCP endpoint URL */
  mcpEndpointUrl?: string;
  /** Detected auth type */
  authType?: "none" | "api_key" | "oauth2" | "bearer_token";
  /** Server capabilities from initialize handshake */
  capabilities?: McpServerCapabilities;
  /** Discovered tools (from tools/list) */
  tools?: McpToolDefinition[];
  /** Number of tools discovered */
  toolCount?: number;
  /** Error details if discovery failed */
  error?: string;
}

/**
 * Probe a URL for MCP server discovery.
 *
 * 1. Try .well-known/mcp.json paths on the base URL
 * 2. Try direct MCP initialize handshake on the URL
 * 3. If connected, fetch tools/list
 */
export async function discoverMcpServer(inputUrl: string): Promise<DiscoveryResult> {
  // Sanitize the input URL
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    return { success: false, method: "none", error: "Invalid URL" };
  }

  // Phase 1: Try server card discovery
  const serverCard = await probeServerCard(url);
  if (serverCard) {
    const result = parseServerCard(serverCard, url);

    // If server card gives us an MCP endpoint, try to connect and list tools
    if (result.mcpEndpointUrl) {
      const probeResult = await probeMcpEndpoint(result.mcpEndpointUrl);
      if (probeResult.success) {
        result.capabilities = probeResult.capabilities;
        result.tools = probeResult.tools;
        result.toolCount = probeResult.tools?.length ?? 0;
      }
    }

    return result;
  }

  // Phase 2: Try direct MCP probe on the input URL
  const directProbe = await probeMcpEndpoint(inputUrl);
  if (directProbe.success) {
    return {
      success: true,
      method: "mcp-probe",
      mcpEndpointUrl: inputUrl,
      transportType: "streamable_http",
      authType: "none",
      capabilities: directProbe.capabilities,
      tools: directProbe.tools,
      toolCount: directProbe.tools?.length ?? 0,
      name: extractNameFromUrl(url),
    };
  }

  return {
    success: false,
    method: "none",
    error: directProbe.error ?? "Could not discover MCP server at this URL. Make sure the server is running and accessible.",
  };
}

/**
 * Try known server card paths:
 * - /.well-known/mcp.json
 * - /.well-known/mcp/server-card.json
 */
async function probeServerCard(baseUrl: URL): Promise<McpServerCard | null> {
  const origin = baseUrl.origin;
  const paths = [
    "/.well-known/mcp.json",
    "/.well-known/mcp/server-card.json",
  ];

  for (const path of paths) {
    try {
      const response = await fetchWithTimeout(`${origin}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      }, DISCOVERY_TIMEOUT_MS);

      if (response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("json")) {
          const card = (await response.json()) as McpServerCard;
          // Basic sanity check — must have at least serverInfo or transport
          if (card.serverInfo || card.transport || card.capabilities) {
            console.log(`[MCP:Discovery] Found server card at ${origin}${path}`);
            return card;
          }
        }
      }
    } catch {
      // Ignore — try next path
    }
  }

  return null;
}

/** Parse a server card into a DiscoveryResult */
function parseServerCard(card: McpServerCard, baseUrl: URL): DiscoveryResult {
  // Detect transport type from card
  let transportType: "streamable_http" | "http_sse" = "streamable_http";
  if (card.transport?.type === "sse" || card.transport?.type === "http_sse") {
    transportType = "http_sse";
  }

  // Resolve MCP endpoint URL
  let mcpEndpointUrl = card.transport?.url;
  if (mcpEndpointUrl && !mcpEndpointUrl.startsWith("http")) {
    // Relative URL — resolve against base
    mcpEndpointUrl = new URL(mcpEndpointUrl, baseUrl.origin).toString();
  }
  // Fallback to input URL if no transport URL in card
  if (!mcpEndpointUrl) {
    mcpEndpointUrl = baseUrl.toString();
  }

  // Detect auth type
  let authType: "none" | "api_key" | "oauth2" | "bearer_token" = "none";
  if (card.auth?.type) {
    const at = card.auth.type.toLowerCase();
    if (at.includes("oauth")) authType = "oauth2";
    else if (at.includes("api_key") || at.includes("apikey") || at.includes("api-key")) authType = "api_key";
    else if (at.includes("bearer")) authType = "bearer_token";
  }

  return {
    success: true,
    method: "server-card",
    serverCard: card,
    name: card.serverInfo?.name ?? extractNameFromUrl(baseUrl),
    description: card.serverInfo?.description,
    transportType,
    mcpEndpointUrl,
    authType,
  };
}

/**
 * Probe an MCP endpoint directly by sending an initialize handshake.
 * If successful, also fetches tools/list.
 */
async function probeMcpEndpoint(
  endpointUrl: string,
): Promise<{ success: boolean; capabilities?: McpServerCapabilities; tools?: McpToolDefinition[]; error?: string }> {
  try {
    // Send initialize request
    const initResponse = await fetchWithTimeout(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "doable-discovery", version: "1.0.0" },
        },
      }),
    }, DISCOVERY_TIMEOUT_MS);

    if (!initResponse.ok) {
      return { success: false, error: `Server returned ${initResponse.status}` };
    }

    const contentType = initResponse.headers.get("content-type") ?? "";
    let initResult: any;

    if (contentType.includes("text/event-stream")) {
      // Parse SSE response
      const text = await initResponse.text();
      const dataLine = text.split("\n").find((l) => l.startsWith("data: ") && !l.includes("[DONE]"));
      if (dataLine) {
        initResult = JSON.parse(dataLine.slice(6));
      }
    } else {
      initResult = await initResponse.json();
    }

    if (!initResult || initResult.error) {
      return { success: false, error: initResult?.error?.message ?? "Initialize failed" };
    }

    const capabilities = (initResult.result as { capabilities?: McpServerCapabilities })?.capabilities;
    const sessionId = initResponse.headers.get("mcp-session-id");

    // Send initialized notification
    const notifHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
    if (sessionId) notifHeaders["mcp-session-id"] = sessionId;

    await fetchWithTimeout(endpointUrl, {
      method: "POST",
      headers: notifHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }, DISCOVERY_TIMEOUT_MS).catch(() => {
      // Non-fatal — some servers don't require this
    });

    // Fetch tools list
    let tools: McpToolDefinition[] = [];
    if (capabilities?.tools !== undefined || capabilities === undefined) {
      try {
        const toolsHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
        if (sessionId) toolsHeaders["mcp-session-id"] = sessionId;

        const toolsResponse = await fetchWithTimeout(endpointUrl, {
          method: "POST",
          headers: toolsHeaders,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {},
          }),
        }, DISCOVERY_TIMEOUT_MS);

        if (toolsResponse.ok) {
          const toolsCt = toolsResponse.headers.get("content-type") ?? "";
          let toolsResult: any;

          if (toolsCt.includes("text/event-stream")) {
            const text = await toolsResponse.text();
            const dataLine = text.split("\n").find((l) => l.startsWith("data: ") && !l.includes("[DONE]"));
            if (dataLine) toolsResult = JSON.parse(dataLine.slice(6));
          } else {
            toolsResult = await toolsResponse.json();
          }

          if (toolsResult?.result?.tools) {
            tools = toolsResult.result.tools;
          }
        }
      } catch {
        // Tools list failed — non-fatal, we still know it's an MCP server
      }
    }

    return { success: true, capabilities, tools };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/** Extract a readable name from a URL */
function extractNameFromUrl(url: URL): string {
  const host = url.hostname.replace(/^(www|mcp|api)\./, "");
  // Remove TLD for short names
  const parts = host.split(".");
  if (parts.length > 1) {
    return parts.slice(0, -1).join(".").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return host;
}
