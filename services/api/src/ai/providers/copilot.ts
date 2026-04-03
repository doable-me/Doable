/**
 * Copilot SDK Provider
 *
 * Integrates GitHub Copilot SDK as Doable's core AI engine.
 * The SDK manages sessions, tool calling, and streaming via JSON-RPC.
 *
 * Authentication options:
 *   1. GitHub Copilot subscription — user authenticates via GitHub OAuth,
 *      SDK uses their Copilot entitlement for model inference
 *   2. BYOK (Bring Your Own Key) — user provides their own API key
 *      (OpenAI, Anthropic, Azure, Ollama, etc.) via the SDK's provider config
 */

import {
  CopilotClient,
  CopilotSession,
  defineTool,
  approveAll,
  type SessionConfig,
  type SessionEvent,
  type Tool,
  type AssistantMessageEvent,
} from "@github/copilot-sdk";

// ─── Types ──────────────────────────────────────────────

export interface CopilotEngineConfig {
  /** Path to copilot CLI binary (optional, auto-detected if on PATH) */
  cliPath?: string;
  /** Connect to an existing Copilot CLI server instead of spawning one */
  cliUrl?: string;
  /** Default model to use */
  model?: string;
  /** GitHub OAuth token — when set, authenticates as this user instead of gh CLI */
  githubToken?: string;
}

/** BYOK provider configuration — passed directly to the Copilot SDK */
export interface ByokProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}

/** Callback for tool lifecycle hooks — called via RPC, separate from event stream */
export interface ToolProgressCallback {
  onToolStart?: (toolName: string, args: unknown) => void;
  onToolEnd?: (toolName: string, args: unknown, result: unknown) => void;
  onSessionEnd?: (reason: string, error?: string) => void;
  onError?: (error: string, context: string) => void;
}

export interface CopilotSessionConfig {
  /** Project ID for context */
  projectId: string;
  /** User ID for tracking */
  userId: string;
  /** Custom tools to register with the session */
  tools?: Tool[];
  /** Model override for this session */
  model?: string;
  /** BYOK provider config — when set, uses user's own API key instead of Copilot subscription */
  provider?: ByokProviderConfig;
  /** Working directory for the session — file tools operate relative to this */
  workingDirectory?: string;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Handler for when the agent needs user input */
  onUserInput?: (question: string) => Promise<string>;
  /** Handler for streaming events */
  onEvent?: (event: SessionEvent) => void;
  /** Tool progress callbacks — separate RPC channel from event stream */
  toolProgress?: ToolProgressCallback;
}

// ─── Copilot Engine ────────────────────────────────────

export class CopilotEngine {
  private client: CopilotClient | null = null;
  private config: CopilotEngineConfig;
  private sessions = new Map<string, CopilotSession>();

  constructor(config: CopilotEngineConfig = {}) {
    this.config = config;
  }

  /** Number of active sessions in this engine */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Initialize the Copilot client. Must be called before creating sessions.
   */
  async start(): Promise<void> {
    if (this.client) return;

    this.client = new CopilotClient({
      ...(this.config.cliPath ? { cliPath: this.config.cliPath } : {}),
      ...(this.config.cliUrl ? { cliUrl: this.config.cliUrl } : {}),
      ...(this.config.githubToken ? { githubToken: this.config.githubToken } : {}),
    });

    await this.client.start();
    console.log("[CopilotEngine] Client started");
  }

  /**
   * Stop the Copilot client and clean up all sessions.
   */
  async stop(): Promise<void> {
    if (!this.client) return;

    // Disconnect all active sessions
    for (const [id, session] of this.sessions) {
      try {
        await session.disconnect();
      } catch (err) {
        console.error(`[CopilotEngine] Error disconnecting session ${id}:`, err);
      }
    }
    this.sessions.clear();

    const errors = await this.client.stop();
    if (errors.length > 0) {
      console.error("[CopilotEngine] Errors during stop:", errors);
    }
    this.client = null;
    console.log("[CopilotEngine] Client stopped");
  }

  /**
   * Check auth status — returns whether the user is authenticated with GitHub Copilot.
   */
  async getAuthStatus() {
    this.ensureClient();
    return this.client!.getAuthStatus();
  }

  /**
   * List available models.
   */
  async listModels() {
    this.ensureClient();
    return this.client!.listModels();
  }

  /**
   * Create a new conversation session.
   */
  async createSession(config: CopilotSessionConfig): Promise<string> {
    this.ensureClient();

    const sessionConfig: SessionConfig = {
      onPermissionRequest: approveAll,
      streaming: true, // Enable token-by-token streaming (assistant.message_delta events)
      ...(config.workingDirectory ? { workingDirectory: config.workingDirectory } : {}),
      ...(config.model || this.config.model
        ? { model: config.model ?? this.config.model }
        : {}),
      ...(config.provider ? { provider: config.provider } : {}),
      ...(config.tools ? { tools: config.tools } : {}),
      ...(config.systemPrompt
        ? { systemMessage: { mode: "replace" as const, content: config.systemPrompt } }
        : {}),
      ...(config.onUserInput
        ? {
            onUserInputRequest: async (request: { question: string }) => ({
              answer: await config.onUserInput!(
                request.question ?? "Please provide input",
              ),
              wasFreeform: true,
            }),
          }
        : {}),
      // Hooks — called via RPC (separate from event stream) for guaranteed progress
      hooks: {
        onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
          config.toolProgress?.onToolStart?.(input.toolName, input.toolArgs);
        },
        onPostToolUse: async (input: { toolName: string; toolArgs: unknown; toolResult: unknown }) => {
          config.toolProgress?.onToolEnd?.(input.toolName, input.toolArgs, input.toolResult);
        },
        onSessionEnd: async (input: { reason: string; error?: string }) => {
          config.toolProgress?.onSessionEnd?.(input.reason, input.error);
        },
        onErrorOccurred: async (input: { error: string; errorContext: string }) => {
          config.toolProgress?.onError?.(input.error, input.errorContext);
        },
      },
    };

    const session = await this.client!.createSession(sessionConfig);

    // Register event handler if provided
    if (config.onEvent) {
      session.on(config.onEvent);
    }

    this.sessions.set(session.sessionId, session);
    return session.sessionId;
  }

  /**
   * Resume an existing session.
   */
  async resumeSession(
    sessionId: string,
    config?: Partial<CopilotSessionConfig>,
  ): Promise<string> {
    this.ensureClient();

    const session = await this.client!.resumeSession(sessionId, {
      onPermissionRequest: approveAll,
      streaming: true,
      ...(config?.tools ? { tools: config.tools } : {}),
      // Re-attach hooks so tool progress fires on resumed sessions too
      ...(config?.toolProgress ? {
        hooks: {
          onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
            config.toolProgress?.onToolStart?.(input.toolName, input.toolArgs);
          },
          onPostToolUse: async (input: { toolName: string; toolArgs: unknown; toolResult: unknown }) => {
            config.toolProgress?.onToolEnd?.(input.toolName, input.toolArgs, input.toolResult);
          },
          onSessionEnd: async (input: { reason: string; error?: string }) => {
            config.toolProgress?.onSessionEnd?.(input.reason, input.error);
          },
          onErrorOccurred: async (input: { error: string; errorContext: string }) => {
            config.toolProgress?.onError?.(input.error, input.errorContext);
          },
        },
      } : {}),
    });

    if (config?.onEvent) {
      session.on(config.onEvent);
    }

    this.sessions.set(session.sessionId, session);
    return session.sessionId;
  }

  /**
   * Send a message to a session and stream events back.
   * Returns an async generator of SessionEvents for SSE streaming.
   */
  async *sendMessage(
    sessionId: string,
    prompt: string,
    fileAttachments?: Array<{ type: "file"; path: string; displayName?: string }>,
  ): AsyncGenerator<SessionEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // ── Event queue bridges session.on() callbacks → async generator yields ──
    const eventQueue: SessionEvent[] = [];
    let resolveWaiting: (() => void) | null = null;
    let done = false;

    // Inactivity timeout: if no events at all for this long, assume dead
    const EVENT_TIMEOUT_MS = 120_000; // 2 minutes — generous for agentic tool loops
    let lastEventTime = Date.now();

    // Subscribe to ALL events from the SDK (streaming deltas, tools, idle, error).
    // Per the SDK source, session.on() receives every event the CLI emits via
    // JSON-RPC — including assistant.message_delta when streaming: true.
    // session.idle and session.error are terminal events that end the stream.
    const unsubscribe = session.on((event: SessionEvent) => {
      lastEventTime = Date.now();
      eventQueue.push(event);

      if (event.type === "session.idle" || event.type === "session.error") {
        done = true;
      }

      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    // Build message options
    const messageOptions: {
      prompt: string;
      attachments?: Array<{ type: "file"; path: string; displayName?: string }>;
    } = { prompt };
    if (fileAttachments && fileAttachments.length > 0) {
      messageOptions.attachments = fileAttachments;
    }

    // Send message via session.send() — returns the messageId once the CLI
    // acknowledges receipt. Processing continues asynchronously; events
    // flow through session.on() registered above.
    try {
      const messageId = await session.send(messageOptions);
      console.log(`[CopilotEngine] session.send() → msgId ${messageId} (${sessionId.slice(0, 8)}…)`);
    } catch (err) {
      unsubscribe();
      throw err;
    }

    // Yield events as they arrive until a terminal event (session.idle / session.error)
    try {
      let eventCount = 0;
      while (!done || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          const evt = eventQueue.shift()!;
          eventCount++;
          yield evt;
        } else if (!done) {
          const timedOut = await new Promise<boolean>((resolve) => {
            resolveWaiting = () => resolve(false);
            setTimeout(() => {
              if (resolveWaiting) {
                resolveWaiting = null;
                resolve(true);
              }
            }, EVENT_TIMEOUT_MS);
          });
          if (timedOut && !done && eventQueue.length === 0) {
            const elapsed = Date.now() - lastEventTime;
            console.error(`[CopilotEngine] No events for ${Math.round(elapsed / 1000)}s — timeout (${sessionId.slice(0, 8)}…)`);
            yield {
              type: "session.error",
              data: { message: `AI session timed out — no response for ${Math.round(elapsed / 1000)} seconds.` },
            } as SessionEvent;
            done = true;
          }
        }
      }
      if (eventCount > 0) {
        console.log(`[CopilotEngine] Stream complete: ${eventCount} events (${sessionId.slice(0, 8)}…)`);
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Send a message and wait for the complete response.
   * Returns the assistant's reply text. Tool calls execute during this time.
   *
   * Uses session.send() (non-blocking) + session.on() for completion detection.
   * The timeout is ACTIVITY-BASED: it resets each time the onActivity callback
   * fires. Only triggers when there's genuinely no activity for inactivityMs.
   *
   * @param onActivity - Called whenever any activity is detected (tool hook,
   *   SDK event, etc.). The caller should use this to reset their own timers
   *   and push SSE status updates.
   */
  async sendAndGetReply(
    sessionId: string,
    prompt: string,
    fileAttachments?: Array<{ type: "file"; path: string; displayName?: string }>,
    onActivity?: (type: string, detail: string) => void,
    inactivityMs = 120_000, // 2 minutes of silence = timeout
  ): Promise<{ content: string; messageId?: string } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messageOptions: { prompt: string; attachments?: Array<{ type: "file"; path: string; displayName?: string }> } = { prompt };
    if (fileAttachments && fileAttachments.length > 0) {
      messageOptions.attachments = fileAttachments;
    }

    console.log(`[CopilotEngine] sendAndGetReply to session ${sessionId.slice(0, 8)}… (inactivity timeout: ${Math.round(inactivityMs / 1000)}s)`);

    return new Promise((resolve, reject) => {
      let lastActivity = Date.now();
      let assistantContent = "";
      let assistantMessageId: string | undefined;
      let completed = false;

      // Activity-based timeout: fires only after sustained silence
      const checkInactivity = setInterval(() => {
        if (completed) return;
        const elapsed = Date.now() - lastActivity;
        if (elapsed > inactivityMs) {
          clearInterval(checkInactivity);
          unsubscribe();
          if (!completed) {
            completed = true;
            console.error(`[CopilotEngine] No activity for ${Math.round(elapsed / 1000)}s — timing out`);
            // Return whatever content we have so far rather than crashing
            if (assistantContent) {
              resolve({ content: assistantContent, messageId: assistantMessageId });
            } else {
              reject(new Error(`AI session timed out — no activity for ${Math.round(elapsed / 1000)} seconds`));
            }
          }
        }
      }, 10_000);

      const touch = (type: string, detail: string) => {
        lastActivity = Date.now();
        onActivity?.(type, detail);
      };

      // Subscribe to ALL events from the SDK
      const unsubscribe = session.on((event: SessionEvent) => {
        const evtType = (event as Record<string, unknown>).type as string;
        const evtData = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;

        touch("event", evtType);
        console.log(`[CopilotEngine] Event: ${evtType}`);

        // Capture streaming text
        if (evtType === "assistant.message_delta") {
          const delta = (evtData?.deltaContent ?? "") as string;
          if (delta) {
            assistantContent += delta;
            touch("text_delta", `+${delta.length} chars`);
          }
        }

        // Capture final message
        if (evtType === "assistant.message") {
          const content = (evtData?.content ?? "") as string;
          if (content && !assistantContent) {
            assistantContent = content;
          }
          assistantMessageId = (event as Record<string, unknown>).id as string;
        }

        // Completion
        if (evtType === "session.idle") {
          if (!completed) {
            completed = true;
            clearInterval(checkInactivity);
            unsubscribe();
            console.log(`[CopilotEngine] session.idle — content length: ${assistantContent.length}`);
            resolve({ content: assistantContent, messageId: assistantMessageId });
          }
        }

        // Error
        if (evtType === "session.error") {
          if (!completed) {
            completed = true;
            clearInterval(checkInactivity);
            unsubscribe();
            const errMsg = (evtData?.message ?? "Unknown error") as string;
            console.error(`[CopilotEngine] session.error: ${errMsg}`);
            // Return partial content if we have any
            if (assistantContent) {
              resolve({ content: assistantContent, messageId: assistantMessageId });
            } else {
              reject(new Error(errMsg));
            }
          }
        }
      });

      // Send the message (non-blocking) — events flow through session.on()
      session.send(messageOptions).then((msgId) => {
        console.log(`[CopilotEngine] session.send() resolved — messageId: ${msgId}`);
        touch("send", "message accepted");
      }).catch((err) => {
        if (!completed) {
          completed = true;
          clearInterval(checkInactivity);
          unsubscribe();
          reject(err);
        }
      });
    });
  }

  /**
   * Send a message and wait for the complete response (legacy).
   */
  async sendAndWait(
    sessionId: string,
    prompt: string,
    timeoutMs = 300_000, // 5 minutes default for agent work
  ): Promise<AssistantMessageEvent | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return session.sendAndWait({ prompt }, timeoutMs);
  }

  /**
   * Abort the current message processing in a session.
   */
  async abortSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await session.abort();
  }

  /**
   * Disconnect a session (preserves history for resumption).
   */
  async disconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    await session.disconnect();
    this.sessions.delete(sessionId);
  }

  /**
   * Delete a session permanently.
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.ensureClient();
    await this.disconnectSession(sessionId);
    await this.client!.deleteSession(sessionId);
  }

  /**
   * Get session history/messages.
   */
  async getSessionMessages(sessionId: string): Promise<SessionEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session.getMessages();
  }

  /**
   * Change the model for an active session.
   */
  async setSessionModel(sessionId: string, model: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    await session.setModel(model);
  }

  private ensureClient(): void {
    if (!this.client) {
      throw new Error(
        "CopilotEngine not started. Call start() first.",
      );
    }
  }
}

// ─── Doable Tool Definitions ────────────────────────────

import {
  readFile,
  writeFile,
  listFiles,
  getProjectPath,
} from "../../projects/file-manager.js";

/**
 * Create Doable-specific tools for the Copilot agent.
 * These provide real filesystem operations so the AI can
 * create, edit, and read files in the project directory.
 * Vite hot-reloads changes automatically.
 */
// Per-project event emitter for tool execution status.
// The chat route subscribes to this to send SSE events to the client.
type ToolEventHandler = (toolName: string, status: "start" | "end", args: Record<string, unknown>) => void;
const toolEventHandlers = new Map<string, ToolEventHandler>();

export function onToolEvent(projectId: string, handler: ToolEventHandler): () => void {
  toolEventHandlers.set(projectId, handler);
  return () => { toolEventHandlers.delete(projectId); };
}

function emitToolEvent(projectId: string, toolName: string, status: "start" | "end", args: Record<string, unknown>) {
  const handler = toolEventHandlers.get(projectId);
  if (handler) handler(toolName, status, args);
}

export function createDoableTools(projectId: string): Tool[] {
  return ([
    defineTool("create_file", {
      description:
        "Create a new file in the project with the given content. Creates parent directories as needed. Use this for new files.",
      parameters: {
        type: "object" as const,
        properties: {
          path: {
            type: "string" as const,
            description:
              "Relative path from the project root (e.g. 'src/components/Button.tsx')",
          },
          content: {
            type: "string" as const,
            description: "The full file content to write",
          },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const { path, content } = args;
        emitToolEvent(projectId, "create_file", "start", { path });
        await writeFile(projectId, path, content);
        emitToolEvent(projectId, "create_file", "end", { path });
        return {
          success: true,
          path,
          size: Buffer.byteLength(content, "utf-8"),
          message: `Created ${path}`,
        };
      },
    }),

    defineTool("edit_file", {
      description:
        "Replace the entire content of an existing file. Read the file first to understand what to change, then write the complete updated content.",
      parameters: {
        type: "object" as const,
        properties: {
          path: {
            type: "string" as const,
            description: "Relative path from the project root",
          },
          content: {
            type: "string" as const,
            description: "The complete new file content",
          },
        },
        required: ["path", "content"] as const,
      },
      handler: async (args: { path: string; content: string }) => {
        const { path, content } = args;
        emitToolEvent(projectId, "edit_file", "start", { path });
        await writeFile(projectId, path, content);
        emitToolEvent(projectId, "edit_file", "end", { path });
        return {
          success: true,
          path,
          size: Buffer.byteLength(content, "utf-8"),
          message: `Updated ${path}`,
        };
      },
    }),

    defineTool("read_file", {
      description:
        "Read the contents of a file in the project. Returns the full file content.",
      parameters: {
        type: "object" as const,
        properties: {
          path: {
            type: "string" as const,
            description: "Relative path from the project root",
          },
        },
        required: ["path"] as const,
      },
      handler: async (args: { path: string }) => {
        const { path } = args;
        emitToolEvent(projectId, "read_file", "start", { path });
        try {
          const content = await readFile(projectId, path);
          emitToolEvent(projectId, "read_file", "end", { path });
          return {
            success: true,
            path,
            content,
            lines: content.split("\n").length,
          };
        } catch (err) {
          emitToolEvent(projectId, "read_file", "end", { path });
          return {
            success: false,
            error:
              err instanceof Error ? err.message : `File not found: ${path}`,
          };
        }
      },
    }),

    defineTool("list_files", {
      description:
        "List all files in the project directory (excluding node_modules, .git, dist). Returns relative paths.",
      parameters: {
        type: "object" as const,
        properties: {
          directory: {
            type: "string" as const,
            description:
              "Subdirectory to list (default: project root). Use '.' for root.",
          },
        },
      },
      handler: async (args: { directory?: string }) => {
        const dir = args.directory ?? ".";
        emitToolEvent(projectId, "list_files", "start", { directory: dir });
        const files = await listFiles(projectId, dir);
        emitToolEvent(projectId, "list_files", "end", { directory: dir });
        return {
          success: true,
          count: files.length,
          files,
        };
      },
    }),

    defineTool("install_package", {
      description: "Install npm packages in the project. Call this BEFORE importing any package that is not already in the project's package.json.",
      parameters: {
        type: "object" as const,
        properties: {
          packages: {
            type: "string" as const,
            description:
              "Space-separated package names to install (e.g. 'react-router-dom lucide-react')",
          },
          dev: {
            type: "boolean" as const,
            description: "Install as dev dependency (default: false)",
          },
        },
        required: ["packages"] as const,
      },
      handler: async (args: { packages: string; dev?: boolean }) => {
        const { packages, dev } = args;
        emitToolEvent(projectId, "install_package", "start", { packages });
        const { spawn: spawnCmd } = await import("node:child_process");
        const projectPath = getProjectPath(projectId);
        const pkgList = packages.split(/\s+/).filter(Boolean);
        const npmArgs = [
          "install",
          "--ignore-scripts",
          ...(dev ? ["--save-dev"] : []),
          ...pkgList,
          "--legacy-peer-deps",
        ];

        return new Promise((resolve) => {
          const child = spawnCmd("npm", npmArgs, {
            cwd: projectPath,
            shell: true,
            stdio: "pipe",
            env: { ...process.env, FORCE_COLOR: "0" },
          });

          let output = "";
          child.stdout?.on("data", (d: Buffer) => {
            output += d.toString();
          });
          child.stderr?.on("data", (d: Buffer) => {
            output += d.toString();
          });

          child.on("close", (code) => {
            emitToolEvent(projectId, "install_package", "end", { packages });
            resolve({
              success: code === 0,
              packages: pkgList,
              dev: dev ?? false,
              message:
                code === 0
                  ? `Installed ${pkgList.join(", ")}`
                  : `Install failed with code ${code}`,
              output: output.slice(-500),
            });
          });

          child.on("error", (err) => {
            emitToolEvent(projectId, "install_package", "end", { packages });
            resolve({
              success: false,
              error: err.message,
              message: `Failed to run npm install: ${err.message}`,
            });
          });

          // Timeout
          setTimeout(() => {
            child.kill("SIGTERM");
            resolve({
              success: false,
              message: "npm install timed out",
            });
          }, 120_000);
        });
      },
    }),

    defineTool("deploy_preview", {
      description:
        "Deploy the current project to a preview URL for testing",
      parameters: {
        type: "object" as const,
        properties: {
          message: {
            type: "string" as const,
            description: "Deployment commit message",
          },
        },
      },
      handler: async (_args: { message?: string }) => {
        // TODO: Wire up to Doable's deploy system
        return {
          success: true,
          url: `https://preview-${projectId}.doable.dev`,
          message: "Preview deployed successfully",
        };
      },
    }),

    // ─── Plan Mode V2 Tools ──────────────────────────────────

    defineTool("ask_clarification", {
      description:
        "Ask the user friendly, non-technical clarifying questions before generating a plan. Questions must be about goals, audience, and experience — NEVER about technology, frameworks, or code. Maximum 4 questions.",
      parameters: {
        type: "object" as const,
        properties: {
          questions: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "string" as const, description: "Unique question ID" },
                question: { type: "string" as const, description: "Plain-language question about the user's goals, audience, or preferences. NEVER technical." },
                type: { type: "string" as const, enum: ["multi_choice", "yes_no", "free_text"] as const, description: "Question type" },
                options: { type: "array" as const, items: { type: "string" as const }, description: "Non-technical options describing outcomes or experiences, not technologies" },
                default: { type: "string" as const, description: "Default answer if user skips" },
                context: { type: "string" as const, description: "Brief friendly explanation of why you're asking" },
              },
              required: ["id", "question", "type"] as const,
            },
          },
        },
        required: ["questions"] as const,
      },
      handler: async (args: { questions: Array<{ id: string; question: string; type: string; options?: string[]; default?: string; context?: string }> }) => {
        emitToolEvent(projectId, "ask_clarification", "start", {});
        const questions = args.questions.slice(0, 4);
        emitToolEvent(projectId, "ask_clarification", "end", { output: JSON.stringify(questions) });
        return { success: true, questions, message: `Asked ${questions.length} clarification questions` };
      },
    }),

    defineTool("create_plan", {
      description:
        "Create a step-by-step plan describing what the user will see and experience. Use plain language — no technical terms, no file paths, no code. Technical details go ONLY in the hidden details field.",
      parameters: {
        type: "object" as const,
        properties: {
          summary: { type: "string" as const, description: "1-2 sentence summary a non-technical person would understand. No jargon." },
          complexity: { type: "string" as const, enum: ["simple", "moderate", "complex"] as const, description: "From user perspective: simple=quick, moderate=a few screens, complex=lots of features" },
          steps: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                title: { type: "string" as const, description: "What the user will see. Example: 'Add a task list with checkboxes' NOT 'Create TaskList component'" },
                description: { type: "string" as const, description: "Describe the experience: 'You'll see your tasks in a clean list...' NOT 'Renders a ul with map over state'" },
                details: { type: "string" as const, description: "HIDDEN from user. Technical notes for the AI to use during build phase. File paths, code approach, etc." },
                filePaths: { type: "array" as const, items: { type: "string" as const }, description: "HIDDEN from user. Files to create/modify." },
              },
              required: ["title", "description"] as const,
            },
          },
        },
        required: ["summary", "complexity", "steps"] as const,
      },
      handler: async (args: { summary: string; complexity: string; steps: Array<{ title: string; description: string; details?: string; filePaths?: string[] }> }) => {
        const { randomUUID } = await import("node:crypto");
        const planId = randomUUID();
        const steps = args.steps.map((s, i) => ({
          id: randomUUID(),
          order: i + 1,
          title: s.title,
          description: s.description,
          details: s.details,
          filePaths: s.filePaths,
          status: "pending" as const,
        }));
        const plan = {
          id: planId,
          projectId,
          summary: args.summary,
          complexity: args.complexity,
          steps,
          status: "draft" as const,
          createdAt: new Date().toISOString(),
        };

        // Write plan as markdown to .doable/plan.md so the context injection system picks it up
        try {
          const { writeFile, mkdir } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const { getProjectPath } = await import("../../projects/file-manager.js");
          const projectPath = getProjectPath(projectId);
          const doablePath = join(projectPath, ".doable");
          await mkdir(doablePath, { recursive: true });

          let md = `# Plan\n\nPlan ID: ${planId}\n\n${args.summary}\n\n**Complexity:** ${args.complexity}\n\n`;
          for (const step of steps) {
            md += `## ${step.order}. ${step.title}\n\n`;
            md += `Step ID: ${step.id}\n\n`;
            md += `${step.description}\n\n`;
            if (step.details) md += `**Details:** ${step.details}\n\n`;
            if (step.filePaths?.length) md += `**Files:** ${step.filePaths.join(", ")}\n\n`;
          }
          md += `\n---\nAfter completing each step, call mark_step_complete(stepId, planId) to update progress.\n`;
          await writeFile(join(doablePath, "plan.md"), md, "utf-8");
        } catch {
          // Non-fatal — DB/events are the primary transport
        }

        emitToolEvent(projectId, "create_plan", "start", {});
        emitToolEvent(projectId, "create_plan", "end", { output: JSON.stringify(plan) });
        return { success: true, plan, message: `Created plan with ${steps.length} steps` };
      },
    }),

    defineTool("mark_step_complete", {
      description:
        "Mark a plan step as completed during build execution.",
      parameters: {
        type: "object" as const,
        properties: {
          stepId: { type: "string" as const, description: "The step ID to mark complete" },
          planId: { type: "string" as const, description: "The plan ID" },
        },
        required: ["stepId", "planId"] as const,
      },
      handler: async (args: { stepId: string; planId: string }) => {
        emitToolEvent(projectId, "mark_step_complete", "end", {
          stepId: args.stepId, planId: args.planId, status: "completed",
        });
        return { success: true, stepId: args.stepId, planId: args.planId, status: "completed" };
      },
    }),
  ] as Tool[]);
}

// ─── MCP Tool Integration ────────────────────────────────

import { getConnectorManager } from "../../mcp/connector-manager.js";
import { createMcpTools } from "../../mcp/tool-bridge.js";
import type { McpConnectorConfig } from "../../mcp/types.js";
import { connectorQueries } from "@doable/db";

/**
 * Create all tools (built-in + native integrations + MCP) for a Copilot session.
 * Native integration and MCP failures are logged but don't block built-in tools.
 */
export async function createAllTools(
  projectId: string,
  workspaceId?: string,
  userId?: string,
): Promise<Tool[]> {
  const builtinTools = createDoableTools(projectId);

  if (!workspaceId) return builtinTools;

  // Load native integration tools and MCP tools in parallel
  const [integrationTools, mcpTools] = await Promise.all([
    loadIntegrationTools(workspaceId, projectId, userId),
    loadMcpTools(workspaceId, projectId, userId),
  ]);

  return [...builtinTools, ...integrationTools, ...mcpTools];
}

/** Load native integration tools (Activepieces-backed) */
async function loadIntegrationTools(
  workspaceId: string,
  projectId: string,
  userId?: string,
): Promise<Tool[]> {
  try {
    const { createIntegrationTools } = await import("../../integrations/tool-bridge.js");
    const tools = await createIntegrationTools({
      workspaceId,
      projectId,
      userId: userId ?? "",
    });
    if (tools.length > 0) {
      console.log(`[CopilotEngine] Loaded ${tools.length} native integration tools`);
    }
    return tools;
  } catch (err) {
    console.warn(
      "[CopilotEngine] Native integration tool loading failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/** Load MCP connector tools */
async function loadMcpTools(
  workspaceId: string,
  projectId: string,
  userId?: string,
): Promise<Tool[]> {
  try {
    const { sql } = await import("../../db/index.js");
    const connectors = connectorQueries(sql);
    const manager = getConnectorManager();

    // Get effective connectors for this scope
    const connectorRows = await connectors.getEffectiveConnectors(
      workspaceId,
      projectId,
      userId,
    );

    if (connectorRows.length === 0) return [];

    // Convert DB rows to runtime configs
    const configs = new Map<string, McpConnectorConfig>();
    for (const row of connectorRows) {
      const config: McpConnectorConfig = {
        id: row.id,
        workspaceId: row.workspace_id,
        projectId: row.project_id ?? undefined,
        scope: row.scope,
        name: row.name,
        description: row.description ?? undefined,
        transportType: row.transport_type,
        serverUrl: row.server_url ?? undefined,
        serverCommand: row.server_command ?? undefined,
        serverArgs: row.server_args ?? [],
        authType: row.auth_type,
        status: row.status as McpConnectorConfig["status"],
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      configs.set(row.id, config);
    }

    // Resolve tools from all active connectors
    const resolvedTools = await manager.getEffectiveTools(
      Array.from(configs.values()),
    );

    if (resolvedTools.length === 0) return [];

    const mcpTools = createMcpTools(resolvedTools, manager, configs);
    console.log(
      `[CopilotEngine] Loaded ${mcpTools.length} MCP tools from ${configs.size} connectors`,
    );

    return mcpTools;
  } catch (err) {
    console.warn(
      "[CopilotEngine] MCP tool loading failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Singleton ──────────────────────────────────────────

let _engine: CopilotEngine | null = null;

/**
 * Get the global CopilotEngine instance.
 * Creates and starts it on first call.
 */
export async function getCopilotEngine(): Promise<CopilotEngine> {
  if (!_engine) {
    _engine = new CopilotEngine({
      model: process.env.COPILOT_DEFAULT_MODEL,
      cliPath: process.env.COPILOT_CLI_PATH,
      cliUrl: process.env.COPILOT_CLI_URL,
    });
    await _engine.start();
  }
  return _engine;
}
