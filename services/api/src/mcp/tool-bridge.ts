import { defineTool, type Tool } from "@github/copilot-sdk";
import type { ResolvedMcpTool, McpContent } from "./types.js";
import type { ConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";
import { getActiveTrace } from "../ai/trace-collector.js";
import { xray } from "../integrations/xray.js";
import { fetchCtx, createTracedFetch, type HttpTraceEntry } from "../integrations/runner.js";

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
  projectId?: string,
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

        // Start X-Ray tracking for this MCP call
        const xr = xray.start({
          kind: "mcp",
          integrationId: `mcp:${connectorName}`,
          actionName: tool.name,
          projectId,
          args,
        });

        const trace = projectId ? getActiveTrace(projectId) : null;
        console.log(`[MCP:${connectorName}] CALL ${tool.name} args=${JSON.stringify(args).slice(0, 2000)}`);
        trace?.pushRaw("mcp_call", {
          connector: connectorName,
          tool: tool.name,
          args,
        });

        try {
          // Run MCP calls inside fetchCtx so transport HTTP calls are captured by xray
          const mcpHttpTraces: HttpTraceEntry[] = [];
          const tracedFetch = createTracedFetch(mcpHttpTraces, projectId ?? undefined, xr);

          const { client, result } = await fetchCtx.run(
            { tracedFetch, xrayHandle: xr, supabaseApiKey: null },
            async () => {
              xr.phase("get_client");
              const client = await connectorManager.getClient(config);

              xr.phase("call_tool");
              const result = await client.callTool(tool.name, args);
              return { client, result };
            },
          );
          const mcpDurationMs = xr.call.durationMs ?? (Date.now() - xr.call.startedAt);
          const resultStr = JSON.stringify(result.content);
          console.log(`[MCP:${connectorName}] RESULT ${tool.name} ${mcpDurationMs}ms isError=${!!result.isError} contentItems=${result.content?.length ?? 0} content=${resultStr.slice(0, 2000)}${resultStr.length > 2000 ? `... [${resultStr.length}c total]` : ""}`);

          const mcpTrace = {
            connector: connectorName,
            mcpTool: tool.name,
            request: { method: "tools/call", params: { name: tool.name, arguments: args } },
            response: { isError: !!result.isError, contentLength: result.content?.length ?? 0 },
            durationMs: mcpDurationMs,
          };

          // Push full result to live trace (DB + WS)
          trace?.pushRaw("mcp_result", {
            ...mcpTrace,
            response: {
              ...mcpTrace.response,
              content: result.content,
            },
          });

          if (result.isError) {
            const errorText = formatMcpContent(result.content);
            trace?.pushRaw("mcp_error", {
              connector: connectorName,
              tool: tool.name,
              durationMs: mcpDurationMs,
              error: errorText,
              rawContent: result.content,
            });
            xr.end("error", errorText);
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

          xr.end("success");
          return {
            success: true,
            result: formatMcpContent(result.content),
            _mcpTrace: mcpTrace,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : undefined;
          const mcpDurationMs = Date.now() - xr.call.startedAt;
          console.error(`[MCP:${connectorName}] ERROR ${tool.name} ${mcpDurationMs}ms: ${errMsg}`);
          // Try to parse structured MCP error details from the message
          let mcpErrorCode: number | undefined;
          let mcpErrorData: unknown;
          if (err && typeof err === "object" && "code" in err) {
            mcpErrorCode = (err as { code?: number }).code;
          }
          if (err && typeof err === "object" && "data" in err) {
            mcpErrorData = (err as { data?: unknown }).data;
          }

          trace?.pushRaw("mcp_error", {
            connector: connectorName,
            tool: tool.name,
            durationMs: mcpDurationMs,
            error: errMsg,
            errorStack: errStack,
            errorCode: mcpErrorCode,
            errorData: mcpErrorData,
          });

          xr.end("error", errMsg);

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
              durationMs: mcpDurationMs,
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
