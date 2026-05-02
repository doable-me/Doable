/**
 * Build-event publisher.
 *
 * Per devframeworkPRD/03-build-event-protocol.md §8. Sits at the
 * dev-server / build-runner stdout boundary. Every line:
 *   1. runs through the redaction filter chain (PRD 04 §2)
 *   2. is appended to a batched `build_log` event
 *   3. is offered to the framework adapter's optional `parseLog` so
 *      structured events (`build_phase_started`, `build_route`,
 *      `build_error`, ...) can be emitted alongside the raw line.
 *
 * Both flows always run — adapter parsing is enrichment, NEVER a gate
 * (PRD 03 §7 invariant).
 */

import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

import { LogFilterChain } from "./filters/chain.js";
import type { FilterContext } from "./filters/types.js";
import type { BuildEvent, BuildEventInput } from "./types.js";
import { getOrCreateBuffer, pushEvent, type ProjectBuildBuffer } from "./buffer.js";

// ─── Batching policy (PRD 03 §6.2) ────────────────────────

const MAX_LINES_PER_BATCH = 50;
const MAX_BUFFER_BYTES = 8 * 1024;
const MIN_FLUSH_MS = 50;
const MAX_LINE_BYTES = 8192;

// ─── Publisher ────────────────────────────────────────────

export class BuildEventPublisher {
  private buffer: ProjectBuildBuffer;
  // Per-stream batch state. Keyed by "stdout"|"stderr".
  private pendingByStream = new Map<
    "stdout" | "stderr",
    { lines: string[]; firstLineNo: number; sizeBytes: number; flushTimer: NodeJS.Timeout | null }
  >();
  // Per-stream monotonic line counter, scoped to the active buildId.
  private lineNoByStream = new Map<"stdout" | "stderr", number>();

  constructor(
    private readonly projectId: string,
    private readonly filterChain: LogFilterChain,
    private readonly filterCtxBase: Omit<FilterContext, "stream" | "buildId">,
  ) {
    this.buffer = getOrCreateBuffer(projectId);
  }

  /**
   * Wire stdout/stderr of a spawned process into the publisher. The
   * adapter parameter is optional — when present, its `parseLog` is
   * called per line for structured-event extraction.
   */
  attach(child: ChildProcess, buildId: string, adapter?: { parseLog?: (line: string) => BuildEventInput | null }): void {
    this.lineNoByStream.set("stdout", 0);
    this.lineNoByStream.set("stderr", 0);
    if (child.stdout) this.wireStream(child.stdout, "stdout", buildId, adapter);
    if (child.stderr) this.wireStream(child.stderr, "stderr", buildId, adapter);
    child.once("close", () => {
      this.flush("stdout", buildId);
      this.flush("stderr", buildId);
    });
  }

  /**
   * Publish a structured event (build_phase_started, build_error, etc.)
   * directly. Useful when the caller knows phase boundaries without
   * needing to parse logs.
   */
  publish(input: BuildEventInput, buildId: string): void {
    // Flush log batches first so order is preserved.
    this.flush("stdout", buildId);
    this.flush("stderr", buildId);
    const event = this.assignSeqAndTs(input, buildId);
    pushEvent(this.buffer, event);
  }

  // ─── Internals ────────────────────────────────────────

  private wireStream(
    stream: Readable,
    streamKind: "stdout" | "stderr",
    buildId: string,
    adapter?: { parseLog?: (line: string) => BuildEventInput | null },
  ): void {
    splitLines(stream, (rawLine) => {
      const line = truncate(rawLine);
      const ctx: FilterContext = {
        ...this.filterCtxBase,
        stream: streamKind,
        buildId,
      };
      const filtered = this.filterChain.run(line, ctx);
      if (filtered === null) return; // dropped by filter / fail-closed
      this.appendLog(streamKind, filtered, buildId);

      if (adapter?.parseLog) {
        try {
          const parsed = adapter.parseLog(filtered);
          if (parsed) {
            this.flush(streamKind, buildId);
            const event = this.assignSeqAndTs(parsed, buildId);
            pushEvent(this.buffer, event);
          }
        } catch (err) {
          console.warn(
            `[build-events/publisher] adapter.parseLog threw for ${this.projectId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
  }

  private appendLog(streamKind: "stdout" | "stderr", line: string, buildId: string): void {
    let pending = this.pendingByStream.get(streamKind);
    if (!pending) {
      pending = {
        lines: [],
        firstLineNo: this.nextLineNo(streamKind),
        sizeBytes: 0,
        flushTimer: null,
      };
      this.pendingByStream.set(streamKind, pending);
    } else if (pending.lines.length === 0) {
      pending.firstLineNo = this.nextLineNo(streamKind);
    }
    pending.lines.push(line);
    pending.sizeBytes += line.length + 1;
    this.bumpLineNo(streamKind);

    if (
      pending.lines.length >= MAX_LINES_PER_BATCH ||
      pending.sizeBytes >= MAX_BUFFER_BYTES
    ) {
      this.flush(streamKind, buildId);
      return;
    }

    if (!pending.flushTimer) {
      pending.flushTimer = setTimeout(
        () => this.flush(streamKind, buildId),
        MIN_FLUSH_MS,
      );
    }
  }

  private flush(streamKind: "stdout" | "stderr", buildId: string): void {
    const pending = this.pendingByStream.get(streamKind);
    if (!pending || pending.lines.length === 0) {
      if (pending?.flushTimer) {
        clearTimeout(pending.flushTimer);
        pending.flushTimer = null;
      }
      return;
    }
    const event = this.assignSeqAndTs(
      {
        type: "build_log",
        data: {
          stream: streamKind,
          lines: pending.lines,
          firstLineNo: pending.firstLineNo,
        },
      },
      buildId,
    );
    pending.lines = [];
    pending.sizeBytes = 0;
    if (pending.flushTimer) {
      clearTimeout(pending.flushTimer);
      pending.flushTimer = null;
    }
    pushEvent(this.buffer, event);
  }

  private assignSeqAndTs(input: BuildEventInput, buildId: string): BuildEvent {
    const seq = this.buffer.nextSeq++;
    const ts = Date.now();
    return { ...input, seq, ts, buildId } as BuildEvent;
  }

  private nextLineNo(streamKind: "stdout" | "stderr"): number {
    return this.lineNoByStream.get(streamKind) ?? 0;
  }

  private bumpLineNo(streamKind: "stdout" | "stderr"): void {
    this.lineNoByStream.set(
      streamKind,
      (this.lineNoByStream.get(streamKind) ?? 0) + 1,
    );
  }
}

// ─── Subscribers ──────────────────────────────────────────

/**
 * Register a subscriber for a project's build event stream. Returns an
 * unsubscribe function. Per PRD 03 §4 — both chat-SSE handlers and the
 * dedicated `/projects/:id/build/stream` endpoint subscribe through
 * this helper so they share one fan-out path with the publisher.
 *
 * The subscriber callback runs synchronously inside `pushEvent`'s
 * fan-out loop; throws are caught and logged by `buffer.ts` so a single
 * misbehaving subscriber cannot block the others.
 */
export function subscribe(
  projectId: string,
  fn: (e: BuildEvent) => void,
): () => void {
  const buf = getOrCreateBuffer(projectId);
  buf.subscribers.add(fn);
  return () => {
    buf.subscribers.delete(fn);
  };
}

// ─── Helpers ──────────────────────────────────────────────

function truncate(line: string): string {
  if (line.length <= MAX_LINE_BYTES) return line;
  return `${line.slice(0, MAX_LINE_BYTES)}<TRUNC:+${line.length - MAX_LINE_BYTES}>`;
}

function splitLines(stream: Readable, onLine: (line: string) => void): void {
  let carry = "";
  stream.on("data", (chunk: Buffer | string) => {
    carry += typeof chunk === "string" ? chunk : chunk.toString();
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  });
  stream.on("end", () => {
    if (carry.length > 0) {
      onLine(carry);
      carry = "";
    }
  });
}
