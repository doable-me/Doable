/**
 * Pure, DB-free constants and helpers for the builtin doable.data connector.
 * Importable in tests without a database connection.
 */

export const BUILTIN_DATA_TOOLS = [
  "data.query",
  "data.exec",
  "data.migrate",
  "data.schema",
  "data.inspect",
] as const;

export type DataToolName = typeof BUILTIN_DATA_TOOLS[number];

/** The capabilities_cache value set on the connector row at creation. */
export function buildCapabilitiesCache(): Record<string, unknown> {
  return { tools: { listChanged: false } };
}
