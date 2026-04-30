// OTel SDK bootstrap for the WS service. MUST be imported as the very first
// thing in services/ws/src/index.ts. The kill-switch (TRACING_LEVEL=off)
// skips initialization entirely, returning the API-level no-op tracer.
//
// This is a simplified mirror of services/api/src/tracing/instrumentation.ts.
// We don't replicate the full DoableSampler / level-registry / redacting
// processor stack here — the WS surface is small and tightly scoped, and
// the per-request user/workspace context isn't readily available at sampler
// time anyway. Instead we read TRACING_LEVEL once at startup and pick a
// single static sampler for the lifetime of the process.

import { context, trace } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  type Sampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PostgresSpanExporter } from "./pg-exporter.js";

let initialized = false;

export interface InitOptions {
  serviceName?: string;
  serviceVersion?: string;
}

function pickSampler(level: string): Sampler {
  switch (level) {
    case "off":
      return new AlwaysOffSampler();
    case "full":
    case "debug":
      return new AlwaysOnSampler();
    case "errors-only":
      // No tail-sampling pipeline in WS — record-everything is the
      // closest approximation; exporter still drops on failure.
      return new AlwaysOnSampler();
    case "sampled":
    default: {
      const ratio = Number(process.env.TRACING_SAMPLE_RATIO ?? 0.05);
      return new TraceIdRatioBasedSampler(Number.isFinite(ratio) ? ratio : 0.05);
    }
  }
}

export function initTracing(opts: InitOptions = {}): void {
  if (initialized) return;
  const level = process.env.TRACING_LEVEL ?? "off";
  if (level === "off") {
    // No SDK init at all — `trace.getTracer()` returns the API-level no-op.
    initialized = true;
    return;
  }

  const serviceName = opts.serviceName ?? "doable-ws";
  const serviceVersion = opts.serviceVersion ?? process.env.BUILD_SHA ?? "dev";

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      "deployment.environment": process.env.NODE_ENV ?? "dev",
    }),
    sampler: pickSampler(level),
  });

  const exporter = new PostgresSpanExporter();
  const batch = new BatchSpanProcessor(exporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 256,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 5000,
  });
  provider.addSpanProcessor(batch);

  provider.register();

  initialized = true;
}

/** Returns the tracer for the given module name. Always safe — returns no-op when off. */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

export { context, trace };
