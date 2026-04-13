/**
 * Anthropic LLM Provider
 *
 * Direct HTTP integration with the Anthropic Messages API.
 * Uses fetch + SSE streaming — no external SDK dependency.
 */

import type {
  ConversationMessage,
  LLMCompletionOptions,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "@doable/shared/types/ai.js";
import type { LLMProvider } from "../provider.js";
import type {
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicTool,
  AnthropicRequestBody,
} from "./anthropic-types.js";
import { convertMessages, convertTool, mapStopReason } from "./anthropic-helpers.js";

// ─── Provider Implementation ────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? "claude-sonnet-4-20250514";
  }

  async *complete(
    messages: ConversationMessage[],
    tools?: ToolDefinition[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    const { systemPrompt, anthropicMessages } =
      convertMessages(messages);

    const anthropicTools = tools?.map(convertTool);

    const body: AnthropicRequestBody = {
      model: options?.model ?? this.model,
      max_tokens: options?.maxTokens ?? 8192,
      messages: anthropicMessages,
      stream: true,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(anthropicTools && anthropicTools.length > 0
        ? { tools: anthropicTools }
        : {}),
      ...(options?.temperature != null
        ? { temperature: options.temperature }
        : {}),
      ...(options?.stopSequences && options.stopSequences.length > 0
        ? { stop_sequences: options.stopSequences }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Anthropic API request failed: ${msg}` };
      yield { type: "done", finishReason: "error" };
      return;
    }

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
      yield {
        type: "error",
        content: `Anthropic API error ${response.status}: ${errorBody}`,
      };
      yield { type: "done", finishReason: "error" };
      return;
    }

    // Parse SSE stream
    yield* this.parseSSEStream(response);
  }

  private async *parseSSEStream(
    response: Response,
  ): AsyncGenerator<StreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", content: "No response body" };
      yield { type: "done", finishReason: "error" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    // Track tool use blocks being accumulated
    let currentToolId = "";
    let currentToolName = "";
    let currentToolJson = "";
    let currentBlockType = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        let eventType = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
            continue;
          }

          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);

            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            const chunks = this.handleSSEEvent(
              eventType,
              data,
              {
                currentToolId,
                currentToolName,
                currentToolJson,
                currentBlockType,
              },
            );

            for (const result of chunks) {
              if (result.stateUpdate) {
                currentToolId = result.stateUpdate.currentToolId ?? currentToolId;
                currentToolName =
                  result.stateUpdate.currentToolName ?? currentToolName;
                currentToolJson =
                  result.stateUpdate.currentToolJson ?? currentToolJson;
                currentBlockType =
                  result.stateUpdate.currentBlockType ?? currentBlockType;
              }
              if (result.chunk) {
                yield result.chunk;
              }
            }

            eventType = "";
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle a single SSE event and return chunks to yield + state updates.
   */
  private handleSSEEvent(
    eventType: string,
    data: Record<string, unknown>,
    state: {
      currentToolId: string;
      currentToolName: string;
      currentToolJson: string;
      currentBlockType: string;
    },
  ): Array<{
    chunk?: StreamChunk;
    stateUpdate?: Partial<{
      currentToolId: string;
      currentToolName: string;
      currentToolJson: string;
      currentBlockType: string;
    }>;
  }> {
    const results: Array<{
      chunk?: StreamChunk;
      stateUpdate?: Partial<{
        currentToolId: string;
        currentToolName: string;
        currentToolJson: string;
        currentBlockType: string;
      }>;
    }> = [];

    switch (eventType) {
      case "content_block_start": {
        const contentBlock = data.content_block as Record<string, unknown> | undefined;
        if (!contentBlock) break;

        if (contentBlock.type === "tool_use") {
          results.push({
            stateUpdate: {
              currentBlockType: "tool_use",
              currentToolId: String(contentBlock.id ?? ""),
              currentToolName: String(contentBlock.name ?? ""),
              currentToolJson: "",
            },
          });
        } else if (contentBlock.type === "text") {
          results.push({
            stateUpdate: { currentBlockType: "text" },
          });
        }
        break;
      }

      case "content_block_delta": {
        const delta = data.delta as Record<string, unknown> | undefined;
        if (!delta) break;

        if (delta.type === "text_delta") {
          const text = String(delta.text ?? "");
          if (text) {
            results.push({
              chunk: { type: "text", content: text },
            });
          }
        } else if (delta.type === "input_json_delta") {
          const partialJson = String(delta.partial_json ?? "");
          results.push({
            stateUpdate: {
              currentToolJson: state.currentToolJson + partialJson,
            },
          });
        } else if (delta.type === "thinking_delta") {
          const thinking = String(delta.thinking ?? "");
          if (thinking) {
            results.push({
              chunk: { type: "thinking", content: thinking },
            });
          }
        }
        break;
      }

      case "content_block_stop": {
        if (state.currentBlockType === "tool_use") {
          let toolArgs: Record<string, unknown> = {};
          try {
            if (state.currentToolJson) {
              toolArgs = JSON.parse(state.currentToolJson) as Record<
                string,
                unknown
              >;
            }
          } catch {
            // If JSON parsing fails, pass empty args
          }

          const toolCall: ToolCall = {
            id: state.currentToolId,
            name: state.currentToolName,
            arguments: toolArgs,
          };

          results.push({
            chunk: { type: "tool_call", toolCall },
            stateUpdate: {
              currentBlockType: "",
              currentToolId: "",
              currentToolName: "",
              currentToolJson: "",
            },
          });
        }
        break;
      }

      case "message_delta": {
        const messageDelta = data.delta as Record<string, unknown> | undefined;
        if (!messageDelta) break;

        const stopReason = messageDelta.stop_reason as string | undefined;
        if (stopReason) {
          const finishReason = mapStopReason(stopReason);
          results.push({
            chunk: { type: "done", finishReason },
          });
        }
        break;
      }

      case "error": {
        const error = data.error as Record<string, unknown> | undefined;
        const errorMsg = error
          ? String(error.message ?? "Unknown Anthropic stream error")
          : "Unknown Anthropic stream error";
        results.push({
          chunk: { type: "error", content: errorMsg },
        });
        results.push({
          chunk: { type: "done", finishReason: "error" },
        });
        break;
      }

      // message_start, ping, etc. — ignored
      default:
        break;
    }

    return results;
  }
}
