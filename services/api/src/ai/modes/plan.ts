import {extractPlanFromResponse as extractPlan} from "../plan-parser.js";
import { randomUUID } from "node:crypto";
import type {
  ConversationMessage,
  StreamEvent,
  EngineOptions,
  Plan,
  ClarificationQuestion,
} from "@doable/shared/types/ai.js";
import type { LLMProvider } from "../provider.js";
import type { ToolContext } from "../tools/index.js";
import { toolRegistry } from "../tools/index.js";
import {
  textEvent,
  thinkingEvent,
  toolCallEvent,
  toolResultEvent,
  errorEvent,
  clarificationEvent,
  planEvent,
} from "../streaming.js";
import { updateContextFile } from "../context/index.js";


// Tools allowed in plan mode: read-only + plan-specific
const PLAN_MODE_TOOLS = new Set([
  "read_file",
  "list_files",
  "search_files",
  "ask_clarification",
  "create_plan",
  "get_plan",
]);

// ─── Plan Mode Handler ───────────────────────────────────

export async function* runPlanMode(
  provider: LLMProvider,
  messages: ConversationMessage[],
  toolCtx: ToolContext,
  options: EngineOptions,
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  let toolCallCount = 0;
  const conversationMessages = [...messages];

  // Only expose plan-allowed tools
  const planTools = toolRegistry
    .getDefinitions()
    .filter((t) => PLAN_MODE_TOOLS.has(t.name));

  // Append plan-generation instruction
  conversationMessages.push({
    role: "system",
    content: PLAN_GENERATION_PROMPT,
  });

  while (true) {
    // Check time limit
    if (Date.now() - startTime > options.maxDurationMs) {
      yield errorEvent("Request timed out", "TIMEOUT", false);
      return;
    }

    if (toolCallCount >= options.maxToolCalls) {
      yield errorEvent("Max tool calls reached", "MAX_TOOL_CALLS", true);
      return;
    }

    let fullText = "";
    let pendingToolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];
    let finishReason: string | undefined;

    try {
      for await (const chunk of provider.complete(
        conversationMessages,
        planTools,
        { maxTokens: 8192, temperature: 0.3 },
      )) {
        switch (chunk.type) {
          case "thinking":
            if (chunk.content) yield thinkingEvent(chunk.content);
            break;
          case "text":
            if (chunk.content) {
              fullText += chunk.content;
              yield textEvent(chunk.content);
            }
            break;
          case "tool_call":
            if (chunk.toolCall) pendingToolCalls.push(chunk.toolCall);
            break;
          case "done":
            finishReason = chunk.finishReason;
            break;
          case "error":
            yield errorEvent(chunk.content ?? "LLM error", "LLM_ERROR", true);
            return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield errorEvent(`LLM request failed: ${message}`, "LLM_ERROR", true);
      return;
    }

    // If done (no tool calls), try to extract plan from text as fallback
    if (finishReason !== "tool_use" || pendingToolCalls.length === 0) {
      if (fullText) {
        conversationMessages.push({ role: "assistant", content: fullText });

        // Fallback: extract plan from raw text when AI doesn't use create_plan
        const planMarkdown = extractPlan(fullText);
        if (planMarkdown) {
          try {
            await updateContextFile(toolCtx.projectId, "plan.md", planMarkdown);
            yield textEvent("\n\n_Plan saved to `.doable/plan.md`_");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            yield errorEvent(`Failed to save plan: ${msg}`, "SAVE_ERROR", true);
          }
        }
      }
      return;
    }

    // Add assistant message with tool calls
    conversationMessages.push({
      role: "assistant",
      content: fullText || null,
      toolCalls: pendingToolCalls,
    });

    // Execute tools
    for (const toolCall of pendingToolCalls) {
      toolCallCount++;

      // Enforce plan-mode tool allowlist
      if (!PLAN_MODE_TOOLS.has(toolCall.name)) {
        const result = {
          success: false as const,
          output: "",
          error: `Tool '${toolCall.name}' is not available in plan mode. Only read-only and planning tools are allowed.`,
        };
        yield toolResultEvent(toolCall.id, toolCall.name, result);
        conversationMessages.push({
          role: "tool",
          content: `Error: ${result.error}`,
          toolCallId: toolCall.id,
          name: toolCall.name,
        });
        continue;
      }

      yield toolCallEvent(toolCall.id, toolCall.name, toolCall.arguments);

      const result = await toolRegistry.execute(
        toolCall.name,
        toolCall.arguments,
        toolCtx,
      );

      yield toolResultEvent(toolCall.id, toolCall.name, result);

      conversationMessages.push({
        role: "tool",
        content: result.success
          ? result.output
          : `Error: ${result.error ?? "Unknown error"}`,
        toolCallId: toolCall.id,
        name: toolCall.name,
      });

      // ── Handle clarification tool ──────────────────────
      if (result.metadata?.type === "clarification") {
        const questions = result.metadata.questions as ClarificationQuestion[];
        yield clarificationEvent(questions);
        return;
      }

      // ── Handle create_plan tool ────────────────────────
      if (result.metadata?.type === "plan") {
        const plan = result.metadata.plan as Plan;

        yield planEvent(plan);
        return;
      }
    }
  }
}

export { planToMarkdown } from "../plan-state.js";

// ─── Plan Extraction (Fallback) ──────────────────────────

// ─── Plan Prompt ──────────────────────────────────────────

const PLAN_GENERATION_PROMPT = `You have two tools for planning: ask_clarification and create_plan.

STEP 1 — CLARIFY (if needed):
- If the request is vague or ambiguous, call ask_clarification with 2-4 focused questions
- Each question should have smart default options when possible
- Use plain language, no technical jargon
- If the request is specific enough, skip straight to STEP 2

STEP 2 — PLAN:
- After reading the codebase and understanding the request, call create_plan
- Write a 1-2 sentence summary in plain language
- Create 3-8 concrete steps with action-oriented titles
- Step descriptions should explain WHAT will be built, not HOW
- Put technical details (file paths, implementation notes) in the optional details field
- Estimate complexity as simple/moderate/complex

Do NOT make any file changes. Only analyze and plan.`;
