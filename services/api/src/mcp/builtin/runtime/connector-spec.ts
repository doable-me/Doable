/**
 * Pure, DB-free constants and helpers for the builtin doable.runtime connector.
 * Importable in tests without a database connection.
 */

export const BUILTIN_RUNTIME_TOOLS = [
  "runtime.validate",
  "runtime.upsert_query",
  "runtime.test_query",
  "runtime.apply_data_template",
  "runtime.upsert_schedule",
  "runtime.upsert_webhook",
  "runtime.upsert_cdc_binding",
  "runtime.test_workflow",
  "runtime.openapi",
] as const;

export type RuntimeToolName = (typeof BUILTIN_RUNTIME_TOOLS)[number];

/** The capabilities_cache value set on the connector row at creation. */
export function buildCapabilitiesCache(): Record<string, unknown> {
  return { tools: { listChanged: false } };
}
