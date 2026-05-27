/**
 * CopilotEngine — Doable's AI session manager backed by docore.
 *
 * Delegates all session lifecycle (create, resume, send, abort) to
 * docore's DoCorePool + DoCoreEngine. Doable never directly constructs
 * CopilotClient or CopilotSession.
 */

import path from "node:path";
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

// Tools whose first argument is a project file path that may need
// pre-permission normalization. Covers both the SDK CLI built-ins
// (str_replace_editor, view, write) and Doable's custom file tools
// (create_file, edit_file, read_file).
//
// MiniMax-M2.7 and other smaller models emit a mix of
// `/app/...`, relative paths, and bare filenames. The CLI's built-in
// permission layer rejects relative paths ("Path not absolute") and
// docore's sandbox rejects /app/... paths ("outside your project
// directory") BEFORE our tool handlers' normalizePath() runs. Rewriting
// the path here — inside onPreToolUse — happens BEFORE the permission
// check, so all three failure modes converge on a single normalized
// absolute path under the session's working directory.
// BUG-R27-001: MiniMax-M2.7 (and other small models) consistently prefer
// the SDK's built-in `edit` tool over our custom `edit_file`. Without
// adding the SDK names here, every `edit`/`multi_edit`/`str_replace`
// call from those models hits "Path not absolute" then ENOENT in a loop
// until the model gives up and tries bash. Adding the SDK names lets
// onPreToolUse rewrite their `path` arg the same way it does for the
// Doable custom names. The set is intentionally permissive — unknown
// names just fall through unchanged.
const PATH_REWRITE_TOOLS = new Set([
  "str_replace_editor",
  "view",
  "write",
  "create_file",
  "edit_file",
  "read_file",
  // SDK built-ins (docore CLI) — same `path` field shape, different names.
  // MiniMax was observed picking each of these over Doable's custom names
  // during R27 testing. Adding all known SDK file tools defensively.
  "edit",
  "multi_edit",
  "str_replace",
  "create",
]);

/**
 * Normalize a path argument so it resolves to an absolute path inside
 * `workingDirectory`. Returns the (possibly rewritten) path. If the
 * input is already absolute AND inside workingDirectory we leave it
 * alone so the permission check sees the original. If it's absolute
 * AND outside workingDirectory we also leave it alone — that's a real
 * security violation that the sandbox should still deny.
 *
 * Handles:
 *   "/app/index.css"             -> "<wd>/index.css"   (sandbox bind-mount leak)
 *   "/app"                       -> "<wd>"
 *   "index.css"                  -> "<wd>/index.css"
 *   "./src/App.tsx"              -> "<wd>/src/App.tsx"
 *   "app/src/Calculator.tsx"     -> "<wd>/src/Calculator.tsx" (vite-react app/ leak)
 *   "<wd>/already/absolute"      -> unchanged
 *   "/etc/passwd"                -> unchanged (sandbox will deny)
 */
function normalizeToolPath(workingDirectory: string, rawPath: string): string {
  if (typeof rawPath !== "string" || rawPath.length === 0) return rawPath;
  const wd = workingDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
  let p = rawPath.replace(/\\/g, "/");

  // Sandbox bind-mount leak: /app and /app/...
  if (p === "/app" || p === "/app/") return wd;
  if (p.startsWith("/app/")) {
    return `${wd}/${p.slice("/app/".length)}`;
  }

  // Already an absolute path: leave it alone. Either already inside wd,
  // or it's a real outside-the-sandbox path that the sandbox should deny.
  if (path.isAbsolute(p)) return rawPath;

  // Strip leading ./
  p = p.replace(/^\.\//, "");

  // Strip vite-react `app/` leak (only when followed by another segment;
  // a top-level `app/foo` file legitimately becomes <wd>/foo since /app
  // doesn't exist as a real project dir under <wd>).
  if (/^app\/[^/]/.test(p)) {
    p = p.slice(4);
  }

  // Strip leading / that survived (e.g. "//foo")
  p = p.replace(/^\/+/, "");

  return `${wd}/${p}`;
}

/**
 * Rewrite the `path` field on built-in and custom file
 * tools so the path is absolute and inside the session working
 * directory BEFORE the SDK's permission check runs. Returns the
 * possibly-modified args, or undefined if no change was needed.
 */
function maybeRewriteToolArgs(
  toolName: string,
  toolArgs: unknown,
  workingDirectory: string | undefined,
): Record<string, unknown> | undefined {
  if (!workingDirectory) return undefined;
  if (!PATH_REWRITE_TOOLS.has(toolName)) return undefined;
  if (typeof toolArgs !== "object" || toolArgs === null) return undefined;
  const args = toolArgs as Record<string, unknown>;
  const rawPath = args.path;
  if (typeof rawPath !== "string" || rawPath.length === 0) return undefined;
  const normalized = normalizeToolPath(workingDirectory, rawPath);
  if (normalized === rawPath) return undefined;
  return { ...args, path: normalized };
}

// File-write tools whose content we inspect for inbuilt-DB persistence misuse.
const FILE_WRITE_TOOLS = new Set([
  "create_file", "edit_file", "write", "create", "str_replace_editor", "str_replace", "multi_edit",
]);

/**
 * Deterministic backstop for the per-app database (BUG: generated apps wired to
 * localStorage instead of the inbuilt DB). When DOABLE_APP_DB_ENABLED, deny any
 * app-code write that persists data via localStorage/sessionStorage-as-a-store
 * or by spinning up a browser-side PGlite — the model (esp. MiniMax-M2.7) does
 * this despite explicit prompt guidance. The deny message redirects it to
 * @doable/data. Trivial UI-pref localStorage (a plain string value, no
 * JSON.stringify of a collection) is intentionally NOT matched.
 */
function denyDataStoreMisuse(
  toolName: string,
  toolArgs: unknown,
): { permissionDecision: "deny"; permissionDecisionReason: string } | undefined {
  if (process.env.DOABLE_APP_DB_ENABLED === "0") return undefined;
  if (!FILE_WRITE_TOOLS.has(toolName)) return undefined;
  const a = toolArgs as Record<string, unknown> | undefined;
  if (!a) return undefined;
  // The file-content arg key varies by tool and model (content, file_text,
  // new_str, text, code, contents, …) and the copilot CLI's create_file uses
  // its OWN key — checking a fixed list silently missed it, so the deny never
  // fired and apps shipped with localStorage. Scan EVERY string value (and
  // strings nested one level inside arrays/objects, e.g. multi_edit's edits[]).
  const strings: string[] = [];
  const collect = (v: unknown, depth: number): void => {
    if (typeof v === "string") strings.push(v);
    else if (depth > 0 && Array.isArray(v)) for (const x of v) collect(x, depth - 1);
    else if (depth > 0 && v && typeof v === "object") for (const x of Object.values(v)) collect(x, depth - 1);
  };
  collect(a, 2);
  const content = strings.join("\n");
  if (!content) return undefined;
  const usesPglite = /@electric-sql\/pglite|new\s+PGlite\s*\(/.test(content);
  const usesLocalStoreAsDb = /(?:localStorage|sessionStorage)\.setItem\s*\([^)]*JSON\.stringify/.test(content);
  if (!usesPglite && !usesLocalStoreAsDb) return undefined;
  return {
    permissionDecision: "deny",
    permissionDecisionReason:
      "🚫 This project has a built-in SERVER-SIDE database. Persist data ONLY via the inbuilt DB: " +
      "`import { db } from \"@doable/data\"` then `await db.query(sql, params)` (create tables with the data.migrate tool). " +
      "Do NOT use " + (usesPglite ? "@electric-sql/pglite / new PGlite()" : "localStorage/sessionStorage") +
      " as the data store — it loses every row on reload and is NOT the inbuilt DB. @doable/data is PRE-LINKED (absent from package.json is expected) — import it directly, never install it. " +
      "(A trivial UI preference like a theme toggle may still use localStorage with a plain string value.) " +
      "Rewrite this file to read and write through @doable/data.",
  };
}

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
          : { useLoggedInUser: true }),
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
        ...(config.skillDirectories && config.skillDirectories.length > 0
          ? { skillDirectories: config.skillDirectories }
          : {}),
        ...(config.systemPrompt
          ? { systemMessage: { mode: "replace" as const, content: config.systemPrompt } }
          : {}),
        hooks: {
          onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
            // Rewrite file paths BEFORE the SDK permission
            // check fires so /app/* and relative paths both land as
            // absolute paths inside the project directory. Without this,
            // the docore sandbox denies /app/* with "outside your project
            // directory" and the CLI rejects relative paths with "Path
            // not absolute" — both happen *before* tool handlers run, so
            // tool-handler-side normalization can't recover.
            const rewritten = maybeRewriteToolArgs(input.toolName, input.toolArgs, config.workingDirectory);
            const effectiveArgs = rewritten ?? input.toolArgs;

            config.toolProgress?.onToolStart?.(input.toolName, effectiveArgs);
            // Block bash tool from writing files via cat/heredoc — force use of create_file/edit_file
            if (input.toolName === "bash") {
              const args = effectiveArgs as { command?: string } | undefined;
              const cmd = args?.command ?? "";
              if (/cat\s*>|<<\s*['"]?EOF|>\s*src\/|>\s*\.\//i.test(cmd)) {
                console.log(`[CopilotEngine] Denied bash file-write: ${cmd.slice(0, 80)}`);
                return {
                  permissionDecision: "deny" as const,
                  permissionDecisionReason: "Do NOT use bash/cat to write files. Use the create_file or edit_file tool instead — it is faster and more reliable.",
                };
              }
            }
            // Inbuilt-DB backstop: block localStorage/pglite as a data store.
            const dbDeny = denyDataStoreMisuse(input.toolName, effectiveArgs);
            if (dbDeny) {
              console.log(`[CopilotEngine] Denied inbuilt-DB misuse in ${input.toolName} — redirecting to @doable/data`);
              return dbDeny;
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
            if (rewritten) return { modifiedArgs: rewritten };
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
      // BUG-RESUME-PROVIDER: a resumed BYOK session MUST carry the same model
      // + provider as createSession(). docore re-issues session.create on
      // resume; without these the CLI logs "No auth info or provider
      // available", never calls the model, and the turn hangs silently until
      // the thinking_loop watchdog fires (no tools, no content). This made
      // every project unbuildable once it had a persisted copilot_session_id.
      model: config?.model ?? this.config.model,
      streaming: true,
      workingDirectory: config?.workingDirectory,
      onPermissionRequest: config?.onPermissionRequest,
      sessionConfig: {
        ...(config?.provider ? { provider: config.provider } : {}),
        ...(config?.tools ? { tools: config.tools } : {}),
        ...(config?.skillDirectories && config.skillDirectories.length > 0
          ? { skillDirectories: config.skillDirectories }
          : {}),
        ...(config?.toolProgress ? {
          hooks: {
            onPreToolUse: async (input: { toolName: string; toolArgs: unknown }) => {
              // See createSession() above for the rationale.
              const rewritten = maybeRewriteToolArgs(input.toolName, input.toolArgs, config?.workingDirectory);
              const effectiveArgs = rewritten ?? input.toolArgs;

              config.toolProgress?.onToolStart?.(input.toolName, effectiveArgs);
              // Block bash tool from writing files via cat/heredoc
              if (input.toolName === "bash") {
                const args = effectiveArgs as { command?: string } | undefined;
                const cmd = args?.command ?? "";
                if (/cat\s*>|<<\s*['"]?EOF|>\s*src\/|>\s*\.\//i.test(cmd)) {
                  console.log(`[CopilotEngine] Denied bash file-write: ${cmd.slice(0, 80)}`);
                  return {
                    permissionDecision: "deny" as const,
                    permissionDecisionReason: "Do NOT use bash/cat to write files. Use the create_file or edit_file tool instead — it is faster and more reliable.",
                  };
                }
              }
              // Inbuilt-DB backstop: block localStorage/pglite as a data store.
              const dbDeny = denyDataStoreMisuse(input.toolName, effectiveArgs);
              if (dbDeny) {
                console.log(`[CopilotEngine] Denied inbuilt-DB misuse in ${input.toolName} (resume) — redirecting to @doable/data`);
                return dbDeny;
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
              if (rewritten) return { modifiedArgs: rewritten };
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
      // Carry the BYOK provider/model through resume too (docore spreads
      // these into the CLI resumeSession config). See BUG-RESUME-PROVIDER above.
      ...(config?.provider ? { provider: config.provider } : {}),
      ...(config?.model ? { model: config.model } : {}),
      ...(config?.tools ? { tools: config.tools } : {}),
      ...(config?.skillDirectories && config.skillDirectories.length > 0
        ? { skillDirectories: config.skillDirectories }
        : {}),
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

    const INITIAL_TIMEOUT_MS = 120_000;
    // The model may silently generate large tool-call arguments (e.g. a
    // full HTML deck for build_deck) without emitting SDK events.  The gap
    // between the last streaming delta and tool.execution_start can exceed
    // 2 min, so allow 5 min between events once the model has started.
    const EVENT_TIMEOUT_MS = 300_000; // 5 min
    // During tool execution (MCP calls, file writes, etc.) the model waits
    // for the tool result which can take minutes for heavy operations like
    // presentation rendering.  Use a much longer timeout while a tool is
    // in-flight so we don't falsely abort.
    const TOOL_EXEC_TIMEOUT_MS = 600_000; // 10 min
    let lastProgressTime = Date.now();
    let gotFirstEvent = false;
    let activeToolCount = 0; // tracks nested / concurrent tool executions
    const sid = sessionId.slice(0, 8);

    // Events that indicate the model has started producing output — used
    // to switch from INITIAL_TIMEOUT_MS to EVENT_TIMEOUT_MS.
    const PROGRESS_EVENTS = new Set([
      "assistant.message_delta", "assistant.streaming_delta", "assistant.message",
      "assistant.reasoning_delta", "assistant.turn_start", "assistant.turn_end",
      "tool.execution_start", "tool.execution_complete",
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
        const timeout = activeToolCount > 0
          ? TOOL_EXEC_TIMEOUT_MS
          : (gotFirstEvent ? EVENT_TIMEOUT_MS : INITIAL_TIMEOUT_MS);
        if (since > timeout) {
          try { onEvent?.({ type: "session.error", data: { message: `AI timed out — no response for ${Math.round(since / 1000)}s.` } } as SessionEvent); } catch {}
          finish();
        }
      }, 5_000);

      const unsubscribe = (session as any).on((event: SessionEvent) => {
        if (settled) return;
        // Any event from the SDK proves the session is alive — reset timeout.
        lastProgressTime = Date.now();
        if (PROGRESS_EVENTS.has(event.type)) gotFirstEvent = true;
        // Track active tool executions to extend timeout while tools run
        if (event.type === "tool.execution_start") activeToolCount++;
        if (event.type === "tool.execution_complete") activeToolCount = Math.max(0, activeToolCount - 1);
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
