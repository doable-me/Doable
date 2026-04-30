/**
 * Browser-side OpenTelemetry tracing.
 *
 * Lazy-init: the caller (TracingInit client component) dynamically imports
 * this module so the OTel runtime is never bundled into the initial server
 * payload, and is fully skipped when NEXT_PUBLIC_TRACING_LEVEL === 'off'.
 *
 * Spans are exported via OTLP/HTTP to the same-origin proxy at
 * `/api/otlp/v1/traces`, which forwards to the API server. No CORS
 * preflight is required since the exporter posts to the same origin.
 */

import { trace, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
  SemanticResourceAttributes,
} from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "doable-web-browser";
const TRACER_NAME = "doable-web-browser";

let initialized = false;
let tracerRef: Tracer | null = null;

/**
 * Initialize browser tracing exactly once. Safe to call multiple times.
 * Returns early if tracing is disabled via NEXT_PUBLIC_TRACING_LEVEL.
 */
export function initBrowserTracing(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  if (process.env.NEXT_PUBLIC_TRACING_LEVEL === "off") return;

  const environment = process.env.NEXT_PUBLIC_ENV || "development";

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  });

  const provider = new WebTracerProvider({ resource });

  const exporter = new OTLPTraceExporter({
    url: `${window.location.origin}/api/otlp/v1/traces`,
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(exporter, {
      // Conservative defaults; the proxy + API can absorb the load.
      maxExportBatchSize: 50,
      scheduledDelayMillis: 2000,
      maxQueueSize: 1000,
    }),
  );

  provider.register();

  // Auto-instrument fetch. Propagate trace context to same-origin and
  // known internal hosts; never to arbitrary cross-origin URLs.
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /^https?:\/\/127\.0\.0\.1(:\d+)?\//,
          /^https?:\/\/localhost(:\d+)?\//,
          /^https?:\/\/[^/]+\.doable\.me\//,
        ],
      }),
    ],
  });

  tracerRef = trace.getTracer(TRACER_NAME);
  initialized = true;
}

/**
 * Get the browser tracer. Falls back to a no-op tracer if init was
 * skipped (e.g. tracing disabled or called server-side).
 */
export function getTracer(): Tracer {
  if (tracerRef) return tracerRef;
  return trace.getTracer(TRACER_NAME);
}
