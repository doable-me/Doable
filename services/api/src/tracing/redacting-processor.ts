// RedactingSpanProcessor wraps another SpanProcessor and scrubs sensitive data
// from span attributes, events, and exceptions BEFORE spans leave the SDK.

import type { Context } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ALWAYS_REDACT_KEYS, DENY_BY_DEFAULT_PREFIXES, scrubSecrets } from "./secret-patterns.js";

export interface RedactionConfig {
  /** When true, fully strip deny-by-default attributes (replace with size marker). */
  stripBodies: boolean;
  /** Allow additional attribute key prefixes to be allow-listed. */
  allowKeyPrefixes?: string[];
}

export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private inner: SpanProcessor, private cfg: RedactionConfig) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    redactSpan(span, this.cfg);
    this.inner.onEnd(span);
  }

  shutdown(): Promise<void> { return this.inner.shutdown(); }
  forceFlush(): Promise<void> { return this.inner.forceFlush(); }
}

function redactSpan(span: ReadableSpan, cfg: RedactionConfig): void {
  // attributes
  const attrs = span.attributes as Record<string, unknown>;
  for (const key of Object.keys(attrs)) {
    if (ALWAYS_REDACT_KEYS.has(key)) {
      attrs[key] = "[REDACTED]";
      continue;
    }
    if (cfg.stripBodies && DENY_BY_DEFAULT_PREFIXES.some((p) => key.startsWith(p))) {
      const v = attrs[key];
      if (typeof v === "string") attrs[key] = `[REDACTED:${v.length} bytes]`;
      else attrs[key] = `[REDACTED]`;
      continue;
    }
    const v = attrs[key];
    if (typeof v === "string") attrs[key] = scrubSecrets(v);
  }

  // events: each may have its own attributes
  for (const ev of span.events) {
    const eAttrs = ev.attributes as Record<string, unknown> | undefined;
    if (!eAttrs) continue;
    for (const k of Object.keys(eAttrs)) {
      if (ALWAYS_REDACT_KEYS.has(k)) {
        eAttrs[k] = "[REDACTED]";
        continue;
      }
      const v = eAttrs[k];
      if (typeof v === "string") eAttrs[k] = scrubSecrets(v);
    }
  }

  // status message
  const status = span.status as { code: number; message?: string };
  if (status.message) status.message = scrubSecrets(status.message);
}

export function defaultRedactionConfig(): RedactionConfig {
  // In `debug` level, bodies pass through so support engineers see real content.
  // In every other level, strip bodies.
  const level = process.env.TRACING_LEVEL ?? "off";
  return { stripBodies: level !== "debug" };
}
