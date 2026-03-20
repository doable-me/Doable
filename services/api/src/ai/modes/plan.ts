import type {
  ConversationMessage,
  StreamEvent,
  EngineOptions,
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
} from "../streaming.js";
import { updateContextFile } from "../context/index.js";
import { sql } from "../../db/index.js";
import { contextManager } from "../../context/manager.js";

const ctxManager = contextManager(sql);

// Tools allowed in plan mode (read-only + list + search)
const PLAN_MODE_TOOLS = new Set([
  "read_file",
  "list_files",
  "search_files",
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

  // Only expose read-only tools in plan mode
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

    // If done (no tool calls), save the plan
    if (finishReason !== "tool_use" || pendingToolCalls.length === 0) {
      if (fullText) {
        conversationMessages.push({ role: "assistant", content: fullText });

        // Extract and save plan to .doable/plan.md (file system + database)
        const plan = extractPlan(fullText);
        if (plan) {
          try {
            // Save to file system
            await updateContextFile(toolCtx.projectId, "plan.md", plan);
            // Also save to database-backed context
            try {
              await ctxManager.updateContextFile(toolCtx.projectId, "plan.md", plan);
            } catch {
              // DB save is secondary — file system is the source of truth for the engine
            }
            yield textEvent("\n\n_Plan saved to `.doable/plan.md`_");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            yield errorEvent(`Failed to save plan: ${msg}`, "SAVE_ERROR", true);
          }
        }
      }
      return;
    }

    // Add assistant message
    conversationMessages.push({
      role: "assistant",
      content: fullText || null,
      toolCalls: pendingToolCalls,
    });

    // Execute read-only tools
    for (const toolCall of pendingToolCalls) {
      toolCallCount++;

      // Enforce read-only in plan mode
      if (!PLAN_MODE_TOOLS.has(toolCall.name)) {
        const result = {
          success: false as const,
          output: "",
          error: `Tool '${toolCall.name}' is not available in plan mode. Only read-only tools are allowed.`,
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
    }
  }
}

// ─── Plan Extraction ──────────────────────────────────────

function extractPlan(text: string): string | null {
  // Look for a markdown plan structure in the response
  const planHeaderPattern = /^#\s+Plan/m;

  if (planHeaderPattern.test(text)) {
    // Extract from the plan header onwards
    const match = text.match(planHeaderPattern);
    if (match?.index !== undefined) {
      return text.slice(match.index).trim();
    }
  }

  // If the whole response looks like a plan, use it all
  if (
    text.includes("##") &&
    (text.includes("Step") || text.includes("Task") || text.includes("Phase"))
  ) {
    return `# Plan\n\n${text.trim()}`;
  }

  // Fallback: wrap the entire response as a plan
  if (text.trim().length > 100) {
    return `# Plan\n\n${text.trim()}`;
  }

  return null;
}

// ─── Plan Prompt ──────────────────────────────────────────

const PLAN_GENERATION_PROMPT = `Generate a structured development plan. The plan must include:

1. **Overview**: Brief summary of what will be built/changed
2. **Steps**: Numbered, actionable steps with:
   - Description of the change
   - File paths that will be created or modified
   - Key implementation details
3. **Complexity**: Estimated complexity (low/medium/high)
4. **Risks**: Any potential issues or considerations

Format the plan as markdown starting with "# Plan".
You may use read_file, list_files, and search_files to understand the current codebase before planning.
Do NOT make any file changes.`;
