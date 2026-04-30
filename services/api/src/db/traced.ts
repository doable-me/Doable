// Hot-path DB query tracing helper.
//
// Wraps a postgres.js query in (a) an OpenTelemetry `db <name>` span with
// `db.system=postgresql`, `db.statement`, and `db.rows` attributes, and
// (b) a call to the existing `traceQuery()` stats/log helper.
//
// Usage (apply to hot paths in Phase C — does NOT touch existing call sites):
//   import { tracedQuery } from "./traced.js";
//   const rows = await tracedQuery(
//     "projects.findById",
//     "SELECT * FROM projects WHERE id = $1",
//     () => sql`SELECT * FROM projects WHERE id = ${id}`,
//   );
//
// The `name` argument is a short logical label (e.g. "projects.findById") used
// for the span name. The `sqlText` argument is a human-readable SQL snippet
// used for `db.statement` and the trace log; it is sliced to 500 chars to keep
// span attribute sizes bounded. The `run` function is the actual postgres.js
// invocation (typically a tagged-template literal returning a thenable).

import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "../tracing/instrumentation.js";
import { traceQuery } from "./query-tracer.js";

export async function tracedQuery<T>(
  name: string,
  sqlText: string,
  run: () => Promise<T>,
): Promise<T> {
  const tracer = getTracer("doable-api/db");
  return tracer.startActiveSpan(`db ${name}`, async (span) => {
    span.setAttribute("db.system", "postgresql");
    span.setAttribute("db.statement", sqlText.slice(0, 500));
    const t0 = Date.now();
    try {
      const result = await run();
      const dt = Date.now() - t0;
      const rowCount = Array.isArray(result) ? result.length : undefined;
      traceQuery(sqlText, dt, undefined, rowCount);
      span.setAttribute("db.rows", rowCount ?? 0);
      return result;
    } catch (err) {
      const dt = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      traceQuery(sqlText, dt, message);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw err;
    } finally {
      span.end();
    }
  });
}
