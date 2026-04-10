import { defineTool, type Tool } from "@github/copilot-sdk";
import type { ResolvedMcpTool, McpContent } from "./types.js";
import type { ConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";

/**
 * Convert MCP tools to Copilot SDK Tool[] definitions.
 * Each MCP tool becomes a defineTool() with handler that calls the MCP server.
 *
 * Naming convention: mcp_{connectorName}_{toolName}
 * This ensures uniqueness across connectors and distinguishes from built-in tools.
 */
export function createMcpTools(
  resolvedTools: ResolvedMcpTool[],
  connectorManager: ConnectorManager,
  connectorConfigs: Map<string, McpConnectorConfig>,
): Tool[] {
  return resolvedTools.map((resolved) => {
    const { connectorId, connectorName, tool } = resolved;

    // Sanitize names for Copilot SDK (alphanumeric + underscores)
    const safeName = connectorName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const safeToolName = tool.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const fullName = `mcp_${safeName}_${safeToolName}`;

    return defineTool(fullName, {
      description: tool.description
        ? `[MCP: ${connectorName}] ${tool.description}`
        : `MCP tool from ${connectorName}: ${tool.name}`,
      parameters: tool.inputSchema,
      handler: async (args: Record<string, unknown>) => {
        const config = connectorConfigs.get(connectorId);
        if (!config) {
          return { success: false, error: `Connector ${connectorName} not found` };
        }

        const mcpStartMs = Date.now();
        try {
          const client = await connectorManager.getClient(config);
          const result = await client.callTool(tool.name, args);
          const mcpDurationMs = Date.now() - mcpStartMs;

          const mcpTrace = {
            connector: connectorName,
            mcpTool: tool.name,
            request: { method: "tools/call", params: { name: tool.name, arguments: args } },
            response: { isError: !!result.isError, contentLength: result.content?.length ?? 0 },
            durationMs: mcpDurationMs,
          };

          if (result.isError) {
            const errorText = formatMcpContent(result.content);
            return {
              success: false,
              error: errorText,
              _mcpTrace: {
                ...mcpTrace,
                response: {
                  ...mcpTrace.response,
                  error: errorText,
                  rawContent: result.content,
                },
              },
            };
          }

          return {
            success: true,
            result: formatMcpContent(result.content),
            _mcpTrace: mcpTrace,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : undefined;
          // Try to parse structured MCP error details from the message
          let mcpErrorCode: number | undefined;
          let mcpErrorData: unknown;
          if (err && typeof err === "object" && "code" in err) {
            mcpErrorCode = (err as { code?: number }).code;
          }
          if (err && typeof err === "object" && "data" in err) {
            mcpErrorData = (err as { data?: unknown }).data;
          }
          return {
            success: false,
            error: `MCP tool call failed: ${errMsg}`,
            _mcpTrace: {
              connector: connectorName,
              mcpTool: tool.name,
              request: { method: "tools/call", params: { name: tool.name, arguments: args } },
              response: {
                isError: true,
                error: errMsg,
                errorStack: errStack,
                errorCode: mcpErrorCode,
                errorData: mcpErrorData,
              },
              durationMs: Date.now() - mcpStartMs,
            },
          };
        }
      },
    });
  }) as Tool[];
}

/** Format MCP content array into a string result */
function formatMcpContent(content: McpContent[]): string {
  return content
    .map((c) => {
      switch (c.type) {
        case "text":
          return c.text;
        case "image":
          return `[Image: ${c.mimeType}]`;
        case "resource":
          return c.resource.text ?? `[Resource: ${c.resource.uri}]`;
        default:
          return "[Unknown content]";
      }
    })
    .join("\n");
}
