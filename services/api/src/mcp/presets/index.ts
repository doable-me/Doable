/**
 * MCP connector presets registry (Phase 2B).
 *
 * Maps an integration id (from `integration_connections.integration_id`) to a
 * builder function that synthesizes a VIRTUAL `McpConnectorConfig` for that
 * connection. Virtual connectors are rebuilt on every `loadMcpTools` call —
 * they do not touch the `mcp_connectors` table — so rotating an OAuth token
 * on the underlying connection row just works without a DB write.
 *
 * Used exclusively by `services/api/src/ai/providers/copilot.ts:loadMcpTools`.
 * New presets (github, stripe, postgres) can be added here without touching
 * the copilot engine.
 */

import type { McpConnectorConfig } from "../types.js";
import type { DecryptedConnection } from "../../integrations/types.js";
import { buildSupabaseConnectorConfig } from "./supabase.js";

/**
 * A preset builder returns either a config to mount, or `null` when the
 * connection is missing required data (e.g., no projectRef / no access token).
 * The `context.allConnections` escape hatch lets a builder peek at sibling
 * connections in the same scope — required for Supabase, which splits the
 * mgmt OAuth token and the project scoping across two separate rows.
 */
export type PresetBuilder = (
  connection: DecryptedConnection,
  context?: { allConnections?: DecryptedConnection[] },
) => McpConnectorConfig | null;

/**
 * Registry keyed by `integration_connections.integration_id`. Adding an
 * entry here automatically wires it into `loadMcpTools` on the next chat turn.
 *
 * Only the data-plane row (`supabase`) is a registry key — its metadata
 * carries the `projectRef` the MCP server needs. The builder then probes
 * `context.allConnections` for a sibling `supabase-mgmt` OAuth row to get the
 * Management API access token. If the user has connected the mgmt OAuth but
 * no project yet, no MCP surface is mounted (intentional — the server can't
 * run unscoped).
 */
const PRESETS: Record<string, PresetBuilder> = {
  supabase: buildSupabaseConnectorConfig,
  // Future: github, stripe, postgres
};

/**
 * Build virtual MCP connector configs for every matching connection.
 *
 * Walks the decrypted-connection list once, dispatches each match to its
 * preset builder, and dedupes results by the synthesized connector id. Each
 * builder receives a `context.allConnections` escape hatch so it can peek at
 * sibling rows in the same scope (e.g., Supabase splits mgmt OAuth + project
 * scoping across two rows).
 */
export function buildVirtualMcpConnectors(
  connections: DecryptedConnection[],
): McpConnectorConfig[] {
  const out = new Map<string, McpConnectorConfig>();
  const context = { allConnections: connections };

  for (const conn of connections) {
    const builder = PRESETS[conn.integration_id];
    if (!builder) continue;
    const cfg = builder(conn, context);
    if (!cfg) continue;

    // Dedupe by the connector's deterministic id so we never double-register
    // the same virtual tool surface (e.g., if the same integration is stored
    // at both workspace and project scope).
    if (!out.has(cfg.id)) {
      out.set(cfg.id, cfg);
    }
  }

  return Array.from(out.values());
}
