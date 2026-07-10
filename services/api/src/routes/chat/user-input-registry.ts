/**
 * User-input registry — the blocking "ask the user and WAIT" primitive.
 *
 * Some tools (notably the NotebookLM MCP server) reach a fork that genuinely
 * needs a human decision — e.g. "this video is in 2 notebooks, which one?" or
 * "an infographic already exists, reuse or regenerate?". A plain text
 * instruction telling the model to "stop and ask" is advisory only: models
 * re-call the tool and auto-answer their own question. See the notebooklm
 * disambiguation memory for the history.
 *
 * This registry lets a tool handler PAUSE its own turn until a real answer
 * arrives from the UI. Because the Copilot SDK awaits tool handlers before the
 * model regains control, `await requestUserInput(...)` inside the tool-bridge
 * makes the turn genuinely block — the model cannot auto-answer because it
 * never gets a chance to run until the user responds.
 *
 * Flow:
 *   1. tool-bridge calls `requestUserInput(projectId, {...})` → gets a Promise.
 *   2. The registry emits a `user_input_request` event to the project's live
 *      SSE stream (emitter registered by send-handler during the turn).
 *   3. The frontend renders a choice card. When the user answers, it POSTs to
 *      `/projects/:id/chat/user-input`, which calls `resolveUserInput(...)`.
 *   4. The awaited Promise resolves → the tool handler continues.
 *
 * Everything is in-process (single Node process), so the module-level maps are
 * shared between the tool-bridge and the answer route.
 */
import { randomUUID } from "node:crypto";

export interface UserInputChoice {
  /** Human-readable label shown as a button in the UI. */
  label: string;
  /** Opaque value handed back to the tool when this choice is picked. */
  value: string;
}

/** Payload emitted to the frontend so it can render the choice card. */
export interface UserInputRequestEvent {
  requestId: string;
  projectId: string;
  /** The question to show the user. */
  prompt: string;
  /** Optional short label describing the kind of decision (analytics/UI hint). */
  kind?: string;
  choices?: UserInputChoice[];
  /** Whether a freeform typed answer is accepted in addition to any choices. */
  allowFreeform: boolean;
}

/** The answer resolved back to the waiting tool handler. */
export type UserInputResult =
  | { cancelled: false; value: string; freeform: boolean }
  | { cancelled: true; reason: "timeout" | "no_stream" | "manual" };

interface PendingEntry {
  /**
   * All callers awaiting this decision. Multiple concurrent tool calls that ask
   * the SAME question (same dedupeKey) share one entry / one card, so a single
   * user answer resolves all of them. This is the common case: asking for a
   * summary AND an infographic of the same video makes both tools independently
   * hit the same "which notebook?" fork.
   */
  waiters: ((result: UserInputResult) => void)[];
  projectId: string;
  dedupeKey?: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

type Emitter = (event: UserInputRequestEvent) => void;

const pending = new Map<string, PendingEntry>();
const emitters = new Map<string, Emitter>();
/** `${projectId}::${dedupeKey}` → requestId, for coalescing identical asks. */
const dedupeIndex = new Map<string, string>();

/** Remove a pending entry and its dedupe index (does NOT resolve waiters). */
function removePending(requestId: string): PendingEntry | undefined {
  const entry = pending.get(requestId);
  if (!entry) return undefined;
  clearTimeout(entry.timer);
  pending.delete(requestId);
  if (entry.dedupeKey) {
    const key = `${entry.projectId}::${entry.dedupeKey}`;
    if (dedupeIndex.get(key) === requestId) dedupeIndex.delete(key);
  }
  return entry;
}

/** Default max time to wait for a human answer before giving up (10 min). */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Register the SSE emitter for a project's active chat stream. Called by the
 * send-handler at the start of a turn; the returned function unregisters it
 * (guarding against clobbering a newer emitter for the same project).
 */
export function registerUserInputEmitter(projectId: string, emit: Emitter): () => void {
  emitters.set(projectId, emit);
  return () => {
    if (emitters.get(projectId) === emit) emitters.delete(projectId);
  };
}

/**
 * Ask the user a question and BLOCK until they answer (or we time out / the
 * stream is gone). Safe to await from inside a tool handler.
 */
export function requestUserInput(
  projectId: string,
  opts: {
    prompt: string;
    kind?: string;
    choices?: UserInputChoice[];
    allowFreeform?: boolean;
    timeoutMs?: number;
    /**
     * Stable key identifying "the same question". Concurrent asks with the same
     * projectId + dedupeKey share one card/pending request; one answer resolves
     * them all. Omit for questions that must always be asked individually.
     */
    dedupeKey?: string;
  },
): Promise<UserInputResult> {
  const emit = emitters.get(projectId);
  if (!emit) {
    // No live stream to surface the question on — don't hang the turn.
    return Promise.resolve({ cancelled: true, reason: "no_stream" });
  }

  // Coalesce onto an existing identical pending request, if any.
  if (opts.dedupeKey) {
    const existingId = dedupeIndex.get(`${projectId}::${opts.dedupeKey}`);
    const existing = existingId ? pending.get(existingId) : undefined;
    if (existing) {
      return new Promise<UserInputResult>((resolve) => {
        existing.waiters.push(resolve);
      });
    }
  }

  const requestId = randomUUID();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<UserInputResult>((resolve) => {
    const timer = setTimeout(() => {
      const entry = removePending(requestId);
      if (entry) for (const w of entry.waiters) w({ cancelled: true, reason: "timeout" });
    }, timeoutMs);
    // Never keep the process alive just for a pending question.
    if (typeof timer.unref === "function") timer.unref();

    pending.set(requestId, { waiters: [resolve], projectId, dedupeKey: opts.dedupeKey, createdAt: Date.now(), timer });
    if (opts.dedupeKey) dedupeIndex.set(`${projectId}::${opts.dedupeKey}`, requestId);

    try {
      emit({
        requestId,
        projectId,
        prompt: opts.prompt,
        kind: opts.kind,
        choices: opts.choices,
        allowFreeform: opts.allowFreeform ?? true,
      });
    } catch {
      // Emit failed — resolve as no_stream so the tool handler can proceed.
      const entry = removePending(requestId);
      if (entry) for (const w of entry.waiters) w({ cancelled: true, reason: "no_stream" });
    }
  });
}

/**
 * Resolve a pending question with the user's answer. Returns true if a matching
 * pending request existed (i.e. the answer was accepted). Called by the
 * `/chat/user-input` route.
 */
export function resolveUserInput(
  requestId: string,
  value: string,
  freeform = false,
  projectId?: string,
): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  // If a projectId was supplied (from the authed route), make sure it matches
  // so one project's answer can't resolve another's pending request.
  if (projectId && entry.projectId !== projectId) return false;
  removePending(requestId);
  for (const w of entry.waiters) w({ cancelled: false, value, freeform });
  return true;
}

/** Cancel any pending requests for a project (e.g. stream ended/aborted). */
export function cancelUserInputsForProject(projectId: string): void {
  for (const requestId of [...pending.keys()]) {
    const entry = pending.get(requestId);
    if (!entry || entry.projectId !== projectId) continue;
    removePending(requestId);
    for (const w of entry.waiters) w({ cancelled: true, reason: "manual" });
  }
}
