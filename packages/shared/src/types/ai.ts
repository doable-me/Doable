// ─── AI Engine Types ────────────────────────────────────────

export type AiMode = "agent" | "plan" | "chat";

// ─── Plan Mode V2 ─────────────────────────────────────────

export type PlanStatus = "draft" | "approved" | "in_progress" | "completed" | "abandoned";
export type PlanStepStatus = "pending" | "in_progress" | "completed" | "skipped";
export type PlanComplexity = "simple" | "moderate" | "complex";
export type PlanPhase = "idle" | "clarifying" | "planning" | "reviewing" | "building";

export type ClarificationQuestionType = "multi_choice" | "yes_no" | "free_text";

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: ClarificationQuestionType;
  options?: string[];
  default?: string;
  context?: string;
}

export interface PlanStep {
  id: string;
  order: number;
  title: string;
  description: string;
  details?: string;
  status: PlanStepStatus;
  filePaths?: string[];
}

export interface Plan {
  id: string;
  projectId: string;
  summary: string;
  complexity: PlanComplexity;
  steps: PlanStep[];
  status: PlanStatus;
  originalPrompt?: string;
  clarificationAnswers?: Record<string, string>;
  createdAt: string;
  approvedAt?: string;
  completedAt?: string;
}

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
  | "done"
  | "clarification"
  | "plan"
  | "plan_step_update";

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
  | DoneEvent
  | ClarificationEvent
  | PlanEvent
  | PlanStepUpdateEvent;

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

export interface ClarificationEvent {
  questions: ClarificationQuestion[];
}

export interface PlanEvent {
  plan: Plan;
}

export interface PlanStepUpdateEvent {
  planId: string;
  stepId: string;
  status: PlanStepStatus;
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
  // Core (always injected)
  | "identity.md"
  | "soul.md"
  | "user.md"
  | "instructions.md"
  | "knowledge.md"
  | "plan.md"
  | "memory.md"
  // Session lifecycle
  | "boot.md"
  | "tools.md"
  | "heartbeat.md"
  | "bootstrap.md"
  // Architecture & design
  | "design-system.md"
  | "schema.md"
  | "architecture.md"
  | "api-reference.md"
  // Agent & skill definitions
  | "agents.md";

/** Scope levels for context files, skills, rules, and connectors */
export type ContextScope = "workspace" | "project" | "user";

/** Merge strategy when combining scopes */
export type ContextMergeStrategy = "replace" | "append";

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
