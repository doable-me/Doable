/**
 * CopilotEngine — Doable's AI session manager backed by docore.
 *
 * Delegates all session lifecycle (create, resume, send, abort) to
 * docore's DoCorePool + DoCoreEngine. Doable never directly constructs
 * CopilotClient or CopilotSession.
 */

import { DoCorePool, DoCoreEngine } from "docore";
import type {
  SessionEvent,
  AssistantMessageEvent,
} from "@github/copilot-sdk";
import type {
  CopilotEngineConfig,
  CopilotSessionConfig,
} from "../engine-types.js";

export { type CopilotEngineConfig, type CopilotSessionConfig } from "../engine-types.js";

// Tools allowed in plan mode — everything else is denied via onPreToolUse
const PLAN_ALLOWED_TOOLS = new Set([
  // SDK built-in read-only tools
  "view", "grep", "glob", "ask_user", "report_intent",
  // Custom read-only tools
  "read_file", "list_files", "search_files",
  // Custom plan-specific tools
  "ask_clarification", "create_plan", "mark_step_complete",
]);

// CLI built-in shell tools — redirected to our jailed run_command tool.
// The CLI's bash tool runs on the host with no filesystem isolation.
// Our run_command tool routes through vault.exec() which applies OS-level
// sandboxing (systemd ProtectSystem on Linux, Job Objects on Windows).
const REDIRECTED_SHELL_TOOLS = new Set([
  "bash",
  "shell",
  "execute",
  "run_command_cli",
]);

const SHELL_REDIRECT_MSG = "This tool is not available. Use the run_command tool to execute shell commands — it runs inside a sandboxed environment.";

export class CopilotEngine {
  private pool: DoCorePool | null = null;
  private config: CopilotEngineConfig;
  private engines = new Map<string, DoCoreEngine>();
  private abortedSessions = new Set<string>();
  private sessionWakeups = new Map<string, () => void>();
  private sessionModes = new Map<string, string>();

  constructor(config: CopilotEngineConfig = {}) {
    this.config = config;
  }

  get sessionCount(): number {
    return this.engines.size;
  }

  async start(): Promise<void> {
    if (this.pool) return;
    this.pool = new DoCorePool({
      clientOptions: {
        ...(this.config.cliPath ? { cliPath: this.config.cliPath } : {}),
        ...(this.config.cliUrl ? { cliUrl: this.config.cliUrl } : {}),
        ...(this.config.githubToken
          ? { githubToken: this.config.githubToken }
          : { useLoggedInUser: false }),
      },
      poolSize: 1,
    });
    await this.pool.start();
    console.log("[CopilotEngine] Pool started (via docore)");
  }

  async stop(): Promise<void> {
    if (!this.pool) return;
    for (const [id, engine] of this.engines) {
      try { await engine.disconnectSession(); } catch (err) {
        console.error(`[CopilotEngine] Error disconnecting engine ${id}:`, err);
      }
    }
    this.engines.clear();
    this.sessionModes.clear();
    await this.pool.stop();
    this.pool = null;
    console.log("[CopilotEngine] Pool stopped");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAuthStatus(): Promise<any> {
    return (await this.getOrCreateTempEngine()).getAuthStatus();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async listModels(): Promise<any> {
    return (await this.getOrCreateTempEngine()).listModels();
  }

  async createSession(config: CopilotSessionConfig): Promise<string> {
    this.ensurePool();
    if (config.provider) {
      console.log(`[CopilotEngine] BYOK provider: type=${config.provider.type}, model=${config.model ?? this.config.model}`);
    }

    // Mutable ref captured by hook closure — set after connect()
    let currentSessionId: string | undefined;

    const engine = await this.pool!.createEngine({
      model: config.model ?? this.config.model,
      workingDirectory: config.workingDirectory,
      streaming: true,
      onPermissionRequest: config.onPermissionRequest,
      onUserInputRequest: config.onUserInput
        ? async (request: { question: string }) => ({
            answer: await config.onUserInput!(request.question ?? "Please provide input"),
            wasFreeform: true,
          })
        : undefined,
      sessionConfig: {
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.tools ? { tools: config.tools } : {}),
        ...(config.systemPrompt
          ? { systemMessage: { mode: "replace" as const, content: config.systemPrompt } }
          : {}),
        hooks: {
          onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
            config.toolProgress?.onToolStart?.(input.toolName, input.toolArgs);
            // Redirect CLI built-in shell tools to our jailed run_command
            if (REDIRECTED_SHELL_TOOLS.has(input.toolName)) {
              return {
                permissionDecision: "deny" as const,
                permissionDecisionReason: SHELL_REDIRECT_MSG,
              };
            }
            // Enforce plan mode: deny write/shell tools via SDK hook
            if (currentSessionId && this.sessionModes.get(currentSessionId) === "plan") {
              if (!PLAN_ALLOWED_TOOLS.has(input.toolName)) {
                console.log(`[CopilotEngine] Plan mode: denied tool '${input.toolName}'`);
                return {
                  permissionDecision: "deny" as const,
                  permissionDecisionReason: `Tool '${input.toolName}' is not available in plan mode. Use ask_clarification or create_plan instead.`,
                };
              }
            }
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
      },
    });

    await engine.connect();
    if (config.onEvent && engine.copilotSession) {
      (engine.copilotSession as any).on(config.onEvent);
    }
    const sessionId = engine.sessionId!;
    currentSessionId = sessionId;
    this.engines.set(sessionId, engine);
    return sessionId;
  }

  async resumeSession(sessionId: string, config?: Partial<CopilotSessionConfig>): Promise<string> {
    this.ensurePool();

    // Mutable ref captured by hook closure — set after resume()
    let currentSessionId: string | undefined = sessionId;

    const engine = await this.pool!.createEngine({
      streaming: true,
      workingDirectory: config?.workingDirectory,
      onPermissionRequest: config?.onPermissionRequest,
      sessionConfig: {
        ...(config?.tools ? { tools: config.tools } : {}),
        ...(config?.toolProgress ? {
          hooks: {
            onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
              config.toolProgress?.onToolStart?.(input.toolName, input.toolArgs);
              // Redirect CLI built-in shell tools to our jailed run_command
              if (REDIRECTED_SHELL_TOOLS.has(input.toolName)) {
                return {
                  permissionDecision: "deny" as const,
                  permissionDecisionReason: SHELL_REDIRECT_MSG,
                };
              }
              if (currentSessionId && this.sessionModes.get(currentSessionId) === "plan") {
                if (!PLAN_ALLOWED_TOOLS.has(input.toolName)) {
                  console.log(`[CopilotEngine] Plan mode: denied tool '${input.toolName}'`);
                  return {
                    permissionDecision: "deny" as const,
                    permissionDecisionReason: `Tool '${input.toolName}' is not available in plan mode. Use ask_clarification or create_plan instead.`,
                  };
                }
              }
            },
            onPostToolUse: async (input: { toolName: string; toolArgs: unknown; toolResult: unknown }) => { config.toolProgress?.onToolEnd?.(input.toolName, input.toolArgs, input.toolResult); },
            onSessionEnd: async (input: { reason: string; error?: string }) => { config.toolProgress?.onSessionEnd?.(input.reason, input.error); },
            onErrorOccurred: async (input: { error: string; errorContext: string }) => { config.toolProgress?.onError?.(input.error, input.errorContext); },
          },
        } : {}),
      },
    });
    await engine.resume(sessionId, {
      onPermissionRequest: config?.onPermissionRequest,
      streaming: true,
      workingDirectory: config?.workingDirectory,
      ...(config?.tools ? { tools: config.tools } : {}),
    });
    if (config?.onEvent && engine.copilotSession) {
      (engine.copilotSession as any).on(config.onEvent);
    }
    const newSessionId = engine.sessionId!;
    currentSessionId = newSessionId;
    this.engines.set(newSessionId, engine);
    return newSessionId;
  }

  async setSessionMode(sessionId: string, mode: "interactive" | "plan" | "autopilot"): Promise<void> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    this.sessionModes.set(sessionId, mode);
    await engine.setMode(mode);
  }

  async respondToExitPlanMode(sessionId: string, requestId: string, action: string, feedback?: string): Promise<void> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    const session = engine.copilotSession;
    if (!session) throw new Error(`No active session in engine for ${sessionId}`);
    await (session as any).respondToExitPlanMode({ requestId, selectedAction: action, feedback });
  }

  async readPlan(sessionId: string): Promise<{ exists: boolean; content: string | null; path: string | null }> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    const result = await engine.readPlan();
    return result ? { exists: true, content: result.content, path: result.path } : { exists: false, content: null, path: null };
  }

  sendMessage(
    sessionId: string,
    prompt: string,
    fileAttachments?: Array<{ type: "file"; path: string; displayName?: string }>,
    onEvent?: (event: SessionEvent) => void,
  ): Promise<void> {
    const engine = this.engines.get(sessionId);
    const session = engine?.copilotSession;
    if (!engine || !session) return Promise.reject(new Error(`Session ${sessionId} not found`));

    const INITIAL_TIMEOUT_MS = 90_000;
    const EVENT_TIMEOUT_MS = 120_000;
    let lastProgressTime = Date.now();
    let gotFirstEvent = false;
    const sid = sessionId.slice(0, 8);

    const PROGRESS_EVENTS = new Set([
      "assistant.message_delta", "assistant.streaming_delta", "assistant.message",
      "assistant.reasoning_delta", "assistant.turn_start", "assistant.turn_end",
      "tool.execution_start", "tool.execution_complete", "tool.completed", "tool.running",
      "model_call.start", "model_call.end", "session.idle", "session.error", "done",
    ]);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearInterval(checker);
        unsubscribe();
        this.sessionWakeups.delete(sessionId);
        this.abortedSessions.delete(sessionId);
        err ? reject(err) : resolve();
      };

      const checker = setInterval(() => {
        if (this.abortedSessions.has(sessionId)) {
          try { onEvent?.({ type: "session.idle", data: { reason: "aborted" } } as unknown as SessionEvent); } catch {}
          finish(); return;
        }
        const since = Date.now() - lastProgressTime;
        const timeout = gotFirstEvent ? EVENT_TIMEOUT_MS : INITIAL_TIMEOUT_MS;
        if (since > timeout) {
          try { onEvent?.({ type: "session.error", data: { message: `AI timed out — no response for ${Math.round(since / 1000)}s.` } } as SessionEvent); } catch {}
          finish();
        }
      }, 5_000);

      const unsubscribe = (session as any).on((event: SessionEvent) => {
        if (settled) return;
        if (PROGRESS_EVENTS.has(event.type)) { lastProgressTime = Date.now(); gotFirstEvent = true; }
        try { onEvent?.(event); } catch {}
        if (event.type === "session.idle" || event.type === "session.error") finish();
      });

      this.abortedSessions.delete(sessionId);
      this.sessionWakeups.set(sessionId, () => {
        if (!settled) {
          try { onEvent?.({ type: "session.idle", data: { reason: "aborted" } } as unknown as SessionEvent); } catch {}
          finish();
        }
      });

      const msgOpts: { prompt: string; attachments?: typeof fileAttachments } = { prompt };
      if (fileAttachments?.length) msgOpts.attachments = fileAttachments;

      Promise.race([
        session.send(msgOpts),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("session.send timed out after 15s")), 15_000)),
      ]).then(msgId => console.log(`[CopilotEngine] send → ${msgId} (${sid}…)`))
        .catch(err => finish(err instanceof Error ? err : new Error(String(err))));
    });
  }

  async sendAndGetReply(
    sessionId: string,
    prompt: string,
    fileAttachments?: Array<{ type: "file"; path: string; displayName?: string }>,
    onActivity?: (type: string, detail: string) => void,
    inactivityMs = 45_000,
  ): Promise<{ content: string; messageId?: string } | null> {
    const engine = this.engines.get(sessionId);
    const session = engine?.copilotSession;
    if (!engine || !session) throw new Error(`Session ${sessionId} not found`);

    const msgOpts: { prompt: string; attachments?: typeof fileAttachments } = { prompt };
    if (fileAttachments?.length) msgOpts.attachments = fileAttachments;

    return new Promise((resolve, reject) => {
      let lastActivity = Date.now();
      let content = "";
      let messageId: string | undefined;
      let done = false;

      const timer = setInterval(() => {
        if (done) return;
        const elapsed = Date.now() - lastActivity;
        if (elapsed > inactivityMs) {
          clearInterval(timer); unsub(); done = true;
          content ? resolve({ content, messageId }) : reject(new Error(`Timed out — no activity for ${Math.round(elapsed / 1000)}s`));
        }
      }, 10_000);

      const touch = (t: string, d: string) => { lastActivity = Date.now(); onActivity?.(t, d); };

      const unsub = (session as any).on((event: SessionEvent) => {
        const t = (event as Record<string, unknown>).type as string;
        const d = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;
        touch("event", t);
        if (t === "assistant.message_delta") { const delta = (d?.deltaContent ?? "") as string; if (delta) { content += delta; touch("text_delta", `+${delta.length}`); } }
        if (t === "assistant.message") { const c = (d?.content ?? "") as string; if (c && !content) content = c; messageId = (event as Record<string, unknown>).id as string; }
        if (t === "session.idle" && !done) { done = true; clearInterval(timer); unsub(); resolve({ content, messageId }); }
        if (t === "session.error" && !done) { done = true; clearInterval(timer); unsub(); const msg = (d?.message ?? "Unknown error") as string; content ? resolve({ content, messageId }) : reject(new Error(msg)); }
      });

      Promise.race([
        session.send(msgOpts),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("session.send timed out after 15s")), 15_000)),
      ]).then(() => touch("send", "accepted"))
        .catch(err => { if (!done) { done = true; clearInterval(timer); unsub(); reject(err); } });
    });
  }

  async sendAndWait(sessionId: string, prompt: string, timeoutMs = 300_000): Promise<AssistantMessageEvent | undefined> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    return engine.sendAndWait(prompt, timeoutMs) as Promise<AssistantMessageEvent | undefined>;
  }

  async abortSession(sessionId: string): Promise<void> {
    this.abortedSessions.add(sessionId);
    const cb = this.sessionWakeups.get(sessionId);
    if (cb) cb();
    const engine = this.engines.get(sessionId);
    if (!engine) return;
    try { await engine.abort(); } catch {}
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const engine = this.engines.get(sessionId);
    if (!engine) return;
    await engine.disconnectSession();
    this.engines.delete(sessionId);
    this.sessionModes.delete(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const engine = this.engines.get(sessionId);
    if (engine) { await engine.deleteSession(sessionId); await engine.disconnectSession(); this.engines.delete(sessionId); this.sessionModes.delete(sessionId); }
  }

  async getSessionMessages(sessionId: string): Promise<SessionEvent[]> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    return engine.getMessages() as Promise<SessionEvent[]>;
  }

  async setSessionModel(sessionId: string, model: string): Promise<void> {
    const engine = this.engines.get(sessionId);
    if (!engine) throw new Error(`Session ${sessionId} not found`);
    await engine.setModel(model);
  }

  private ensurePool(): void {
    if (!this.pool) throw new Error("CopilotEngine not started. Call start() first.");
  }

  private async getOrCreateTempEngine(): Promise<DoCoreEngine> {
    const first = this.engines.values().next().value;
    if (first) return first;
    this.ensurePool();
    const engine = await this.pool!.createEngine({});
    await engine.connect();
    this.engines.set(engine.sessionId!, engine);
    return engine;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async validateToken(githubToken: string): Promise<{ models: any[] }> {
    const e = new CopilotEngine({ githubToken });
    try { await e.start(); const models = await e.listModels(); return { models }; }
    finally { await e.stop(); }
  }
}

// ─── Singleton ──────────────────────────────────────────

let _engine: CopilotEngine | null = null;

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
