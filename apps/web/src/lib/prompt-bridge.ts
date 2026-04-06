/**
 * Prompt Bridge — starts the AI chat stream on the dashboard (or home)
 * page and hands it to the editor page, eliminating the dead-time between
 * navigation and the first SSE chunk.
 *
 * Flow:
 *   Dashboard handleSubmit()
 *     1. apiCreateProject()              → projectId
 *     2. promptBridge.start(projectId…)  → begins SSE fetch immediately
 *     3. router.push(/editor/…)          → SPA navigation (stream keeps running)
 *
 *   Editor mount
 *     1. promptBridge.consume(projectId) → returns bridge with buffered events
 *     2. Replays buffered events through normal callbacks
 *     3. Continues reading the live stream
 *
 * Because Next.js App Router uses client-side navigation, module-level
 * state survives across route transitions within the same session.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
export type BridgeStatus =
  | "creating-project"
  | "connecting"
  | "streaming"
  | "done"
  | "error";

export interface BridgeSSEEvent {
  raw: string; // the "data: …" payload (after stripping "data: " prefix)
}

export interface BridgeSnapshot {
  projectId: string;
  prompt: string;
  mode: string;
  attachments?: BridgeAttachment[];
  status: BridgeStatus;
  statusMessage: string;
  events: BridgeSSEEvent[];
  error?: string;
  /** The live ReadableStream reader — editor takes ownership */
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  /** Partial SSE line buffer for the reader to continue parsing */
  sseBuffer: string;
  /** Abort controller so the editor can cancel if needed */
  abortController: AbortController;
  /** Whether the stream already sent [DONE] */
  isDone: boolean;
}

export interface BridgeAttachment {
  type: string;
  data: string;
  name: string;
  preview?: string;
  mimeType?: string;
}

type StatusListener = (status: BridgeStatus, message: string) => void;

// ─── Singleton state ────────────────────────────────────────
let currentBridge: {
  projectId: string;
  prompt: string;
  mode: string;
  attachments?: BridgeAttachment[];
  status: BridgeStatus;
  statusMessage: string;
  events: BridgeSSEEvent[];
  error?: string;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  sseBuffer: string;
  abortController: AbortController;
  isDone: boolean;
  consumed: boolean;
} | null = null;

const statusListeners = new Set<StatusListener>();

// ─── Public API ─────────────────────────────────────────────

/**
 * Start the SSE chat stream in the background.
 * Called from dashboard / home page immediately after project creation.
 */
export function startBridge(
  projectId: string,
  prompt: string,
  mode: string,
  token: string | null,
  attachments?: BridgeAttachment[],
): void {
  // Abort any previous bridge
  if (currentBridge && !currentBridge.isDone) {
    currentBridge.abortController.abort();
  }

  const abortController = new AbortController();
  currentBridge = {
    projectId,
    prompt,
    mode,
    attachments,
    status: "connecting",
    statusMessage: "Connecting to AI…",
    events: [],
    reader: null,
    sseBuffer: "",
    abortController,
    isDone: false,
    consumed: false,
  };

  notifyStatus("connecting", "Connecting to AI…");

  // Fire the SSE fetch immediately — don't await
  startSSEFetch(projectId, prompt, mode, token, attachments, abortController);
}

/**
 * Check whether there's an unconsumed bridge for this project.
 */
export function hasBridge(projectId: string): boolean {
  return (
    currentBridge !== null &&
    currentBridge.projectId === projectId &&
    !currentBridge.consumed
  );
}

/**
 * Get current bridge status + message (for dashboard loading UI).
 */
export function getBridgeStatus(): { status: BridgeStatus; message: string } | null {
  if (!currentBridge) return null;
  return { status: currentBridge.status, message: currentBridge.statusMessage };
}

/**
 * Subscribe to status changes (dashboard uses this for the loading overlay).
 */
export function onBridgeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

/**
 * Consume the bridge — transfers ownership to the editor page.
 * Returns null if no bridge exists for this project.
 */
export function consumeBridge(projectId: string): BridgeSnapshot | null {
  if (!hasBridge(projectId)) return null;
  const b = currentBridge!;
  b.consumed = true;

  return {
    projectId: b.projectId,
    prompt: b.prompt,
    mode: b.mode,
    attachments: b.attachments,
    status: b.status,
    statusMessage: b.statusMessage,
    events: [...b.events],
    error: b.error,
    reader: b.reader,
    sseBuffer: b.sseBuffer,
    abortController: b.abortController,
    isDone: b.isDone,
  };
}

/**
 * Abort any active bridge (e.g. user navigates away).
 */
export function abortBridge(): void {
  if (currentBridge && !currentBridge.isDone) {
    currentBridge.abortController.abort();
  }
  currentBridge = null;
}

// ─── Internal ───────────────────────────────────────────────

function notifyStatus(status: BridgeStatus, message: string) {
  if (currentBridge) {
    currentBridge.status = status;
    currentBridge.statusMessage = message;
  }
  for (const l of statusListeners) {
    try { l(status, message); } catch { /* ignore */ }
  }
}

async function startSSEFetch(
  projectId: string,
  prompt: string,
  mode: string,
  token: string | null,
  attachments: BridgeAttachment[] | undefined,
  abortController: AbortController,
) {
  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        content: prompt,
        mode,
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ type: a.mimeType || a.type, data: a.data, name: a.name })) }
          : {}),
      }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (currentBridge && currentBridge.projectId === projectId) {
        currentBridge.error = `Server error (${res.status}): ${errText || "Something went wrong."}`;
        notifyStatus("error", currentBridge.error);
      }
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      if (currentBridge && currentBridge.projectId === projectId) {
        currentBridge.error = "No response stream received.";
        notifyStatus("error", currentBridge.error);
      }
      return;
    }

    // Store the reader — if the bridge hasn't been consumed yet, we pre-read
    // and buffer events. Once consumed, the editor takes the reader directly.
    if (currentBridge && currentBridge.projectId === projectId) {
      currentBridge.reader = reader;
      notifyStatus("streaming", "AI is responding…");
    }

    // Pre-read until consumed or stream ends
    const decoder = new TextDecoder();
    let buffer = "";

    while (currentBridge && currentBridge.projectId === projectId && !currentBridge.consumed) {
      const { done, value } = await reader.read();
      if (done) {
        currentBridge.isDone = true;
        notifyStatus("done", "Done");
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6);

        // Track status changes for the dashboard overlay
        if (payload !== "[DONE]") {
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "status" && parsed.data?.message) {
              notifyStatus("streaming", parsed.data.message);
            } else if (parsed.type === "thinking" && typeof parsed.data === "string") {
              notifyStatus("streaming", parsed.data || "Thinking…");
            } else if (parsed.type === "tool_call") {
              const name = parsed.data?.friendlyMessage || parsed.data?.name || "Working…";
              notifyStatus("streaming", typeof name === "string" ? name : "Working…");
            }
          } catch { /* not JSON — skip */ }
        }

        if (payload === "[DONE]") {
          currentBridge.isDone = true;
          currentBridge.events.push({ raw: payload });
          notifyStatus("done", "Done");
          return;
        }

        currentBridge.events.push({ raw: payload });
      }

      // Persist partial buffer so the editor can continue parsing
      currentBridge.sseBuffer = buffer;
    }
  } catch (err: unknown) {
    if (abortController.signal.aborted) return;
    if (currentBridge && currentBridge.projectId === projectId) {
      currentBridge.error = "Connection to AI failed. The server may be restarting.";
      notifyStatus("error", currentBridge.error);
    }
  }
}
