import type {
  ConversationMessage,
  LLMCompletionOptions,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "@doable/shared/types/ai.js";

// ─── LLM Provider Interface ───────────────────────────────

export interface LLMProvider {
  readonly name: string;
  complete(
    messages: ConversationMessage[],
    tools?: ToolDefinition[],
    options?: LLMCompletionOptions,
  ): AsyncGenerator<StreamChunk>;
}

// ─── Mock Provider (for testing) ───────────────────────────

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  private responses: Map<string, string> = new Map();

  setResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }

  async *complete(
    messages: ConversationMessage[],
    _tools?: ToolDefinition[],
    _options?: LLMCompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    const lastMessage = messages.findLast((m: ConversationMessage) => m.role === "user");
    const userContent = lastMessage?.content ?? "";

    // Check for matching response patterns
    let responseText = "I understand your request. How can I help you build this?";
    for (const [pattern, response] of this.responses) {
      if (userContent.toLowerCase().includes(pattern.toLowerCase())) {
        responseText = response;
        break;
      }
    }

    // Simulate streaming by yielding words
    const words = responseText.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunk = i < words.length - 1 ? `${words[i]} ` : words[i]!;
      yield { type: "text" as const, content: chunk };
      await delay(10);
    }

    yield { type: "done" as const, finishReason: "stop" as const };
  }
}

// ─── Mock Provider with Tool Support ───────────────────────

export class MockToolProvider implements LLMProvider {
  readonly name = "mock-tool";

  private toolCallQueue: ToolCall[] = [];

  queueToolCall(toolCall: ToolCall): void {
    this.toolCallQueue.push(toolCall);
  }

  async *complete(
    messages: ConversationMessage[],
    tools?: ToolDefinition[],
    _options?: LLMCompletionOptions,
  ): AsyncGenerator<StreamChunk> {
    // If tool calls are queued, emit them
    if (this.toolCallQueue.length > 0) {
      const toolCall = this.toolCallQueue.shift()!;

      if (tools?.some((t) => t.name === toolCall.name)) {
        yield { type: "tool_call" as const, toolCall };
        yield { type: "done" as const, finishReason: "tool_use" as const };
        return;
      }
    }

    // Otherwise return a text response
    yield { type: "text" as const, content: "Task completed successfully." };
    yield { type: "done" as const, finishReason: "stop" as const };
  }
}

// ─── Helpers ───────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
