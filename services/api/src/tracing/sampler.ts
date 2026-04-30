// DoableSampler: custom OpenTelemetry sampler honoring kill-switch hierarchy.
// See packages/db/migrations/053_tracing_tables.sql + level-registry.ts.

import {
  Sampler,
  SamplingDecision,
  SamplingResult,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import type { Attributes, Context, Link, SpanKind } from "@opentelemetry/api";
import { getRequestContext } from "./als.js";
import { resolveLevel, getGlobalLevel } from "./level-registry.js";
import type { TracingLevel } from "./types.js";

const DEFAULT_RATIO = Number(process.env.TRACING_SAMPLE_RATIO ?? 0.05);

const ratioSamplerCache = new Map<number, TraceIdRatioBasedSampler>();
function ratioSampler(r: number): TraceIdRatioBasedSampler {
  let s = ratioSamplerCache.get(r);
  if (!s) {
    s = new TraceIdRatioBasedSampler(r);
    ratioSamplerCache.set(r, s);
  }
  return s;
}

export class DoableSampler implements Sampler {
  shouldSample(
    parentContext: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    const ctx = getRequestContext();
    const level: TracingLevel = resolveLevel({
      userId: ctx?.userId,
      workspaceId: ctx?.workspaceId,
      spanName,
    });

    const samplerAttrs: Attributes = { "doable.sampling.level": level };

    if (level === "off") {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    if (level === "full" || level === "debug") {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED, attributes: samplerAttrs };
    }

    if (level === "errors-only") {
      // RECORD: emit so tail-sampling at exporter can decide. Exporter only
      // persists traces that contain at least one ERROR span.
      return { decision: SamplingDecision.RECORD, attributes: samplerAttrs };
    }

    // sampled: head-ratio
    // TraceIdRatioBasedSampler in OTel SDK 1.x only inspects (context, traceId);
    // the wider Sampler interface signature is intentionally tolerant.
    const inner = ratioSampler(DEFAULT_RATIO);
    const r = inner.shouldSample(parentContext, traceId);
    return {
      decision: r.decision,
      attributes: { ...(r.attributes ?? {}), ...samplerAttrs },
      traceState: r.traceState,
    };
  }

  toString() {
    return `DoableSampler{global=${getGlobalLevel()}}`;
  }
}
