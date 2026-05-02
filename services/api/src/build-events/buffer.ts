/**
 * Per-project ring buffer for build events.
 *
 * Per devframeworkPRD/03-build-event-protocol.md §5. Build is not turn-
 * scoped (a dev-server runs for hours across many AI turns), so the
 * buffer is keyed per `projectId` rather than per `messageId` like
 * chat's stream-resume.
 *
 * In-memory only for v1. PRD 03 §5.2 sketches an optional Postgres
 * mirror for restart-survival; that's a follow-up — for now an API
 * restart resets the buffer (clients will reconnect with cursor=latest).
 */

import type { BuildEvent } from "./types.js";

const DEFAULT_CAPACITY = parseInt(process.env.BUILD_BUFFER_SIZE ?? "5000", 10);
const MAX_HARD_LIMIT = 50_000; // PRD 03 §6.3

interface RingBuffer<T> {
  push(item: T): { evicted: T | null };
  toArray(): T[];
  size(): number;
  capacity: number;
}

function makeRingBuffer<T>(capacity: number): RingBuffer<T> {
  const data: (T | undefined)[] = new Array(capacity);
  let head = 0;
  let count = 0;
  return {
    capacity,
    push(item: T): { evicted: T | null } {
      let evicted: T | null = null;
      if (count === capacity) {
        evicted = data[head] ?? null;
        data[head] = item;
        head = (head + 1) % capacity;
      } else {
        data[(head + count) % capacity] = item;
        count++;
      }
      return { evicted };
    },
    toArray(): T[] {
      const out: T[] = [];
      for (let i = 0; i < count; i++) {
        const v = data[(head + i) % capacity];
        if (v !== undefined) out.push(v);
      }
      return out;
    },
    size(): number {
      return count;
    },
  };
}

export interface ProjectBuildBuffer {
  projectId: string;
  events: RingBuffer<BuildEvent>;
  nextSeq: number;
  subscribers: Set<(e: BuildEvent) => void>;
  /** Total dropped events (for /metrics). */
  droppedCount: number;
}

const buffers = new Map<string, ProjectBuildBuffer>();

export function getOrCreateBuffer(projectId: string): ProjectBuildBuffer {
  let b = buffers.get(projectId);
  if (b) return b;
  b = {
    projectId,
    events: makeRingBuffer<BuildEvent>(DEFAULT_CAPACITY),
    nextSeq: 1,
    subscribers: new Set(),
    droppedCount: 0,
  };
  buffers.set(projectId, b);
  return b;
}

export function clearBuffer(projectId: string): void {
  buffers.delete(projectId);
}

/**
 * Push an event into the buffer. Implements the §6.3 drop policy:
 * structured events (everything except build_log/build_progress) are
 * never dropped — if the ring is full we evict the oldest build_log.
 * If even structured events would overflow, we double capacity once
 * up to MAX_HARD_LIMIT, then drop with a warn log.
 */
export function pushEvent(buffer: ProjectBuildBuffer, event: BuildEvent): void {
  const isStructured = event.type !== "build_log" && event.type !== "build_progress";

  if (buffer.events.size() < buffer.events.capacity) {
    buffer.events.push(event);
    fanOut(buffer, event);
    return;
  }

  // Full. Try to evict an old build_log first.
  const evictableTypes = new Set(["build_log", "build_progress"]);
  const arr = buffer.events.toArray();
  let canEvict = false;
  for (const e of arr) {
    if (evictableTypes.has(e.type)) {
      canEvict = true;
      break;
    }
  }

  if (canEvict || !isStructured) {
    const { evicted } = buffer.events.push(event);
    if (evicted) buffer.droppedCount++;
    fanOut(buffer, event);
    return;
  }

  // Structured event with no evictable slot. Grow once to absorb the spike.
  if (buffer.events.capacity < MAX_HARD_LIMIT) {
    const newCap = Math.min(buffer.events.capacity * 2, MAX_HARD_LIMIT);
    const grown = makeRingBuffer<BuildEvent>(newCap);
    for (const e of arr) grown.push(e);
    buffer.events = grown;
    buffer.events.push(event);
    fanOut(buffer, event);
    console.warn(
      `[build-events/buffer] grew project ${buffer.projectId} buffer to ${newCap}`,
    );
    return;
  }

  // Hard limit hit on a structured event — should never happen in
  // healthy operation. Drop and increment metric.
  buffer.droppedCount++;
  console.warn(
    `[build-events/buffer] HARD LIMIT hit for project ${buffer.projectId}; dropping ${event.type}`,
  );
}

function fanOut(buffer: ProjectBuildBuffer, event: BuildEvent): void {
  for (const sub of buffer.subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.warn(
        `[build-events/buffer] subscriber error for project ${buffer.projectId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
