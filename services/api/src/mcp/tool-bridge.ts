import { defineTool, type Tool } from "@github/copilot-sdk";
import type { ResolvedMcpTool, McpContent } from "./types.js";
import type { ConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";
import { getActiveTrace } from "../ai/trace-collector.js";
import { persistInfographicAsset } from "./infographic-persist.js";
import { xray } from "../integrations/xray.js";
import { fetchCtx, createTracedFetch, type HttpTraceEntry } from "../integrations/runner.js";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";
import { requestUserInput, type UserInputChoice } from "../routes/chat/user-input-registry.js";

/**
 * Machine-readable "ask the user and WAIT" marker a tool may return in
 * `structuredContent.userInputRequest`. When present (and we have a live chat
 * stream via projectId), tool-bridge pauses the turn, surfaces a choice card,
 * and — once the user answers — re-invokes the SAME tool with `resubmit.param`
 * set to the chosen value. The model never sees the marker and can't
 * auto-answer, because it never regains control until the tool resolves.
 */
interface UserInputMarker {
  prompt: string;
  kind?: string;
  choices?: UserInputChoice[];
  allowFreeform?: boolean;
  /**
   * How to re-invoke once the user answers. When OMITTED, the tool is simply
   * retried with the SAME args — used for "fix something out-of-band, then
   * retry" forks like re-authentication (sync your cookies, then click Retry).
   */
  resubmit?: {
    /** Tool parameter to set to the chosen value on re-invocation. */
    param: string;
    /** Optional coercion for the chosen value. Default: string. */
    type?: "string" | "boolean" | "number";
  };
  /**
   * If the user's answer equals this value, give up instead of re-invoking and
   * return the tool's current result (e.g. the underlying auth error) so the
   * model reports it honestly.
   */
  cancelValue?: string;
}

function extractUserInputMarker(result: unknown): UserInputMarker | null {
  const sc = (result as { structuredContent?: { userInputRequest?: unknown } } | null)?.structuredContent;
  const raw = sc?.userInputRequest;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.prompt !== "string") return null;
  const resubmit = m.resubmit as Record<string, unknown> | undefined;
  const choices = Array.isArray(m.choices)
    ? (m.choices as unknown[])
        .map((c) => c as Record<string, unknown>)
        .filter((c) => typeof c.label === "string" && typeof c.value === "string")
        .map((c) => ({ label: c.label as string, value: c.value as string }))
    : undefined;
  return {
    prompt: m.prompt,
    kind: typeof m.kind === "string" ? m.kind : undefined,
    choices,
    allowFreeform: typeof m.allowFreeform === "boolean" ? m.allowFreeform : undefined,
    resubmit:
      resubmit && typeof resubmit.param === "string"
        ? {
            param: resubmit.param,
            type: resubmit.type === "boolean" || resubmit.type === "number" ? resubmit.type : "string",
          }
        : undefined,
    cancelValue: typeof m.cancelValue === "string" ? m.cancelValue : undefined,
  };
}

function coerceAnswer(value: string, type: NonNullable<UserInputMarker["resubmit"]>["type"]): unknown {
  if (type === "boolean") return value === "true" || value === "1" || value.toLowerCase() === "yes";
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

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
  userId?: string,
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
      handler: async (rawArgs: Record<string, unknown>) => {
        const config = connectorConfigs.get(connectorId);
        if (!config) {
          return { success: false, error: `Connector ${connectorName} not found` };
        }

        // Inject the Doable userId as user_token for any MCP tool that declares
        // it in its schema — server-side, so AI never needs to know or pass it.
        // This ensures per-user cookie isolation without privacy leakage.
        const toolSchema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
        const args =
          userId && toolSchema?.properties && "user_token" in toolSchema.properties && !rawArgs.user_token
            ? { ...rawArgs, user_token: userId }
            : rawArgs;

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
              let result = await client.callTool(tool.name, args);

              // ── Blocking "ask the user and WAIT" loop ──────────────
              // If the tool returns a userInputRequest marker AND we're in a
              // live chat turn (projectId present), pause here, surface a
              // choice card, and re-invoke the tool with the user's answer.
              // The model can't auto-answer because it never regains control
              // until this resolves. Guarded against infinite chains.
              let currentArgs = args;
              let hops = 0;
              while (projectId && hops < 4) {
                // NB: a marker is honoured even on an isError result — the
                // re-auth fork returns isError (so non-Doable clients still see
                // a failure) but is recoverable once the user re-syncs cookies.
                const marker = extractUserInputMarker(result);
                if (!marker) break;
                hops += 1;
                console.log(`[MCP:${connectorName}] user_input_required for ${tool.name} — pausing turn (hop ${hops})`);
                // Coalesce identical concurrent asks (e.g. summary + infographic
                // of the same video both hitting the same "which notebook?"
                // fork) so one card / one answer resolves them all. Keyed on the
                // connector + kind + choice set — deliberately NOT the tool name,
                // since different tools ask the same question. Undefined when
                // there are no choices (freeform), so those aren't coalesced.
                const dedupeKey = marker.choices && marker.choices.length > 0
                  ? `${connectorId}:${marker.kind ?? "generic"}:${marker.choices.map((c) => c.value).sort().join("|")}`
                  : undefined;
                const answer = await requestUserInput(projectId, {
                  prompt: marker.prompt,
                  kind: marker.kind,
                  choices: marker.choices,
                  allowFreeform: marker.allowFreeform ?? false,
                  dedupeKey,
                });
                if (answer.cancelled) {
                  console.log(`[MCP:${connectorName}] user_input ${tool.name} cancelled (${answer.reason}) — returning guidance to model`);
                  // Keep a real error result (e.g. the auth failure) as-is so the
                  // model reports the actual problem rather than a vague "no answer".
                  if (!result.isError) {
                    result = {
                      content: [{
                        type: "text",
                        text:
                          answer.reason === "timeout"
                            ? "The user did not respond in time, so no choice was made and the action was not completed. Let the user know and ask again if they still want it."
                            : "No answer channel was available to ask the user, so the action was not completed. Ask the user directly in your reply which option they want, then call this tool again with their choice.",
                      }],
                      isError: false,
                    };
                  }
                  break;
                }
                // The user explicitly gave up (e.g. "Cancel" on the re-auth card):
                // stop and surface the tool's current result.
                if (marker.cancelValue !== undefined && answer.value === marker.cancelValue) {
                  console.log(`[MCP:${connectorName}] user_input ${tool.name} declined by user — returning current result`);
                  break;
                }
                // No resubmit param => "fix it out-of-band, then retry" (re-auth):
                // re-invoke with the SAME args.
                if (marker.resubmit) {
                  currentArgs = { ...currentArgs, [marker.resubmit.param]: coerceAnswer(answer.value, marker.resubmit.type) };
                }
                xr.phase("call_tool");
                result = await client.callTool(tool.name, currentArgs);
              }
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
          // Persist NotebookLM infographics into the project so they survive
          // deploy and don't expire — rewrites image_url to a project-relative
          // /infographics/<jobId>.jpg before the agent sees it. Best-effort;
          // returns the original content on any failure. Only the agent-facing
          // text is affected — traces above keep the raw server result.
          const agentContent = projectId
            ? await persistInfographicAsset(projectId, tool.name, result.content)
            : result.content;
          const textResult = formatMcpContent(agentContent);
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
            result: sanitizeMcpResultForAgent(textResult),
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

/**
 * Trim the builder-agent-facing MCP result text. Drops the large `_meta` /
 * `_instructions` blobs (LLM formatting instructions, NOT data) and caps
 * oversized arrays so a one-shot shape probe stays cheap to read. The generated
 * APP still fetches the FULL data at runtime via the connector-proxy — this only
 * affects what the build agent sees while learning the response shape.
 */
function stripMetaDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripMetaDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === "_meta" || k === "_instructions") continue;
      out[k] = stripMetaDeep(val);
    }
    return out;
  }
  return v;
}
function sanitizeMcpResultForAgent(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (!parsed || typeof parsed !== "object") return text;
  const stripped = stripMetaDeep(parsed) as Record<string, unknown>;
  let out = JSON.stringify(stripped);
  if (out.length > 12000) {
    for (const [k, val] of Object.entries(stripped)) {
      if (Array.isArray(val) && val.length > 25) {
        stripped[k] = [
          ...val.slice(0, 25),
          `…(${val.length - 25} more items omitted from this build-time shape preview; the app fetches all at runtime)`,
        ];
      }
    }
    out = JSON.stringify(stripped);
  }
  return out;
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
