import { useEditorStore, type ChatMessage } from "./use-editor-store";
import type { SupabaseProvisionRequest, PendingIntegrationRequest } from "./use-chat-types";

export interface SSEContext {
  assistantId: string;
  updateMessageFields: (id: string, fields: Partial<ChatMessage>) => void;
  setSupabaseProvisionRequest: (r: SupabaseProvisionRequest | null) => void;
  setPendingIntegrationRequest: (r: PendingIntegrationRequest | null) => void;
  setStreaming: (s: boolean) => void;
}

/**
 * Dispatch a parsed SSE event from the streaming response.
 * Returns text to append to accumulated content/thinking, or null.
 */
export function dispatchSSEEvent(
  parsed: { type: string; data?: any },
  ctx: SSEContext,
): { textDelta?: string; thinkingDelta?: string } {
  if (parsed.type === "text_delta") {
    const text = typeof parsed.data === "string" ? parsed.data : "";
    return { textDelta: text };
  }

  if (parsed.type === "thinking") {
    const text = typeof parsed.data === "string" ? parsed.data : "";
    return { thinkingDelta: text };
  }

  if (parsed.type === "tool_call") {
    const friendly =
      parsed.data?.friendlyMessage ??
      parsed.data?.name ??
      "Working on it";
    ctx.updateMessageFields(ctx.assistantId, {
      liveStatus: `tool_call:${friendly}`,
    });
    return {};
  }

  if (parsed.type === "tool_result") {
    const friendly = parsed.data?.friendlyMessage ?? "Done";
    ctx.updateMessageFields(ctx.assistantId, {
      liveStatus: `tool_result:${friendly}`,
    });
    useEditorStore.getState().bumpToolResultVersion();
    return {};
  }

  if (parsed.type === "status") {
    const status = typeof parsed.data === "string"
      ? parsed.data
      : (parsed.data?.message ?? parsed.data?.phase ?? "");
    ctx.updateMessageFields(ctx.assistantId, {
      liveStatus: status ? `status:${status}` : "",
    });
    return {};
  }

  if (parsed.type === "provision_progress") {
    const phase = parsed.data?.phase as string | undefined;
    const message = parsed.data?.message as string | undefined;
    if (phase && message) {
      ctx.updateMessageFields(ctx.assistantId, {
        liveStatus: `provision:${phase}:${message}`,
      });
    }
    return {};
  }

  if (parsed.type === "provision_supabase_required") {
    const name = (parsed.data?.name as string | undefined) ?? "";
    const reason = (parsed.data?.reason as string | undefined) ?? "";
    ctx.setSupabaseProvisionRequest({ name, reason });
    return {};
  }

  if (parsed.type === "integration_required") {
    const integrationId = parsed.data?.integrationId as string | undefined;
    if (integrationId) {
      ctx.setPendingIntegrationRequest({
        integrationId,
        displayName:
          (parsed.data?.displayName as string | undefined) ?? integrationId,
        logoUrl: parsed.data?.logoUrl as string | undefined,
        reason: (parsed.data?.reason as string | undefined) ?? "",
      });
    }
    return {};
  }

  if (parsed.type === "version_created") {
    const sha = parsed.data?.sha ?? (parsed as any).sha;
    if (sha) {
      ctx.updateMessageFields(ctx.assistantId, {
        versionSha: sha,
        hadToolCalls: true,
      });
    }
    return {};
  }

  if (parsed.type === "clarification") {
    const questions = parsed.data?.questions;
    if (Array.isArray(questions) && questions.length > 0) {
      useEditorStore.getState().setPendingQuestions(questions);
      useEditorStore.getState().setPlanPhase("clarifying");
      ctx.setStreaming(false);
    }
    return {};
  }

  if (parsed.type === "plan") {
    const plan = parsed.data?.plan;
    if (plan) {
      useEditorStore.getState().setActivePlan(plan);
      useEditorStore.getState().setPlanPhase("reviewing");
    }
    return {};
  }

  if (parsed.type === "plan_step_update") {
    const { stepId, status } = parsed.data ?? {};
    if (stepId && status) {
      useEditorStore.getState().updatePlanStep(stepId, { status });
    }
    return {};
  }

  if (parsed.type === "mcp_ui_open") {
    const d = parsed.data ?? {};
    const toolCallId = d.toolCallId as string | undefined;
    const uiType = d.uiType as "table" | "form" | "confirm" | "select" | undefined;
    if (toolCallId && uiType) {
      useEditorStore.getState().attachMcpWidget(ctx.assistantId, {
        toolCallId,
        connectorId: (d.connectorId as string | undefined) ?? "",
        toolName: (d.toolName as string | undefined) ?? "",
        uiType,
        title: (d.title as string | undefined) ?? "",
        schema: (d.schema as Record<string, unknown> | undefined) ?? {},
        state: (d.state as Record<string, unknown> | undefined) ?? {},
      });
    }
    return {};
  }

  if (parsed.type === "usage") {
    const u = parsed.data;
    if (u && typeof u === "object") {
      ctx.updateMessageFields(ctx.assistantId, {
        usage: {
          promptTokens: u.promptTokens ?? u.prompt_tokens ?? 0,
          completionTokens: u.completionTokens ?? u.completion_tokens ?? 0,
          totalTokens: u.totalTokens ?? u.total_tokens ?? 0,
          estimatedCostUsd: u.estimatedCostUsd ?? u.estimated_cost_usd ?? 0,
          durationMs: u.durationMs ?? u.duration_ms ?? 0,
          model: u.model ?? "",
          tokensAvailable: u.tokensAvailable ?? u.tokens_available ?? true,
          isLocal: u.isLocal ?? u.is_local ?? false,
          toolCallCount: u.toolCallCount ?? u.tool_call_count ?? 0,
        },
      });
    }
    return {};
  }

  if (parsed.type === "error") {
    return { textDelta: `\n\n**Error:** ${typeof parsed.data === "string" ? parsed.data : "Unknown error"}` };
  }

  return {};
}
