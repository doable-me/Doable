import type {
  ConversationMessage,
  StreamEvent,
  ToolCall,
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
  codeDiffEvent,
  errorEvent,
} from "../streaming.js";

// ─── File-modifying tools for diff events ─────────────────

const FILE_MUTATION_TOOLS = new Set([
  "create_file",
  "edit_file",
  "delete_file",
]);

// ─── Agent Mode Handler ──────────────────────────────────

export async function* runAgentMode(
  provider: LLMProvider,
  messages: ConversationMessage[],
  toolCtx: ToolContext,
  options: EngineOptions,
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  let toolCallCount = 0;
  let retryCount = 0;
  const conversationMessages = [...messages];
  const toolDefinitions = toolRegistry.getDefinitions();

  while (true) {
    // Check time limit
    const elapsed = Date.now() - startTime;
    if (elapsed > options.maxDurationMs) {
      yield errorEvent("Request timed out (15 minute limit)", "TIMEOUT", false);
      return;
    }

    // Check tool call limit
    if (toolCallCount >= options.maxToolCalls) {
      yield errorEvent(
        "Maximum tool calls reached. Please continue in a new message.",
        "MAX_TOOL_CALLS",
        true,
      );
      return;
    }

    // Call LLM
    let fullText = "";
    let pendingToolCalls: ToolCall[] = [];
    let finishReason: string | undefined;

    try {
      for await (const chunk of provider.complete(
        conversationMessages,
        toolDefinitions,
        { maxTokens: 8192 },
      )) {
        switch (chunk.type) {
          case "thinking":
            if (chunk.content) {
              yield thinkingEvent(chunk.content);
            }
            break;

          case "text":
            if (chunk.content) {
              fullText += chunk.content;
              yield textEvent(chunk.content);
            }
            break;

          case "tool_call":
            if (chunk.toolCall) {
              pendingToolCalls.push(chunk.toolCall);
            }
            break;

          case "done":
            finishReason = chunk.finishReason;
            break;

          case "error":
            yield errorEvent(
              chunk.content ?? "LLM error",
              "LLM_ERROR",
              true,
            );
            return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield errorEvent(`LLM request failed: ${message}`, "LLM_ERROR", true);
      return;
    }

    // If no tool calls, we're done
    if (finishReason !== "tool_use" || pendingToolCalls.length === 0) {
      // Add assistant message to conversation
      if (fullText) {
        conversationMessages.push({ role: "assistant", content: fullText });
      }
      return;
    }

    // Add assistant message with tool calls
    conversationMessages.push({
      role: "assistant",
      content: fullText || null,
      toolCalls: pendingToolCalls,
    });

    // Execute tool calls
    for (const toolCall of pendingToolCalls) {
      toolCallCount++;

      yield toolCallEvent(toolCall.id, toolCall.name, toolCall.arguments);

      const result = await toolRegistry.execute(
        toolCall.name,
        toolCall.arguments,
        toolCtx,
      );

      yield toolResultEvent(toolCall.id, toolCall.name, result);

      // Emit code diff events for file mutations
      if (FILE_MUTATION_TOOLS.has(toolCall.name) && result.success) {
        const filePath = String(toolCall.arguments.path ?? "");
        const action = toolCall.name === "create_file"
          ? "create"
          : toolCall.name === "delete_file"
            ? "delete"
            : "edit";

        yield codeDiffEvent(filePath, result.output, action as "create" | "edit" | "delete");
      }

      // Add tool result to conversation
      conversationMessages.push({
        role: "tool",
        content: result.success
          ? result.output
          : `Error: ${result.error ?? "Unknown error"}`,
        toolCallId: toolCall.id,
        name: toolCall.name,
      });

      // Auto-debug: if build fails, retry
      if (
        toolCall.name === "run_build" &&
        !result.success &&
        retryCount < options.maxRetries
      ) {
        retryCount++;
        yield thinkingEvent(
          `Build failed. Attempting auto-fix (retry ${retryCount}/${options.maxRetries})...`,
        );

        // Add a hint for the LLM to fix the errors
        conversationMessages.push({
          role: "user",
          content:
            `The build failed with errors. Please analyze the errors above and fix them. ` +
            `This is auto-retry ${retryCount}/${options.maxRetries}.`,
        });
      }
    }
  }
}
