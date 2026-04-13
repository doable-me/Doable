export type {
  TraceCollectorContext,
  TraceEvent,
  TraceUsageSummary,
} from "./trace-types.js";
export { categorizeError, filterTraceByCategory, CATEGORY_PREFIXES } from "./trace-types.js";

export {
  safeStringify,
  truncateForDb,
  prepareDbEvents,
  subscribeLiveTrace,
  broadcastTraceEvent,
  getActiveTrace,
  removeActiveTrace,
  registerActiveTrace,
  logTraceEvent,
  persistTraceStreaming,
  persistTraceFinal,
} from "./trace-infra.js";
export type { TraceStreamingRow, TraceFinalRow } from "./trace-infra.js";

export { createTraceCollector } from "./trace-factory.js";
export type { TraceCollector } from "./trace-factory.js";
