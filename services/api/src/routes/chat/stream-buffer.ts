/**
 * Stream buffer — stores SSE events by messageId so clients can resume after
 * a page refresh without losing in-flight generation output.
 *
 * Keyed by the ephemeral `messageId` emitted via /chat/status. Uses the
 * shared KV store (in-memory by default, Redis if REDIS_URL is set).
 *
 * The buffer is always rewritten as a full snapshot (rather than append via
 * get+set) to avoid races across concurrent emitters (tool events + soft
 * heartbeat + main stream). Snapshots are fine because the producer holds
 * the canonical in-memory array and re-publishes on every write.
 */
import { getKVStore } from "@doable/shared/kv-store.js";

export interface BufferedEvent {
  seq: number;
  type: string;
  // The original SSE event payload — `data` from `{type, data}`.
  // Stored as-is (object/string/number) so clients replay the same shape.
  data: unknown;
  ts: number;
}

export interface StreamBuffer {
  events: BufferedEvent[];
  done: boolean;
  error?: string;
  updatedAt: number;
}

/** TTL while generation is active — long enough to survive a network blip. */
export const ACTIVE_TTL_MS = 600_000; // 10 min
/** TTL after generation ends — gives late reconnects a window to replay completion. */
export const DONE_TTL_MS = 60_000; // 1 min

export function streamBufferKey(messageId: string): string {
  return `chat:stream:${messageId}`;
}

/** Write the full buffer snapshot. Callers hold the in-memory array. */
export async function writeStreamBuffer(messageId: string | undefined, buf: StreamBuffer): Promise<void> {
  if (!messageId) return;
  try {
    const kv = getKVStore();
    const ttl = buf.done ? DONE_TTL_MS : ACTIVE_TTL_MS;
    await kv.set(streamBufferKey(messageId), buf, ttl);
  } catch (e) {
    // Non-critical — losing the buffer only breaks refresh-resume,
    // generation itself continues.
    console.warn("[StreamBuffer] write failed:", e instanceof Error ? e.message : e);
  }
}

/** Read the buffer, or undefined if missing/expired. */
export async function readStreamBuffer(messageId: string): Promise<StreamBuffer | undefined> {
  try {
    const kv = getKVStore();
    return kv.get<StreamBuffer>(streamBufferKey(messageId));
  } catch {
    return undefined;
  }
}

/** Events that should NOT be buffered (noise, client doesn't need replay). */
const NOISE_TYPES = new Set(["keep_alive"]);

export function shouldBufferType(type: string): boolean {
  return !NOISE_TYPES.has(type);
}
