/**
 * docore tracer — lightweight span-level tracing for xray integration.
 *
 * Zero dependencies. Consumers provide a TracerSink callback to receive
 * completed spans with timing and metadata.
 */

// ─── Types ──────────────────────────────────────────────

export interface Span {
  /** Unique span ID */
  id: string;
  /** Operation name (e.g. "engine.connect", "user.acquire") */
  name: string;
  /** Parent span ID, if nested */
  parentId?: string;
  /** Extra metadata attached at span start */
  attributes: Record<string, unknown>;
  /** Epoch ms when the span started */
  startedAt: number;
  /** Epoch ms when the span ended (null while running) */
  endedAt: number | null;
  /** Duration in ms (null while running) */
  durationMs: number | null;
  /** "ok" or "error" */
  status: "ok" | "error";
  /** Error message if status is "error" */
  error?: string;
}

/** Callback that receives completed spans. */
export type TracerSink = (span: Span) => void;

/** Handle returned by tracer.start() to end a span. */
export interface SpanHandle {
  readonly span: Span;
  /** Add attributes during execution. */
  set(key: string, value: unknown): void;
  /** End the span successfully. */
  end(extra?: Record<string, unknown>): void;
  /** End the span with an error. */
  fail(error: string, extra?: Record<string, unknown>): void;
  /** Create a child span. */
  child(name: string, attributes?: Record<string, unknown>): SpanHandle;
}

// ─── Tracer ─────────────────────────────────────────────

let spanSeq = 0;

export class Tracer {
  private sink: TracerSink | null;

  constructor(sink?: TracerSink) {
    this.sink = sink ?? null;
  }

  /** Start a new span. Returns a handle to end it. */
  start(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
    const span: Span = {
      id: `span-${++spanSeq}-${Date.now()}`,
      name,
      attributes: { ...attributes },
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      status: "ok",
    };
    return this.createHandle(span);
  }

  private createHandle(span: Span): SpanHandle {
    const sink = this.sink;
    const self = this;

    return {
      get span() { return span; },

      set(key: string, value: unknown) {
        span.attributes[key] = value;
      },

      end(extra?: Record<string, unknown>) {
        if (span.endedAt !== null) return; // idempotent
        span.endedAt = Date.now();
        span.durationMs = span.endedAt - span.startedAt;
        span.status = "ok";
        if (extra) Object.assign(span.attributes, extra);
        sink?.(span);
      },

      fail(error: string, extra?: Record<string, unknown>) {
        if (span.endedAt !== null) return;
        span.endedAt = Date.now();
        span.durationMs = span.endedAt - span.startedAt;
        span.status = "error";
        span.error = error;
        if (extra) Object.assign(span.attributes, extra);
        sink?.(span);
      },

      child(name: string, attributes: Record<string, unknown> = {}): SpanHandle {
        const childSpan: Span = {
          id: `span-${++spanSeq}-${Date.now()}`,
          name,
          parentId: span.id,
          attributes: { ...attributes },
          startedAt: Date.now(),
          endedAt: null,
          durationMs: null,
          status: "ok",
        };
        return self.createHandle(childSpan);
      },
    };
  }
}

/** No-op tracer — zero overhead when tracing is disabled. */
export const noopTracer = new Tracer();
