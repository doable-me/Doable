// OTel SDK bootstrap. MUST be imported BEFORE any other instrumented module
// in services/api/src/index.ts. The kill-switch (TRACING_LEVEL=off) skips
// initialization entirely, returning a no-op tracer with zero overhead.

import { context, trace } from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { DoableSampler } from "./sampler.js";
import { PostgresSpanExporter } from "./pg-exporter.js";
import {
  RedactingSpanProcessor,
  defaultRedactionConfig,
} from "./redacting-processor.js";
import { SERVICE_NAMES } from "./types.js";
import { refreshOverrideCaches } from "./level-registry.js";

let initialized = false;

export interface InitOptions {
  serviceName?: string;
  serviceVersion?: string;
}

export function initTracing(opts: InitOptions = {}): void {
  if (initialized) return;
  const level = process.env.TRACING_LEVEL ?? "off";
  if (level === "off") {
    // No SDK init at all — `trace.getTracer()` returns the API-level no-op.
    initialized = true;
    return;
  }

  const serviceName = opts.serviceName ?? SERVICE_NAMES.api;
  const serviceVersion = opts.serviceVersion ?? process.env.BUILD_SHA ?? "dev";

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      "deployment.environment": process.env.NODE_ENV ?? "dev",
    }),
    sampler: new DoableSampler(),
  });

  const exporter = new PostgresSpanExporter();
  const batch = new BatchSpanProcessor(exporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 256,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 5000,
  });
  const redacting = new RedactingSpanProcessor(batch, defaultRedactionConfig());
  provider.addSpanProcessor(redacting);

  provider.register();

  // Auto-instrument outgoing HTTP/fetch. Hono middleware handles incoming —
  // ignore it here to avoid duplicate request spans. UndiciInstrumentation
  // captures global fetch (Node 18+) used by integrations + provider bridges.
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: () => true }),
      new UndiciInstrumentation(),
    ],
  });

  // Kick off cache loader; subsequent samplers will pick up overrides.
  refreshOverrideCaches().catch(() => {});

  initialized = true;
}

/** Returns the tracer for the given module name. Always safe — returns no-op when off. */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

export { context, trace };
