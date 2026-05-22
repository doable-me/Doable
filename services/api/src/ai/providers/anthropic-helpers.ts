/**
 * Anthropic message/tool conversion helpers.
 */

import type {
  ConversationMessage,
  ToolDefinition,
} from "@doable/shared/types/ai.js";
import type {
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicToolResultBlock,
  AnthropicTool,
} from "./anthropic-types.js";

// ─── Message Conversion ─────────────────────────────────

export function convertMessages(messages: ConversationMessage[]): {
  systemPrompt: string | undefined;
  anthropicMessages: AnthropicMessage[];
} {
  let systemPrompt: string | undefined;
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Accumulate system messages into the system parameter
      if (systemPrompt) {
        systemPrompt += "\n\n" + (msg.content ?? "");
      } else {
        systemPrompt = msg.content ?? "";
      }
      continue;
    }

    if (msg.role === "tool") {
      // Tool results become user messages with tool_result content blocks
      const block: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.toolCallId ?? "",
        content: msg.content ?? "",
      };
      anthropicMessages.push({
        role: "user",
        content: [block],
      });
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool calls
        const blocks: AnthropicContentBlock[] = [];

        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }

        for (const tc of msg.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }

        anthropicMessages.push({ role: "assistant", content: blocks });
      } else {
        // Plain text assistant message
        anthropicMessages.push({
          role: "assistant",
          content: msg.content ?? "",
        });
      }
      continue;
    }

    // User messages
    anthropicMessages.push({
      role: "user",
      content: msg.content ?? "",
    });
  }

  return { systemPrompt, anthropicMessages };
}

// ─── Tool Conversion ────────────────────────────────────

export function convertTool(tool: ToolDefinition): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

// ─── Helpers ────────────────────────────────────────────

export function mapStopReason(
  stopReason: string,
): "stop" | "tool_use" | "length" | "error" {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "length";
    default:
      return "stop";
  }
}
