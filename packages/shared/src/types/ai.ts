// ─── AI Engine Types ────────────────────────────────────────

export type AiMode = "agent" | "plan" | "chat";

// ─── Messages ──────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string;
  name?: string;
}

// ─── Tool System ───────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ─── Stream Events ─────────────────────────────────────────

export type StreamEventType =
  | "thinking"
  | "text"
  | "tool_call"
  | "tool_result"
  | "code_diff"
  | "error"
  | "done";

export interface StreamEvent {
  type: StreamEventType;
  data: StreamEventData;
  timestamp: number;
}

export type StreamEventData =
  | ThinkingEvent
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | CodeDiffEvent
  | ErrorEvent
  | DoneEvent;

export interface ThinkingEvent {
  content: string;
}

export interface TextEvent {
  content: string;
}

export interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
}

export interface CodeDiffEvent {
  filePath: string;
  diff: string;
  action: "create" | "edit" | "delete";
}

export interface ErrorEvent {
  message: string;
  code?: string;
  recoverable: boolean;
}

export interface DoneEvent {
  totalTokens?: number;
  duration: number;
}

// ─── LLM Provider ──────────────────────────────────────────

export interface StreamChunk {
  type: "text" | "tool_call" | "thinking" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  finishReason?: "stop" | "tool_use" | "length" | "error";
}

export interface LLMCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

// ─── Context Files ─────────────────────────────────────────

export type DoableContextFile =
  | "knowledge.md"
  | "instructions.md"
  | "identity.md"
  | "soul.md"
  | "memory.md"
  | "user.md"
  | "plan.md";

export interface ProjectContext {
  projectId: string;
  projectPath: string;
  contextFiles: Partial<Record<DoableContextFile, string>>;
}

// ─── Engine Options ────────────────────────────────────────

export interface EngineOptions {
  maxDurationMs: number;
  maxToolCalls: number;
  maxRetries: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  maxDurationMs: 15 * 60 * 1000, // 15 minutes
  maxToolCalls: 50,
  maxRetries: 3,
};
