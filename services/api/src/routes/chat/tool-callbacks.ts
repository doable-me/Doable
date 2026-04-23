/**
 * Tool callback factories: deduplicating recorder and
 * shared tool-progress hooks created per-request.
 */
import type { SSEStreamingApi } from "hono/streaming";
import type { ChatStreamState } from "./types.js";
import type { TraceCollector } from "../../ai/trace-collector.js";
import { sql } from "../../db/index.js";
import { pendingUiPayloads } from "../../mcp/tool-bridge.js";

function dlog(msg: string) {
  if (!process.env.MCP_DEBUG) return;
  console.error(`[${new Date().toISOString()}] [tool-callbacks] ${msg}`);
}
import {
  friendlyToolMessage,
  friendlyToolResult,
} from "../../ai/tool-messages.js";
import { extractSseHintPayload } from "../../ai/plan-parser.js";

/** Deduplicating recorder for assistant tool calls. */
export function createRecordAssistantToolCall(state: ChatStreamState) {
  return (name?: string, args?: unknown) => {
    if (!name) return;
    const normalizedArgs = args && typeof args === "object"
      ? (args as Record<string, unknown>)
      : undefined;
    const argsKey = JSON.stringify(normalizedArgs ?? null);

    for (let i = 0; i < state.assistantToolCalls.length; i++) {
      const e = state.assistantToolCalls[i] as { name?: string; arguments?: unknown };
      if (e.name !== name) continue;
      const existingKey = JSON.stringify(e.arguments ?? null);
      if (existingKey === argsKey) return;
      if (normalizedArgs && !e.arguments) {
        state.assistantToolCalls[i] = { name, arguments: normalizedArgs };
        return;
      }
      if (!normalizedArgs && e.arguments) return;
    }
    state.assistantToolCalls.push({ name, arguments: normalizedArgs });
    state.hadToolCalls = true;
  };
}

/** Create shared tool-progress callbacks for session create/resume. */
export function createToolProgressCallbacks(
  stream: SSEStreamingApi,
  state: ChatStreamState,
  traceCollector: TraceCollector | null,
  recordAssistantToolCall: (name?: string, args?: unknown) => void,
) {
  return {
    onToolStart: (toolName: string, rawArgs: unknown) => {
      // Some SDK channels wrap the real tool args under .arguments
      // ({ toolName, arguments: {...real args...}, toolCallId }); unwrap so
      // path/command extraction below finds the user-facing fields.
      const argsObj = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
      const args = (argsObj as { arguments?: Record<string, unknown> }).arguments ?? argsObj;
      console.log(`[tool-callbacks] onToolStart ${toolName} raw=${JSON.stringify(rawArgs).slice(0,200)} unwrapped=${JSON.stringify(args).slice(0,200)}`);
      recordAssistantToolCall(toolName, args);
      traceCollector?.onToolStart(toolName, args);
      const friendly = friendlyToolMessage(toolName, args);
      const a = args;
      const path =
        (a.path as string | undefined) ??
        (a.filePath as string | undefined) ??
        (a.file as string | undefined) ??
        (a.target as string | undefined);
      const rawCmd = a.command ?? a.cmd ?? a.input;
      const command = typeof rawCmd === "string" ? rawCmd : undefined;
      const packages = Array.isArray(a.packages)
        ? (a.packages as unknown[]).filter((p) => typeof p === "string").join(" ")
        : typeof a.packages === "string" ? (a.packages as string)
        : typeof a.name === "string" && (toolName.toLowerCase().includes("install") || toolName.toLowerCase().includes("package"))
          ? (a.name as string) : undefined;
      stream.writeSSE({ data: JSON.stringify({
        type: "tool_call",
        data: {
          name: toolName,
          friendlyMessage: friendly,
          arguments: args,
          ...(path ? { path } : {}),
          ...(command ? { command } : {}),
          ...(packages ? { packages } : {}),
        },
      }) }).catch(() => {});
      if (toolName === "provision_supabase") {
        const a = (args as Record<string, unknown>) ?? {};
        const name = typeof a.name === "string" ? a.name : "";
        stream.writeSSE({ data: JSON.stringify({
          type: "provision_supabase_required",
          data: { name, reason: "" },
        }) }).catch(() => {});
      }
    },
    onToolEnd: (toolName: string, rawEndArgs: unknown, result: unknown) => {
      const _argsObj = (rawEndArgs && typeof rawEndArgs === "object" ? rawEndArgs : {}) as Record<string, unknown>;
      const _args = (_argsObj as { arguments?: Record<string, unknown> }).arguments ?? _argsObj;
      state.hadToolCalls = true;
      traceCollector?.onToolEnd(toolName, _args, result);
      const friendly = friendlyToolResult(toolName, result, true);
      const ea = _args;
      const endPath =
        (ea.path as string | undefined) ??
        (ea.filePath as string | undefined) ??
        (ea.file as string | undefined) ??
        (ea.target as string | undefined);
      stream.writeSSE({ data: JSON.stringify({
        type: "tool_result",
        data: {
          name: toolName,
          success: true,
          friendlyMessage: friendly,
          ...(endPath ? { path: endPath } : {}),
        },
      }) }).catch(() => {});

      if (toolName === "ask_clarification" && result) {
        try {
          const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
          if (output) {
            const questions = JSON.parse(output);
            if (Array.isArray(questions) && questions.length > 0) {
              stream.writeSSE({ data: JSON.stringify({
                type: "clarification", data: { questions },
              }) }).catch(() => {});
            }
          }
        } catch { /* non-critical */ }
      }
      if (toolName === "provision_supabase") {
        try {
          const payload = extractSseHintPayload(result, "provision_supabase_required");
          if (payload) {
            stream.writeSSE({ data: JSON.stringify({
              type: "provision_supabase_required",
              data: { name: payload.name ?? "", reason: payload.reason ?? "" },
            }) }).catch(() => {});
          }
        } catch (e) {
          console.warn("[Chat] provision_supabase SSE forward threw:", e);
        }
      }
      {
        const integrationPayload = extractSseHintPayload(result, "integration_required");
        if (integrationPayload && integrationPayload.integrationId) {
          stream.writeSSE({ data: JSON.stringify({
            type: "integration_required",
            data: {
              integrationId: integrationPayload.integrationId,
              displayName: integrationPayload.displayName ?? integrationPayload.integrationId,
              logoUrl: integrationPayload.logoUrl,
              reason: integrationPayload.reason ?? "",
            },
          }) }).catch(() => {});
        }
      }
      if (toolName === "create_plan" && result) {
        try {
          const output = typeof result === "string" ? result : (result as Record<string, unknown>)?.output as string;
          if (output) {
            const plan = JSON.parse(output);
            if (plan?.id) {
              stream.writeSSE({ data: JSON.stringify({
                type: "plan", data: { plan },
              }) }).catch(() => {});
              sql`INSERT INTO plans (id, project_id, summary, complexity, status, created_at)
                  VALUES (${plan.id}, ${plan.projectId ?? ""}, ${plan.summary}, ${plan.complexity}, 'draft', now())
                  ON CONFLICT (id) DO NOTHING`.catch(() => {});
              if (Array.isArray(plan.steps)) {
                for (const step of plan.steps) {
                  sql`INSERT INTO plan_steps (id, plan_id, "order", title, description, details, status, file_paths)
                      VALUES (${step.id}, ${plan.id}, ${step.order}, ${step.title}, ${step.description}, ${step.details ?? null}, 'pending', ${step.filePaths ?? null})
                      ON CONFLICT (id) DO NOTHING`.catch(() => {});
                }
              }
            }
          }
        } catch { /* non-critical */ }
      }
      {
        // Drain any pending __ui payloads pushed by tool-bridge during
        // this tool call. We use a side-channel queue because the Copilot
        // SDK double-encodes our handler return value into `textResultForLlm`,
        // making in-band __ui extraction unreliable.
        const uiPayload = pendingUiPayloads.shift() as Record<string, unknown> | undefined;
        dlog(`mcp_ui_open check tool=${toolName} hasUi=${!!uiPayload} uiType=${uiPayload?.uiType ?? "n/a"} queueLen=${pendingUiPayloads.length}`);
        if (uiPayload && uiPayload.uiType) {
          const emittedToolCallId = (uiPayload.toolCallId as string) || `tc_${toolName}_${Date.now()}`;
          const sseData = JSON.stringify({
            type: "mcp_ui_open",
            data: {
              toolCallId: emittedToolCallId,
              connectorId: uiPayload.connectorId,
              toolName,
              title: uiPayload.title,
              uiType: uiPayload.uiType,
              schema: uiPayload.schema ?? {},
              state: uiPayload.state ?? {},
            },
          });
          dlog(`mcp_ui_open EMITTING SSE event toolCallId=${emittedToolCallId} bytes=${sseData.length}`);
          // Signal to stream-recovery that we're waiting for user input — do NOT auto-continue.
          state.awaitingMcpWidget = true;
          stream.writeSSE({ data: sseData })
            .then(() => dlog(`mcp_ui_open SSE write OK`))
            .catch((e) => dlog(`mcp_ui_open SSE write FAILED: ${(e as Error).message}`));
        }
      }
    },
    onSessionEnd: (reason: string, error?: string) => {
      if (error) console.error(`[Chat] Session ended: ${reason} —`, typeof error === 'object' ? JSON.stringify(error) : error);
    },
    onError: (error: unknown, context: string) => {
      const errorStr = typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
      console.error(`[Chat] Hook error (${context}):`, errorStr);
      if (!errorStr || errorStr === '{}' || errorStr === 'undefined') return;
      let userMessage: string;
      if (errorStr.includes("404") || errorStr.includes("not found")) {
        userMessage = "The AI model returned an error (404). The model may be unavailable or the model ID is incorrect. Check your AI settings.";
      } else if (errorStr.includes("401") || errorStr.includes("unauthorized") || errorStr.includes("not authorized")) {
        userMessage = "Authentication failed with the AI provider. Please check your API key in AI settings.";
      } else if (errorStr.includes("429") || errorStr.includes("rate limit")) {
        userMessage = "Rate limit reached. Please wait a moment and try again.";
      } else if (errorStr.includes("500") || errorStr.includes("internal server")) {
        userMessage = "The AI provider returned a server error. Please try again.";
      } else {
        userMessage = "An error occurred while communicating with the AI model. Please try again.";
      }
      stream.writeSSE({ data: JSON.stringify({
        type: "error", data: userMessage,
      }) }).catch(() => {});
    },
  };
}
