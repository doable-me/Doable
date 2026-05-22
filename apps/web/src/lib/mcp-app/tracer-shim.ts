// Lightweight tracer accessor for the MCP App host module.
// Avoids a hard dependency at import time on the browser tracing bootstrap;
// when TRACING_LEVEL=off, the API-level no-op tracer is returned with zero cost.

import { trace, type Tracer } from "@opentelemetry/api";

export function getTracer(): Tracer {
  return trace.getTracer("doable-web/mcp-app");
}
