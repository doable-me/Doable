import { defineTool, type Tool } from "@github/copilot-sdk";
import type { ResolvedMcpTool, McpContent, McpUiPayload } from "./types.js";
import type { ConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";
import { getActiveTrace } from "../ai/trace-collector.js";
import { xray } from "../integrations/xray.js";
import { fetchCtx, createTracedFetch, type HttpTraceEntry } from "../integrations/runner.js";

function dlog(msg: string) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [tool-bridge] ${msg}`);
}

/**
 * Side-channel queue for __ui payloads.
 *
 * The Copilot SDK double-encodes tool return values (wraps our
 * `{ success, result, __ui }` into a JSON string under `textResultForLlm`),
 * which makes in-band `__ui` extraction unreliable. Instead, we push the
 * payload here from the MCP tool handler and drain it in tool-callbacks
 * after each tool call finishes.
 */
export const pendingUiPayloads: McpUiPayload[] = [];

/**
 * Convert MCP tools to Copilot SDK Tool[] definitions.
 * Each MCP tool becomes a defineTool() with handler that calls the MCP server.
 *
 * Naming convention: mcp_{connectorName}_{toolName}
 * This ensures uniqueness across connectors and distinguishes from built-in tools.
 */
// Tools starting with these prefixes are internal — invoked by Doable's
// mcp-action endpoint directly over MCP, NOT by the LLM. We do NOT expose
// them as callable Copilot SDK tools, otherwise the model may invoke them
// directly with invented arguments and bypass the interactive widget flow.
const INTERNAL_TOOL_NAMES = new Set([
  "ui_action",
  // Generators are triggered by ui_action when the user clicks a picker option,
  // never invoked directly by the LLM (otherwise it bypasses the picker).
  "generate_web_slides",
  "generate_pptx",
]);

export function createMcpTools(
  resolvedTools: ResolvedMcpTool[],
  connectorManager: ConnectorManager,
  connectorConfigs: Map<string, McpConnectorConfig>,
  projectId?: string,
): Tool[] {
  return resolvedTools
    .filter((r) => !INTERNAL_TOOL_NAMES.has(r.tool.name))
    .map((resolved) => {
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
          const textResult = formatMcpContent(result.content);
          const uiPayload = extractUiPayload(result.content, connectorId, tool.name);
          if (uiPayload) {
            pendingUiPayloads.push(uiPayload);
            dlog(`handler: pushed __ui to queue (len=${pendingUiPayloads.length})`);
          }
          // For UI-bearing results, give the LLM a short stub instead of the
          // raw JSON — otherwise it reads the picker JSON and paraphrases
          // "Web Slides / PowerPoint" as a text list, confusing the user.
          const llmFacing = uiPayload
            ? `An interactive picker is now shown to the user. Wait for their selection. Do not write any code or call any other tools yet. Respond with exactly: "Please choose a format above."`
            : textResult;
          dlog(`handler return: hasUi=${!!uiPayload} llmFacingLen=${llmFacing.length}`);
          return {
            success: true,
            result: llmFacing,
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

/**
 * Scan MCP content items for a structured UI payload.
 * MCP servers signal interactive UI by embedding a JSON object with a
 * `__ui` key inside one of their text content items.
 *
 * Example content item:
 *   { "type": "text", "text": "{\"__ui\":{\"uiType\":\"table\",...}}" }
 *
 * The toolCallId is not known inside the tool handler, so we leave it empty
 * here and let tool-callbacks.ts fill it in from the Copilot SDK event context.
 */
function extractUiPayload(
  content: McpContent[],
  connectorId: string,
  toolName: string,
): McpUiPayload | null {
  dlog(`extractUiPayload tool=${toolName} items=${content.length} types=${content.map((c) => c.type).join(",")}`);
  for (const item of content) {
    if (item.type !== "text") continue;
    const text = item.text.trim();
    dlog(`extractUiPayload text preview: ${text.slice(0, 200)}`);
    if (!text.includes("__ui")) { dlog(`  skip: no __ui in text`); continue; }
    try {
      const parsed = JSON.parse(text);
      const ui = parsed?.__ui;
      if (!ui || typeof ui !== "object") { dlog(`  skip: parsed has no __ui object`); continue; }
      if (!ui.uiType || !["table", "form", "confirm", "select"].includes(ui.uiType)) { dlog(`  skip: bad uiType=${ui.uiType}`); continue; }
      dlog(`  EXTRACTED uiType=${ui.uiType}`);
      return {
        uiType: ui.uiType,
        toolCallId: "",
        connectorId: ui.connectorId ?? connectorId,
        title: ui.title ?? toolName,
        schema: ui.schema ?? {},
        state: ui.state ?? {},
      } satisfies McpUiPayload;
    } catch (e) {
      dlog(`  JSON.parse failed: ${(e as Error).message}`);
      // Not JSON or not a valid UI payload — skip
    }
  }
  return null;
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
