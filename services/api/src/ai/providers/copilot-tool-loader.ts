/**
 * Tool composition — merges built-in Doable tools, native integration
 * tools, and MCP connector tools into a single tool set for a session.
 */

import type { Tool } from "@github/copilot-sdk";
import { createDoableTools } from "./copilot-tools.js";
import { getConnectorManager } from "../../mcp/connector-manager.js";
import { createMcpTools } from "../../mcp/tool-bridge.js";
import type { McpConnectorConfig } from "../../mcp/types.js";
import type { DecryptedConnection } from "../../integrations/types.js";
import { connectorQueries, marketplaceQueries } from "@doable/db";

/**
 * Create all tools (built-in + native integrations + MCP) for a session.
 * Native integration and MCP failures are logged but don't block built-in tools.
 */
export async function createAllTools(
  projectId: string,
  workspaceId?: string,
  userId?: string,
): Promise<Tool[]> {
  const builtinTools = createDoableTools(projectId, userId);
  if (!workspaceId) return builtinTools;

  let connectorFilter: string[] | undefined;
  try {
    const { sql } = await import("../../db/index.js");
    const mktDb = marketplaceQueries(sql);
    const { environment } = await mktDb.resolveEffectiveEnvironment(workspaceId, projectId);
    if (environment && environment.connectorRefs.length > 0) {
      connectorFilter = environment.connectorRefs;
    }
    if (environment && environment.connectorRefs.length === 0) {
      connectorFilter = [];
    }
  } catch (err) {
    console.warn("[CopilotEngine] Failed to resolve effective environment:", err);
  }

  const [integrationTools, mcpTools] = await Promise.all([
    loadIntegrationTools(workspaceId, projectId, userId),
    loadMcpTools(workspaceId, projectId, userId, connectorFilter),
  ]);

  return [...builtinTools, ...integrationTools, ...mcpTools];
}

async function loadIntegrationTools(
  workspaceId: string,
  projectId: string,
  userId?: string,
): Promise<Tool[]> {
  try {
    const { createIntegrationTools } = await import("../../integrations/tool-bridge.js");
    const tools = await createIntegrationTools({ workspaceId, projectId, userId: userId ?? "" });
    if (tools.length > 0) console.log(`[CopilotEngine] Loaded ${tools.length} native integration tools`);
    return tools;
  } catch (err) {
    console.warn("[CopilotEngine] Native integration tool loading failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function loadMcpTools(
  workspaceId: string,
  projectId: string,
  userId?: string,
  connectorFilter?: string[],
): Promise<Tool[]> {
  try {
    const { sql } = await import("../../db/index.js");
    const connectors = connectorQueries(sql);
    const manager = getConnectorManager();

    // DB-backed MCP connectors
    let connectorRows: Array<Record<string, any>> = [];
    if (!(connectorFilter && connectorFilter.length === 0)) {
      const allRows = await connectors.getEffectiveConnectors(workspaceId, projectId, userId);
      connectorRows = connectorFilter
        ? allRows.filter((r) => connectorFilter.includes(r.id))
        : allRows;
    }

    const configs = new Map<string, McpConnectorConfig>();
    for (const row of connectorRows) {
      configs.set(row.id, {
        id: row.id, workspaceId: row.workspace_id, projectId: row.project_id ?? undefined,
        scope: row.scope, name: row.name, description: row.description ?? undefined,
        transportType: row.transport_type, serverUrl: row.server_url ?? undefined,
        serverCommand: row.server_command ?? undefined, serverArgs: row.server_args ?? [],
        authType: row.auth_type, status: row.status as McpConnectorConfig["status"],
        createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
      });
    }

    // Virtual MCP connectors from integration connections
    try {
      const { credentialVault } = await import("../../integrations/credential-vault.js");
      const { buildVirtualMcpConnectors } = await import("../../mcp/presets/index.js");
      const effectiveConns = await credentialVault.getEffective(workspaceId, projectId, userId);

      const seen = new Set<string>();
      const deduped: typeof effectiveConns = [];
      for (const c of effectiveConns) {
        if (seen.has(c.integration_id)) continue;
        seen.add(c.integration_id);
        deduped.push(c);
      }

      const decrypted = await Promise.all(
        deduped.map(async (c) => {
          try {
            const creds = await credentialVault.decrypt(c.id);
            if (!creds || typeof creds !== "object") return null;
            const { credentials_encrypted: _ignored, ...rest } = c as typeof c & { credentials_encrypted?: unknown };
            return { ...rest, credentials: creds } as DecryptedConnection;
          } catch { return null; }
        }),
      );

      const valid = decrypted.filter((c): c is DecryptedConnection => c !== null);
      const virtualConfigs = buildVirtualMcpConnectors(valid);
      for (const cfg of virtualConfigs) {
        if (!configs.has(cfg.id)) configs.set(cfg.id, cfg);
      }
      if (virtualConfigs.length > 0) {
        console.log(`[CopilotEngine] Synthesized ${virtualConfigs.length} virtual MCP connector(s)`);
      }
    } catch (err) {
      console.warn("[CopilotEngine] Virtual MCP connector synthesis failed:", err instanceof Error ? err.message : err);
    }

    if (configs.size === 0) return [];

    const resolvedTools = await manager.getEffectiveTools(Array.from(configs.values()));
    if (resolvedTools.length === 0) return [];

    const mcpTools = createMcpTools(resolvedTools, manager, configs, projectId);
    console.log(`[CopilotEngine] Loaded ${mcpTools.length} MCP tools from ${configs.size} connectors`);
    return mcpTools;
  } catch (err) {
    console.warn("[CopilotEngine] MCP tool loading failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
