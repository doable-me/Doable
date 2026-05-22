import { useEditorStore, type ChatMessage } from "./use-editor-store";
import type { SupabaseProvisionRequest, PendingIntegrationRequest } from "./use-chat-types";
import {
  inferPhaseFromTool,
  extractFilePath,
  type AgentPhase,
} from "./use-agent-progress";

export interface SSEContext {
  assistantId: string;
  updateMessageFields: (id: string, fields: Partial<ChatMessage>) => void;
  setSupabaseProvisionRequest: (r: SupabaseProvisionRequest | null) => void;
  setPendingIntegrationRequest: (r: PendingIntegrationRequest | null) => void;
  setStreaming: (s: boolean) => void;
  /** Inject a clarification question bubble into the chat */
  addClarificationMessage?: (q: {
    id: string;
    question: string;
    options?: string[];
    context?: string;
  }) => void;
}

/**
 * Dispatch a parsed SSE event from the streaming response.
 * Returns text to append to accumulated content/thinking, or empty object.
 *
 * Side effects:
 * - Updates agentProgress on the assistant message
 * - Pushes / completes entries in the global agentTimeline
 * - Updates liveToolCalls array on the message for ToolCallCard rendering
 */
export function dispatchSSEEvent(
  parsed: { type: string; data?: any },
  ctx: SSEContext,
): { textDelta?: string; thinkingDelta?: string } {
  const store = useEditorStore.getState();
	  // DEBUG: log every non-delta SSE type so we can verify pipeline
  if (parsed.type !== "text_delta" && parsed.type !== "thinking" && parsed.type !== "keep_alive") {
     
    console.warn("[SSE]", parsed.type, parsed.data);
  }
  // ─── Text streaming ──────────────────────────────────────
  if (parsed.type === "text_delta") {
    const text = typeof parsed.data === "string" ? parsed.data : "";
    // Switch phase to streaming_response on first text token
    ctx.updateMessageFields(ctx.assistantId, {
      agentProgress: {
        phase: "streaming_response",
        message: "Responding…",
      },
    });
    store.setActiveAgentProgress({ phase: "streaming_response", message: "Responding…" });
    return { textDelta: text };
  }

  // ─── Thinking / reasoning tokens ─────────────────────────
  if (parsed.type === "thinking") {
    const text = typeof parsed.data === "string" ? parsed.data : "";
    return { thinkingDelta: text };
  }

  // ─── Tool call started ────────────────────────────────────
  if (parsed.type === "tool_call") {
    const toolName: string = parsed.data?.name ?? "";
    const filePath = extractFilePath(parsed.data);
    const friendly: string =
      parsed.data?.friendlyMessage ?? parsed.data?.name ?? "Working on it";
    const phase: AgentPhase = inferPhaseFromTool(toolName);
    const eventId = `${toolName}_${Date.now()}`;

    const progress = { phase, message: friendly, toolName, filePath };

    ctx.updateMessageFields(ctx.assistantId, {
      agentProgress: progress,
      // Push a new running tool card
      liveToolCalls: [
        ...(useEditorStore.getState().messages.find((m) => m.id === ctx.assistantId)
          ?.liveToolCalls ?? []),
        {
          id: eventId,
          toolName,
          filePath,
          friendlyMessage: friendly,
          status: "running" as const,
          startedAt: Date.now(),
        },
      ],
    });

    store.setActiveAgentProgress(progress);
    store.pushAgentTimeline({
      id: eventId,
      phase,
      message: friendly,
      toolName,
      filePath,
      timestamp: new Date().toISOString(),
      status: "running",
    });

    return {};
  }

  // ─── Tool result / completed ──────────────────────────────
  if (parsed.type === "tool_result") {
    const toolName: string = parsed.data?.name ?? "";
    const filePath: string | undefined = parsed.data?.path ?? extractFilePath(parsed.data);
    const friendly: string = parsed.data?.friendlyMessage ?? "Done";
    const linesAdded: number | undefined = parsed.data?.linesAdded;
    const linesRemoved: number | undefined = parsed.data?.linesRemoved;
    const success: boolean = parsed.data?.success !== false;



    const msg = useEditorStore.getState().messages.find((m) => m.id === ctx.assistantId);
    const prevToolCalls = msg?.liveToolCalls ?? [];

    // Find the most recent running entry for this tool and mark it complete
    let matched = false;
    const updatedToolCalls = prevToolCalls.map((tc) => {
      if (!matched && tc.toolName === toolName && tc.status === "running") {
        matched = true;
        return {
          ...tc,
          status: (success ? "completed" : "failed") as "completed" | "failed",
          completedAt: Date.now(),
          filePath: filePath ?? tc.filePath,
          linesAdded,
          linesRemoved,
        };
      }
      return tc;
    });

    // If no matching running entry was found (e.g. tool_call event was missed),
    // add a completed entry so the tool still appears in the UI
    if (!matched && toolName) {
      updatedToolCalls.push({
        id: `${toolName}_${Date.now()}`,
        toolName,
        filePath,
        friendlyMessage: friendly,
        status: (success ? "completed" : "failed") as "completed" | "failed",
        startedAt: Date.now() - 1000,
        completedAt: Date.now(),
        linesAdded,
        linesRemoved,
      });
    }

    ctx.updateMessageFields(ctx.assistantId, {
      agentProgress: {
        phase: success ? "thinking" : "fixing",
        message: friendly,
        toolName,
        filePath,
      },
      liveToolCalls: updatedToolCalls,
    });

    store.setActiveAgentProgress({
      phase: success ? "thinking" : "fixing",
      message: friendly,
    });

    // Complete the timeline event for this tool
    const timeline = store.agentTimeline;
    const last = [...timeline].reverse().find(
      (e) => e.toolName === toolName && e.status === "running"
    );
    if (last) {
      store.completeAgentTimelineEvent(last.id, success ? "completed" : "failed");
    }

    store.bumpToolResultVersion();
    return {};
  }

  // ─── Status message ───────────────────────────────────────
  if (parsed.type === "status") {
    const rawStatus =
      typeof parsed.data === "string"
        ? parsed.data
        : (parsed.data?.message ?? parsed.data?.phase ?? "");
    const phase = (parsed.data?.phase as AgentPhase | undefined) ?? "thinking";
    const progress = { phase, message: rawStatus || "Working…" };

    ctx.updateMessageFields(ctx.assistantId, { agentProgress: progress });
    store.setActiveAgentProgress(progress);
    return {};
  }

  // ─── Provision progress ───────────────────────────────────
  if (parsed.type === "provision_progress") {
    const phase = parsed.data?.phase as string | undefined;
    const message = parsed.data?.message as string | undefined;
    if (phase && message) {
      const progress = { phase: "installing" as AgentPhase, message };
      ctx.updateMessageFields(ctx.assistantId, { agentProgress: progress });
      store.setActiveAgentProgress(progress);
    }
    return {};
  }

  // ─── Supabase provisioning required ──────────────────────
  if (parsed.type === "provision_supabase_required") {
    const name = (parsed.data?.name as string | undefined) ?? "";
    const reason = (parsed.data?.reason as string | undefined) ?? "";
    ctx.setSupabaseProvisionRequest({ name, reason });
    return {};
  }

  // ─── Integration required ─────────────────────────────────
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

  // ─── Version / undo tracking ──────────────────────────────
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

  // ─── Inline clarification (agent mode question card) ──────────
  if (parsed.type === "inline_clarification") {
    const q = parsed.data;
    if (q?.id && q?.question && ctx.addClarificationMessage) {
      ctx.addClarificationMessage({
        id: q.id,
        question: q.question,
        options: Array.isArray(q.options) ? q.options : [],
        context: q.context as string | undefined,
      });
    }
    return {};
  }

  // ─── Clarification questions ──────────────────────────────
  if (parsed.type === "clarification") {
    const questions = parsed.data?.questions;
    if (Array.isArray(questions) && questions.length > 0) {
      store.setPendingQuestions(questions);
      store.setPlanPhase("clarifying");
      store.setActiveAgentProgress({ phase: "clarifying", message: "Waiting for your input" });
      ctx.updateMessageFields(ctx.assistantId, {
        agentProgress: { phase: "clarifying", message: "Waiting for your input" },
      });
      ctx.setStreaming(false);
    }
    return {};
  }

  // ─── Plan created ─────────────────────────────────────────
  if (parsed.type === "plan") {
    const plan = parsed.data?.plan;
    if (plan) {
      store.setActivePlan(plan);
      store.setPlanPhase("reviewing");
      store.setActiveAgentProgress({ phase: "planning", message: "Plan ready for review" });
      ctx.updateMessageFields(ctx.assistantId, {
        agentProgress: { phase: "planning", message: "Plan ready for review" },
      });
    }
    return {};
  }

  // ─── Plan step update ─────────────────────────────────────
  if (parsed.type === "plan_step_update") {
    const { stepId, status, message } = parsed.data ?? {};
    if (stepId && status) {
      store.updatePlanStep(stepId, { status });

      if (status === "in_progress") {
        const activePlan = store.activePlan;
        const stepIdx = activePlan?.steps.findIndex((s) => s.id === stepId) ?? -1;
        const stepTotal = activePlan?.steps.length ?? 0;
        const percent =
          stepTotal > 0 ? Math.round((stepIdx / stepTotal) * 100) : undefined;

        const progress = {
          phase: "writing_files" as AgentPhase,
          message: message ?? "Executing step…",
          stepIndex: stepIdx,
          stepTotal,
          percent,
        };

        ctx.updateMessageFields(ctx.assistantId, { agentProgress: progress });
        store.setActiveAgentProgress(progress);

        store.pushAgentTimeline({
          id: stepId,
          phase: "writing_files",
          message: message ?? "Executing step…",
          timestamp: new Date().toISOString(),
          status: "running",
        });
      }

      if (status === "completed" || status === "failed") {
        store.completeAgentTimelineEvent(stepId, status as "completed" | "failed");
      }
    }
    return {};
  }

  // ─── Usage / token metrics ────────────────────────────────
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

  // ─── Error ────────────────────────────────────────────────
  if (parsed.type === "error") {
    const errMsg =
      typeof parsed.data === "string" ? parsed.data : "Unknown error";
    ctx.updateMessageFields(ctx.assistantId, {
      agentProgress: { phase: "failed", message: errMsg },
    });
    store.setActiveAgentProgress({ phase: "failed", message: errMsg });
    return {
      textDelta: `\n\n**Error:** ${errMsg}`,
    };
  }

  // ─── MCP-Apps UI resource (standards-compliant) ──────────
  // Server returned a `{type:'resource', resource:{uri:'ui://…',mimeType,text|blob}}`
  // content item. We attach it to the assistant message; the chat renderer
  // mounts it inside a sandboxed iframe via @mcp-ui/client.
  if (parsed.type === "mcp_ui_resource") {
    const d = parsed.data as {
      toolCallId?: string;
      connectorId?: string;
      toolName?: string;
      resource?: { uri?: string; mimeType?: string; text?: string; blob?: string };
    };
    if (d?.toolCallId && d?.resource?.uri && d?.resource?.mimeType) {
      const current = useEditorStore.getState().messages.find((m) => m.id === ctx.assistantId);
      const existing = current?.mcpResources ?? {};
      ctx.updateMessageFields(ctx.assistantId, {
        mcpResources: {
          ...existing,
          [d.toolCallId]: {
            toolCallId: d.toolCallId,
            connectorId: d.connectorId ?? "",
            toolName: d.toolName ?? "",
            resource: {
              uri: d.resource.uri,
              mimeType: d.resource.mimeType,
              text: d.resource.text,
              blob: d.resource.blob,
            },
            closed: false,
          },
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
