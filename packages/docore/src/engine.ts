/**
 * docore engine
 *
 * Wraps CopilotClient + CopilotSession and translates every SDK session event
 * into a normalized DoCoreEvent emitted on the EventBus.
 *
 * Architecture:
 *   Vite frontend  <-->  docore engine (this file)  <-->  @github/copilot-sdk  <-->  Copilot CLI
 *                  IPC / WS / direct import
 */

import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type SessionEvent,
  type CopilotClientOptions,
  type SessionConfig,
  type ResumeSessionConfig,
  type PermissionHandler,
  type CustomAgentConfig,
} from "@github/copilot-sdk";

import { EventBus } from "./event-bus.js";
import type { DoCoreEvent } from "./events.js";
import { mapSdkEvent } from "./event-mapper.js";
import { Tracer, noopTracer } from "./tracer.js";
import type { SpanHandle } from "./tracer.js";

// ============================================================================
// Public configuration
// ============================================================================

export interface DoCoreEngineOptions {
  /** Options forwarded to CopilotClient (ignored when using DoCorePool) */
  clientOptions?: CopilotClientOptions;
  /** Model to use (e.g. "gpt-4o", "claude-sonnet-4") */
  model?: string;
  /** Working directory for the session */
  workingDirectory?: string;
  /** Enable streaming deltas (assistant.message_delta, assistant.reasoning_delta) */
  streaming?: boolean;
  /** Permission handler. Defaults to approveAll. */
  onPermissionRequest?: PermissionHandler;
  /** User input handler (enables ask_user tool). If not set, the engine auto-accepts. */
  onUserInputRequest?: SessionConfig["onUserInputRequest"];
  /** Elicitation handler. If not set, the engine auto-declines. */
  onElicitationRequest?: any;
  /** Custom agents available in this session. */
  customAgents?: CustomAgentConfig[];
  /** Pre-select a custom agent on session start (must match a name in customAgents). */
  agent?: string;
  /** Custom session config overrides (merged last) */
  sessionConfig?: Partial<SessionConfig>;
  /** Tracer for span-level observability (engine.connect, engine.send, etc.) */
  tracer?: Tracer;
  /** @internal Used by DoCorePool to inject a shared client. Do not set directly. */
  _sharedClient?: CopilotClient;
}

export type EngineState = "idle" | "connecting" | "ready" | "working" | "error" | "disconnected";

// ============================================================================
// Engine
// ============================================================================

export class DoCoreEngine {
  readonly events = new EventBus();

  private client: CopilotClient | null = null;
  private session: CopilotSession | null = null;
  private options: DoCoreEngineOptions;
  private _state: EngineState = "idle";
  private unsubscribeSdkEvents: (() => void) | null = null;
  /** True when this engine created (owns) the client. False when shared via pool. */
  private ownsClient = false;
  private tracer: Tracer;

  /**
   * Tracks running background subagents by toolCallId.
   * Used to enrich session.background_tasks_changed and session.idle
   * with accurate "truly done" info.
   */
  private runningSubagents = new Set<string>();

  constructor(options: DoCoreEngineOptions = {}) {
    this.options = options;
    this.tracer = options.tracer ?? noopTracer;
  }

  get state(): EngineState { return this._state; }
  get sessionId(): string | undefined { return this.session?.sessionId; }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async connect(): Promise<void> {
    const span = this.tracer.start("engine.connect", {
      model: this.options.model,
      workingDirectory: this.options.workingDirectory,
      streaming: this.options.streaming ?? true,
      poolMode: !!this.options._sharedClient,
    });

    this.setState("connecting");
    this.emit({ kind: "engine.connecting", timestamp: iso() });

    try {
      if (this.options._sharedClient) {
        // Pool mode: reuse the shared client (already started)
        this.client = this.options._sharedClient;
        this.ownsClient = false;
      } else {
        // Standalone mode: create and own a new client
        this.client = new CopilotClient(this.options.clientOptions);
        this.ownsClient = true;
      }

      const sessionConfig: SessionConfig & Record<string, any> = {
        model: this.options.model,
        workingDirectory: this.options.workingDirectory,
        streaming: this.options.streaming ?? true,
        onPermissionRequest: this.options.onPermissionRequest ?? approveAll,
        onUserInputRequest: this.options.onUserInputRequest,
        onElicitationRequest: this.options.onElicitationRequest,
        customAgents: this.options.customAgents,
        agent: this.options.agent,
        ...this.options.sessionConfig,
      };

      this.session = await this.client.createSession(sessionConfig);
      this.wireAllEvents(this.session);

      this.setState("ready");
      this.emit({ kind: "engine.ready", timestamp: iso() });
      span.end({ sessionId: this.session.sessionId });
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Resume an existing session by ID instead of creating a new one.
   * Same lifecycle as connect(), but reconnects to a previous session.
   */
  async resume(sessionId: string, config?: Partial<ResumeSessionConfig>): Promise<void> {
    const span = this.tracer.start("engine.resume", { sessionId });

    this.setState("connecting");
    this.emit({ kind: "engine.connecting", timestamp: iso() });

    try {
      if (this.options._sharedClient) {
        this.client = this.options._sharedClient;
        this.ownsClient = false;
      } else {
        this.client = new CopilotClient(this.options.clientOptions);
        this.ownsClient = true;
      }

      const resumeConfig: ResumeSessionConfig = {
        onPermissionRequest: this.options.onPermissionRequest ?? approveAll,
        streaming: this.options.streaming ?? true,
        workingDirectory: this.options.workingDirectory,
        ...this.options.sessionConfig,
        ...config,
      };

      this.session = await this.client.resumeSession(sessionId, resumeConfig);
      this.wireAllEvents(this.session);

      this.setState("ready");
      this.emit({ kind: "engine.ready", timestamp: iso() });
      span.end();
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Delete a session permanently from the CLI state.
   * The engine must have a connected client (call after connect/resume, before disconnect).
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.client) throw new Error("Not connected. Call connect() or resume() first.");
    await this.client.deleteSession(sessionId);
  }

  /**
   * Get the auth status for the current client.
   */
  async getAuthStatus() {
    if (!this.client) throw new Error("Not connected.");
    return this.client.getAuthStatus();
  }

  /**
   * List available models.
   */
  async listModels() {
    if (!this.client) throw new Error("Not connected.");
    return this.client.listModels();
  }

  /**
   * Change the model for the active session.
   */
  async setModel(model: string): Promise<void> {
    if (!this.session) throw new Error("No active session.");
    await this.session.setModel(model);
  }

  /**
   * Get session history/messages.
   */
  async getMessages(): Promise<SessionEvent[]> {
    if (!this.session) throw new Error("No active session.");
    return this.session.getMessages() as Promise<SessionEvent[]>;
  }

  async disconnect(): Promise<void> {
    const span = this.tracer.start("engine.disconnect", {
      sessionId: this.session?.sessionId,
      ownsClient: this.ownsClient,
    });
    try {
      if (this.unsubscribeSdkEvents) {
        this.unsubscribeSdkEvents();
        this.unsubscribeSdkEvents = null;
      }
      if (this.session) {
        await this.session.disconnect();
        this.session = null;
      }
      // Only stop client if we own it (standalone mode). Pool manages its own clients.
      if (this.client && this.ownsClient) {
        await this.client.stop();
      }
      this.client = null;
      this.setState("disconnected");
      this.emit({ kind: "engine.disconnected", timestamp: iso() });
      span.end();
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Disconnect only the session, leaving the shared client alive.
   * Used internally by DoCorePool. External callers should use disconnect().
   */
  async disconnectSession(): Promise<void> {
    if (this.unsubscribeSdkEvents) {
      this.unsubscribeSdkEvents();
      this.unsubscribeSdkEvents = null;
    }
    if (this.session) {
      await this.session.disconnect();
      this.session = null;
    }
    this.client = null; // release reference, don't stop
    this.setState("disconnected");
    this.emit({ kind: "engine.disconnected", timestamp: iso() });
  }

  // --------------------------------------------------------------------------
  // Messaging
  // --------------------------------------------------------------------------

  /** Send a prompt. Returns the messageId. Events stream via the EventBus. */
  async send(prompt: string, attachments?: SessionConfig["tools"]): Promise<string> {
    if (!this.session) throw new Error("Not connected. Call connect() first.");
    const span = this.tracer.start("engine.send", {
      promptLength: prompt.length,
      sessionId: this.session.sessionId,
    });
    this.setState("working");
    try {
      const messageId = await this.session.send({ prompt });
      span.end({ messageId });
      return messageId;
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** Send a prompt and wait until the session goes idle. */
  async sendAndWait(prompt: string, timeoutMs?: number) {
    if (!this.session) throw new Error("Not connected. Call connect() first.");
    const span = this.tracer.start("engine.sendAndWait", {
      promptLength: prompt.length,
      sessionId: this.session.sessionId,
      timeoutMs: timeoutMs ?? null,
    });
    this.setState("working");
    try {
      const result = await this.session.sendAndWait({ prompt }, timeoutMs);
      span.end();
      return result;
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /** Abort the current turn. */
  async abort(): Promise<void> {
    if (!this.session) return;
    await this.session.abort();
  }

  // --------------------------------------------------------------------------
  // Mode (interactive / plan / autopilot)
  // --------------------------------------------------------------------------

  /** Get the current execution mode. */
  async getMode(): Promise<"interactive" | "plan" | "autopilot"> {
    const result = await this.rpc.mode.get();
    return result.mode;
  }

  /** Switch execution mode. */
  async setMode(mode: "interactive" | "plan" | "autopilot"): Promise<void> {
    await this.rpc.mode.set({ mode });
  }

  // --------------------------------------------------------------------------
  // Plan file
  // --------------------------------------------------------------------------

  /** Read the plan file. Returns null if no plan exists. */
  async readPlan(): Promise<{ content: string; path: string } | null> {
    const result = await this.rpc.plan.read();
    if (!result.exists || result.content === null) return null;
    return { content: result.content, path: result.path };
  }

  /** Create or update the plan file. */
  async updatePlan(content: string): Promise<void> {
    await this.rpc.plan.update({ content });
  }

  /** Delete the plan file. */
  async deletePlan(): Promise<void> {
    await this.rpc.plan.delete();
  }

  // --------------------------------------------------------------------------
  // Custom agents
  // --------------------------------------------------------------------------

  /** List all registered custom agents. */
  async listAgents(): Promise<Array<{ name: string; displayName: string; description: string }>> {
    const result = await this.rpc.agent.list();
    return result.agents;
  }

  /** Get the currently active custom agent, or null if using the default. */
  async getCurrentAgent(): Promise<{ name: string; displayName: string; description: string } | null> {
    const result = await this.rpc.agent.getCurrent();
    return result.agent;
  }

  /** Switch to a custom agent by name. */
  async selectAgent(name: string): Promise<void> {
    await this.rpc.agent.select({ name });
  }

  /** Deselect the current custom agent (return to default). */
  async deselectAgent(): Promise<void> {
    await this.rpc.agent.deselect();
  }

  /** Reload custom agent configs from disk. */
  async reloadAgents(): Promise<void> {
    await this.rpc.agent.reload();
  }

  // --------------------------------------------------------------------------
  // Fleet (experimental: parallel agent execution)
  // --------------------------------------------------------------------------

  /** Start fleet mode, optionally with a prompt to combine with fleet instructions. */
  async startFleet(prompt?: string): Promise<{ started: boolean }> {
    return this.rpc.fleet.start({ ...(prompt !== undefined ? { prompt } : {}) });
  }

  // --------------------------------------------------------------------------
  // Raw RPC access for advanced/experimental usage
  // --------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get rpc(): any {
    if (!this.session) throw new Error("Not connected.");
    return this.session.rpc;
  }

  get copilotSession(): CopilotSession | null {
    return this.session;
  }

  // --------------------------------------------------------------------------
  // Internal: wire every SDK event into DoCoreEvent
  // --------------------------------------------------------------------------

  private wireAllEvents(session: CopilotSession): void {
    this.unsubscribeSdkEvents = session.on((event: SessionEvent) => {
      // Track background subagents for "truly done" detection
      if (event.type === "subagent.started") {
        this.runningSubagents.add(event.data.toolCallId);
      } else if (event.type === "subagent.completed" || event.type === "subagent.failed") {
        this.runningSubagents.delete(event.data.toolCallId);
      }

      const mapped = mapSdkEvent(event, { runningSubagentCount: this.runningSubagents.size });
      if (mapped) this.emit(mapped);

      // Update engine state from lifecycle events
      if (event.type === "session.idle") {
        this.setState("ready");
      } else if (event.type === "session.error") {
        this.setState("error");
      } else if (event.type === "session.shutdown") {
        this.setState("disconnected");
      }
    });
  }

  /** Returns true when the main loop is idle AND no background agents are running */
  get isFullyDone(): boolean {
    return this._state === "ready" && this.runningSubagents.size === 0;
  }

  /** Number of background subagents still running */
  get backgroundAgentCount(): number {
    return this.runningSubagents.size;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private setState(s: EngineState) { this._state = s; }

  private emit(event: DoCoreEvent) { this.events.emit(event); }
}

function iso(): string {
  return new Date().toISOString();
}
