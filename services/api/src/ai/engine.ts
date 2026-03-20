import type {
  AiMode,
  ConversationMessage,
  StreamEvent,
  EngineOptions,
} from "@doable/shared/types/ai.js";
import { DEFAULT_ENGINE_OPTIONS as defaultOptions } from "@doable/shared/types/ai.js";
import type { LLMProvider } from "./provider.js";
import type { ToolContext } from "./tools/index.js";
import { loadProjectContext } from "./context/index.js";
import { buildSystemPrompt } from "./context/injector.js";
import { runAgentMode } from "./modes/agent.js";
import { runPlanMode } from "./modes/plan.js";
import {
  textEvent,
  errorEvent,
  doneEvent,
  thinkingEvent,
} from "./streaming.js";
import { getProjectPath } from "./project-files.js";
import { sql } from "../db/index.js";
import { contextManager } from "../context/manager.js";
import { buildContextPrompt } from "../context/injector.js";

const ctxManager = contextManager(sql);

// ─── AI Engine ────────────────────────────────────────────

export class AIEngine {
  private provider: LLMProvider;
  private options: EngineOptions;

  constructor(provider: LLMProvider, options?: Partial<EngineOptions>) {
    this.provider = provider;
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Process a user message and stream back events.
   * Manages conversation history, routes to the correct mode handler,
   * and handles the tool-calling loop.
   */
  async *processMessage(
    projectId: string,
    userId: string,
    message: string,
    mode: AiMode,
    sessionId: string,
    history: ConversationMessage[] = [],
  ): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();

    try {
      // Load project context from file system (legacy)
      const context = await loadProjectContext(projectId);

      // Also load DB-backed context files and merge into system prompt
      let dbContextBlock = "";
      try {
        const dbFiles = await ctxManager.initializeContext(projectId);
        if (dbFiles.length > 0) {
          // Map AiMode to AiSessionMode for the injector
          dbContextBlock = buildContextPrompt(dbFiles, mode);
        }
      } catch {
        // DB context is optional — fall back to file-based context
      }

      const systemPrompt = buildSystemPrompt(context, mode);
      const fullSystemPrompt = dbContextBlock
        ? `${systemPrompt}\n\n${dbContextBlock}`
        : systemPrompt;

      // Build conversation messages
      const messages: ConversationMessage[] = [
        { role: "system", content: fullSystemPrompt },
        ...trimHistory(history),
        { role: "user", content: message },
      ];

      // Build tool context
      const toolCtx: ToolContext = {
        projectId,
        userId,
        sessionId,
        projectPath: getProjectPath(projectId),
      };

      // Route to mode handler
      const handler = this.getHandler(mode);

      yield* handler(this.provider, messages, toolCtx, this.options);

      // Post-processing: update memory after agent completes
      if (mode === "agent") {
        try {
          const summary = message.slice(0, 120).replace(/\n/g, " ");
          await ctxManager.appendToMemory(
            projectId,
            `User asked: "${summary}${message.length > 120 ? "..." : ""}" — AI completed task.`
          );
        } catch {
          // Non-critical
        }
      }

      // Emit done event
      yield doneEvent(Date.now() - startTime);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "An unexpected error occurred";

      yield errorEvent(errMsg, "ENGINE_ERROR", false);
      yield doneEvent(Date.now() - startTime);
    }
  }

  /**
   * Get the mode handler for the given mode.
   */
  private getHandler(
    mode: AiMode,
  ): (
    provider: LLMProvider,
    messages: ConversationMessage[],
    toolCtx: ToolContext,
    options: EngineOptions,
  ) => AsyncGenerator<StreamEvent> {
    switch (mode) {
      case "agent":
        return runAgentMode;
      case "plan":
        return runPlanMode;
      case "chat":
        return runChatMode;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  }

  /**
   * Update the LLM provider.
   */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * Update engine options.
   */
  setOptions(options: Partial<EngineOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// ─── Chat Mode (inline, simple) ───────────────────────────

async function* runChatMode(
  provider: LLMProvider,
  messages: ConversationMessage[],
  _toolCtx: ToolContext,
  options: EngineOptions,
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();

  // Chat mode: read-only tools only
  const readOnlyTools = (await import("./tools/index.js")).toolRegistry
    .getDefinitions()
    .filter((t) =>
      ["read_file", "list_files", "search_files"].includes(t.name),
    );

  try {
    for await (const chunk of provider.complete(messages, readOnlyTools, {
      maxTokens: 4096,
      temperature: 0.7,
    })) {
      if (Date.now() - startTime > options.maxDurationMs) {
        yield errorEvent("Request timed out", "TIMEOUT", false);
        return;
      }

      switch (chunk.type) {
        case "thinking":
          if (chunk.content) yield thinkingEvent(chunk.content);
          break;
        case "text":
          if (chunk.content) yield textEvent(chunk.content);
          break;
        case "error":
          yield errorEvent(
            chunk.content ?? "LLM error",
            "LLM_ERROR",
            true,
          );
          return;
        case "done":
          return;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield errorEvent(`Chat failed: ${msg}`, "LLM_ERROR", true);
  }
}

// ─── Helpers ──────────────────────────────────────────────

const MAX_HISTORY_MESSAGES = 50;

function trimHistory(
  history: ConversationMessage[],
): ConversationMessage[] {
  if (history.length <= MAX_HISTORY_MESSAGES) {
    return history;
  }

  // Keep the most recent messages, always preserving system messages
  const systemMessages = history.filter((m) => m.role === "system");
  const nonSystemMessages = history.filter((m) => m.role !== "system");

  const trimmed = nonSystemMessages.slice(-MAX_HISTORY_MESSAGES);
  return [...systemMessages, ...trimmed];
}
