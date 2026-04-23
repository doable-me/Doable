/**
 * Yjs Bridge — routes AI file writes through the CRDT when collaboration is active.
 *
 * The API server calls this before writing to the filesystem. If the WS server
 * has active collaborators for the project, the write goes through Yjs (which
 * handles persistence via debounced flush). Otherwise, returns false and the
 * caller writes directly to disk.
 */

const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL ?? "http://localhost:4001";
import { INTERNAL_SECRET } from "../lib/secrets.js";
// Timeout for all internal WS server calls — prevents tool hangs when WS is slow/down
const BRIDGE_TIMEOUT_MS = 5_000;

interface YjsBridgeResult {
  handled: boolean;
  success?: boolean;
  occurrences?: number;
}

/**
 * Check if a project has active collaborators.
 */
export async function isCollaborationActive(projectId: string): Promise<boolean> {
  try {
    const res = await fetch(`${WS_INTERNAL_URL}/internal/collab-active/${projectId}`, {
      headers: { "X-Internal-Secret": INTERNAL_SECRET },
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json() as { active: boolean };
    return data.active;
  } catch {
    return false;
  }
}

/**
 * Write a complete file through the Yjs CRDT.
 * Returns { handled: true } if the write was routed through CRDT,
 * or { handled: false } if the caller should write directly to disk.
 */
export async function writeFileThroughYjs(
  projectId: string,
  filePath: string,
  content: string,
): Promise<YjsBridgeResult> {
  try {
    const res = await fetch(`${WS_INTERNAL_URL}/internal/yjs/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        projectId,
        filePath,
        content,
        operation: "write",
      }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });

    if (!res.ok) return { handled: false };
    return await res.json() as YjsBridgeResult;
  } catch {
    return { handled: false };
  }
}

/**
 * Edit a file (string replacement) through the Yjs CRDT.
 */
export async function editFileThroughYjs(
  projectId: string,
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): Promise<YjsBridgeResult> {
  try {
    const res = await fetch(`${WS_INTERNAL_URL}/internal/yjs/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        projectId,
        filePath,
        operation: "edit",
        oldString,
        newString,
        replaceAll,
      }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });

    if (!res.ok) return { handled: false };
    return await res.json() as YjsBridgeResult;
  } catch {
    return { handled: false };
  }
}

/**
 * Broadcast a message to all collaborators in a project room.
 */
export async function broadcastToRoom(
  projectId: string,
  message: Record<string, unknown>,
  excludeUserId?: string,
): Promise<void> {
  try {
    await fetch(`${WS_INTERNAL_URL}/internal/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ projectId, message, excludeUserId }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
  } catch {
    // Non-critical — broadcast failures shouldn't break the AI flow
  }
}
