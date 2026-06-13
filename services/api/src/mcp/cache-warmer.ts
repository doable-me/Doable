/**
 * MCP capabilities-cache warmer.
 *
 * Root cause this fixes:
 *   When a user adds an MCP connector and immediately triggers AI generation,
 *   the auto-test that populates `mcp_connectors.capabilities_cache` is fired
 *   *non-blockingly* from the POST /connectors route. If generation starts
 *   before that probe completes (devtunnel cold start, slow remote, etc.),
 *   `buildConnectedMcpServersContext` reads an empty cache → emits the fallback
 *   "tools load on first use" line → the AI never sees real `mcp_…` tool names
 *   → it hallucinates names and bakes them as code strings, producing apps that
 *   show no data and chatbots that can't summarise responses.
 *
 *   The fix is a synchronous warm-up just before we read the cache to build
 *   the prompt: for every external (non-builtin) active connector in the
 *   workspace whose `capabilities_cache.tools.list` is missing or empty, probe
 *   the MCP server once with a tight per-connector timeout and persist the
 *   result. Bounded by an overall wall-clock budget so a single dead connector
 *   can never make chat hang.
 *
 *   Generic by construction — works for any MCP server on any install
 *   (docker / baremetal / doable-cli) because it operates entirely on the
 *   already-existing connector row + ConnectorManager.testConnection path.
 */

import { sql } from "../db/index.js";
import { connectorQueries, type McpConnectorRow } from "@doable/db";
import { BUILTIN_MCP_APPS } from "./builtin-connectors.js";
import { getConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig } from "./types.js";

const connectors = connectorQueries(sql);
const BUILTIN_CONNECTOR_NAMES = new Set(BUILTIN_MCP_APPS.map((a) => a.name));

/** Default budgets — chosen so the first generation after adding a connector
 *  waits long enough for a normal MCP server to respond, but never holds chat
 *  hostage if the server is dead. */
const DEFAULT_PER_CONNECTOR_TIMEOUT_MS = 8_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 12_000;

interface CacheTools {
  tools?: { list?: Array<{ name: string; description?: string }> };
}

function isCacheEmpty(row: McpConnectorRow): boolean {
  const cache = row.capabilities_cache as CacheTools | null;
  const list = cache?.tools?.list;
  return !Array.isArray(list) || list.length === 0;
}

function isExternal(row: McpConnectorRow): boolean {
  return (
    row.status === "active" &&
    !(row.server_command ?? "").startsWith("builtin:") &&
    !BUILTIN_CONNECTOR_NAMES.has(row.name)
  );
}

function rowToProbeConfig(row: McpConnectorRow): McpConnectorConfig {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    scope: row.scope,
    name: row.name,
    description: row.description ?? undefined,
    transportType: row.transport_type,
    serverUrl: row.server_url ?? undefined,
    serverCommand: row.server_command ?? undefined,
    serverArgs: row.server_args ?? [],
    authType: row.auth_type,
    status: row.status as McpConnectorConfig["status"],
    capabilitiesCache: (row.capabilities_cache as McpConnectorConfig["capabilitiesCache"]) ?? undefined,
    lastConnectedAt: row.last_connected_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}: timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function probeAndPersist(row: McpConnectorRow, perConnectorTimeoutMs: number): Promise<void> {
  const config = rowToProbeConfig(row);
  const manager = getConnectorManager();
  const result = await withTimeout(
    manager.testConnection(config),
    perConnectorTimeoutMs,
    `[mcp-cache-warmer] probe ${config.name}`,
  );
  if (result.success && result.tools) {
    await connectors.updateConnectorStatus(row.id, "active", {
      capabilities: {
        tools: {
          count: result.tools.length,
          list: result.tools.map((t) => ({ name: t.name, description: t.description })),
        },
      },
    });
    console.log(
      `[mcp-cache-warmer] populated ${config.name}: ${result.tools.length} tools`,
    );
  } else if (!result.success) {
    // Don't downgrade status — the cache simply stays empty for this call.
    // The next generation request will retry. We log so failures are visible.
    console.warn(
      `[mcp-cache-warmer] probe failed for ${config.name}: ${result.error ?? "(no error)"}`,
    );
  }
}

/**
 * For every external (user-added, non-builtin) active MCP connector in the
 * workspace whose capabilities cache is empty, probe synchronously and persist
 * the freshly discovered tool list. Bounded by `perConnectorTimeoutMs` per
 * connector and `totalTimeoutMs` overall.
 *
 * Best-effort: this function NEVER throws. If a probe fails or times out the
 * cache simply stays empty for the current request and the existing fallback
 * "(tools load on first use)" line is shown — the same behavior we had before
 * this fix, so we degrade gracefully instead of breaking chat.
 */
export async function ensureMcpCacheFresh(
  workspaceId: string,
  opts?: { perConnectorTimeoutMs?: number; totalTimeoutMs?: number },
): Promise<void> {
  const perConnectorTimeoutMs =
    opts?.perConnectorTimeoutMs ?? DEFAULT_PER_CONNECTOR_TIMEOUT_MS;
  const totalTimeoutMs = opts?.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

  let rows: McpConnectorRow[];
  try {
    rows = await connectors.listConnectors(workspaceId);
  } catch (err) {
    console.warn("[mcp-cache-warmer] failed to list connectors:", err);
    return;
  }

  const stale = rows.filter((r) => isExternal(r) && isCacheEmpty(r));
  if (stale.length === 0) return;

  console.log(
    `[mcp-cache-warmer] warming ${stale.length} connector(s) for workspace=${workspaceId.slice(0, 8)}: ${stale.map((r) => r.name).join(", ")}`,
  );

  const probes = stale.map((r) =>
    probeAndPersist(r, perConnectorTimeoutMs).catch((err) => {
      console.warn(
        `[mcp-cache-warmer] ${r.name}: ${err instanceof Error ? err.message : err}`,
      );
    }),
  );

  await withTimeout(
    Promise.allSettled(probes).then(() => undefined),
    totalTimeoutMs,
    "[mcp-cache-warmer] overall warm-up",
  ).catch((err) => {
    console.warn(
      `[mcp-cache-warmer] overall timeout — some connectors did not finish warming: ${err instanceof Error ? err.message : err}`,
    );
  });
}
