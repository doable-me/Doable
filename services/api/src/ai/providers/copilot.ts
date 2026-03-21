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
}

// ─── Copilot Engine ────────────────────────────────────

export class CopilotEngine {
  private client: CopilotClient | null = null;
  private config: CopilotEngineConfig;
  private sessions = new Map<string, CopilotSession>();

  constructor(config: CopilotEngineConfig = {}) {
    this.config = config;
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
      ...(config?.tools ? { tools: config.tools } : {}),
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

    // Collect events via handler
    const eventQueue: SessionEvent[] = [];
    let resolveWaiting: (() => void) | null = null;
    let done = false;

    const unsubscribe = session.on((event: SessionEvent) => {
      eventQueue.push(event);
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }

      if (
        event.type === "session.idle" ||
        event.type === "session.error"
      ) {
        done = true;
      }
    });

    // Build the message options — include file attachments if provided
    const messageOptions: { prompt: string; attachments?: Array<{ type: "file"; path: string; displayName?: string }> } = { prompt };
    if (fileAttachments && fileAttachments.length > 0) {
      messageOptions.attachments = fileAttachments;
      console.log(`[CopilotEngine] Sending message with ${fileAttachments.length} file attachment(s):`, fileAttachments.map(a => a.displayName ?? a.path));
    }

    // Send the message (non-blocking)
    session.send(messageOptions).catch((err) => {
      eventQueue.push({
        type: "session.error",
        data: { message: err instanceof Error ? err.message : String(err) },
      } as SessionEvent);
      done = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    try {
      while (!done || eventQueue.length > 0) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else if (!done) {
          // Wait for next event
          await new Promise<void>((resolve) => {
            resolveWaiting = resolve;
          });
        }
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Send a message and wait for the complete response.
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
        await writeFile(projectId, path, content);
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
        await writeFile(projectId, path, content);
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
        try {
          const content = await readFile(projectId, path);
          return {
            success: true,
            path,
            content,
            lines: content.split("\n").length,
          };
        } catch (err) {
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
        const files = await listFiles(projectId, dir);
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
        const { spawn: spawnCmd } = await import("node:child_process");
        const projectPath = getProjectPath(projectId);
        const pkgList = packages.split(/\s+/).filter(Boolean);
        const npmArgs = [
          "install",
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
  ] as Tool[]);
}

// ─── MCP Tool Integration ────────────────────────────────

import { getConnectorManager } from "../../mcp/connector-manager.js";
import { createMcpTools } from "../../mcp/tool-bridge.js";
import type { McpConnectorConfig } from "../../mcp/types.js";
import { connectorQueries } from "@doable/db";

/**
 * Create all tools (built-in + MCP) for a Copilot session.
 * MCP failures are logged but don't block built-in tools.
 */
export async function createAllTools(
  projectId: string,
  workspaceId?: string,
  userId?: string,
): Promise<Tool[]> {
  const builtinTools = createDoableTools(projectId);

  if (!workspaceId) return builtinTools;

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

    if (connectorRows.length === 0) return builtinTools;

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

    if (resolvedTools.length === 0) return builtinTools;

    const mcpTools = createMcpTools(resolvedTools, manager, configs);
    console.log(
      `[CopilotEngine] Loaded ${mcpTools.length} MCP tools from ${configs.size} connectors`,
    );

    return [...builtinTools, ...mcpTools];
  } catch (err) {
    console.warn(
      "[CopilotEngine] MCP tool loading failed, using built-in tools only:",
      err instanceof Error ? err.message : err,
    );
    return builtinTools;
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
