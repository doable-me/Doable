import { defineTool, type Tool } from "@github/copilot-sdk";
import type { ResolvedMcpTool, McpContent } from "./types.js";
import type { ConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";
import { getActiveTrace } from "../ai/trace-collector.js";
import { xray } from "../integrations/xray.js";
import { fetchCtx, createTracedFetch, type HttpTraceEntry } from "../integrations/runner.js";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";

function dlog(msg: string) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [tool-bridge] ${msg}`);
}

/**
 * Side-channel queue for MCP-Apps UI resources.
 *
 * The Copilot SDK double-encodes tool return values into `textResultForLlm`,
 * so out-of-band signalling via JSON in the result string is unreliable. We
 * push UI resources here from the tool handler and drain them in
 * tool-callbacks.ts after each tool call finishes.
 *
 * A UI resource is the standards-compliant payload defined by the MCP Apps
 * spec (modelcontextprotocol.io/extensions/apps): a content item of
 * `{ type: "resource", resource: { uri: "ui://…", mimeType, text|blob } }`.
 * The host renders it in a sandboxed iframe.
 */
export interface PendingUiResource {
  connectorId: string;
  toolName: string;
  resource: {
    uri: string;
    mimeType: string;
    text?: string;
    blob?: string;
    [k: string]: unknown;
  };
}
export const pendingUiResources: PendingUiResource[] = [];

/**
 * Convert MCP tools to Copilot SDK Tool[] definitions.
 * Each MCP tool becomes a defineTool() with handler that calls the MCP server.
 *
 * Naming convention: mcp_{connectorName}_{toolName}
 * This ensures uniqueness across connectors and distinguishes from built-in tools.
 *
 * No tool-name filtering. Servers decide what's callable; if a server has
 * tools that should only be invoked from inside an MCP App iframe, that's
 * its concern (e.g., return an error when invoked without the right context).
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

        // OTel mcp.call span — parented to the active ai.chat.turn span,
        // so the new spans table sees this call alongside HTTP/DB spans.
        const otelTracer = getTracer("doable-api/mcp");
        const mcpSpan = otelTracer.startSpan("mcp.call", {
          kind: SpanKind.CLIENT,
          attributes: {
            "mcp.connector.id": connectorId,
            "mcp.connector.name": connectorName,
            "mcp.tool.name": tool.name,
            "mcp.args.size": JSON.stringify(args ?? {}).length,
          },
        });

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
            mcpSpan.setAttribute("mcp.duration_ms", mcpDurationMs);
            mcpSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorText.slice(0, 200) });
            mcpSpan.end();
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
          mcpSpan.setAttribute("mcp.duration_ms", mcpDurationMs);
          mcpSpan.setAttribute("mcp.result.content_count", result.content?.length ?? 0);
          mcpSpan.setStatus({ code: SpanStatusCode.OK });
          mcpSpan.end();
          const textResult = formatMcpContent(result.content);
          // MCP-Apps standard: scan content for `{type:'resource', resource:{uri:'ui://…'}}`
          // and queue them for the SSE emitter. The host renders these in a
          // sandboxed iframe. The text portion of the result still goes to the
          // LLM verbatim (the server is responsible for instructing the model
          // to wait/stop/etc inside that text).
          const contentTypes = (result.content ?? []).map((it: Record<string, unknown>) => `${it.type}${it.type === "resource" ? `:uri=${(it as { resource?: { uri?: string } }).resource?.uri?.slice(0, 60) ?? "NONE"}` : ""}`);
          console.log(`[MCP:${connectorName}] SCAN ${tool.name}: ${(result.content ?? []).length} items — types=[${contentTypes.join(", ")}]`);
          for (const item of result.content ?? []) {
            if (item.type !== "resource") continue;
            const r = (item as { resource?: { uri?: string } }).resource;
            console.log(`[MCP:${connectorName}] RESOURCE item found: uri=${r?.uri?.slice(0, 80) ?? "NONE"} startsWithUi=${r?.uri?.startsWith("ui://") ?? false}`);
            if (!r?.uri || !r.uri.startsWith("ui://")) continue;
            pendingUiResources.push({
              connectorId,
              toolName: tool.name,
              resource: r as PendingUiResource["resource"],
            });
            console.log(`[MCP:${connectorName}] QUEUED UI resource uri=${r.uri} (queueLen=${pendingUiResources.length})`);
          }
          return {
            success: true,
            result: textResult,
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
          mcpSpan.recordException(err as Error);
          mcpSpan.setAttribute("mcp.duration_ms", mcpDurationMs);
          if (mcpErrorCode != null) mcpSpan.setAttribute("mcp.error.code", mcpErrorCode);
          mcpSpan.setStatus({ code: SpanStatusCode.ERROR, message: errMsg.slice(0, 200) });
          mcpSpan.end();

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
