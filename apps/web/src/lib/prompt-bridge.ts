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

import { refreshAccessToken, getStoredTokens } from "./api-core";

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

  // Safety net: abort orphan bridges that no editor ever consumes (e.g. user
  // closed the editor tab, project-id mismatch, navigation race). Without
  // this the SSE response body stays open with transferSize:0, the server
  // keeps writing into a buffer no client drains, and resources leak for
  // the lifetime of the tab.
  setTimeout(() => {
    if (currentBridge && currentBridge.projectId === projectId && !currentBridge.consumed) {
      console.warn(`[Bridge] Auto-aborting unconsumed bridge for ${projectId} after 30s`);
      currentBridge.abortController.abort();
      currentBridge.isDone = true;
    }
  }, 30_000);
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
    const makeRequest = (authToken: string | null) =>
      fetch(`${API_URL}/projects/${projectId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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

    let res = await makeRequest(token);

    // On 401, refresh the token and retry once (mirrors apiFetch behavior)
    if (res.status === 401 && !abortController.signal.aborted) {
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        res = await makeRequest(newTokens.accessToken);
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (currentBridge && currentBridge.projectId === projectId) {
        currentBridge.error = `Server error (${res.status}): ${errText || "Something went wrong."}`;
        notifyStatus("error", currentBridge.error);
      }
      return;
    }

    const body = res.body;
    if (!body) {
      if (currentBridge && currentBridge.projectId === projectId) {
        currentBridge.error = "No response stream received.";
        notifyStatus("error", currentBridge.error);
      }
      return;
    }

    const reader = body.getReader();

    if (currentBridge && currentBridge.projectId === projectId) {
      currentBridge.reader = reader;
      notifyStatus("streaming", "AI is responding…");
    }

    // We intentionally do NOT pre-read from the reader here. Pre-reading
    // caused a race condition: the bridge loop's pending reader.read()
    // could consume chunks (including [DONE]) that the editor never saw,
    // causing the stream to hang indefinitely. The dashboard overlay
    // shows "AI is responding…" which is sufficient — the editor takes
    // full ownership of the reader on consumeBridge() and reads everything.
  } catch (err: unknown) {
    if (abortController.signal.aborted) return;
    if (currentBridge && currentBridge.projectId === projectId) {
      currentBridge.error = "Connection to AI failed. The server may be restarting.";
      notifyStatus("error", currentBridge.error);
    }
  }
}
