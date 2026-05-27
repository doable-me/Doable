/**
 * Tool composition — merges built-in Doable tools, native integration
 * tools, and MCP connector tools into a single tool set for a session.
 *
 * Supports progressive tool loading: when there are many MCP tools (>20),
 * only a lightweight mcp_discover_tools meta-tool is injected. The AI uses
 * it to search for relevant tools, which are then returned with full schemas.
 * All MCP tools are still callable even when deferred — only their definitions
 * are withheld from the initial context to save tokens.
 */

import { defineTool, type Tool } from "@github/copilot-sdk";
import { createDoableTools } from "./copilot-tools.js";
import { getConnectorManager } from "../../mcp/connector-manager.js";
import { createMcpTools } from "../../mcp/tool-bridge.js";
import type { McpConnectorConfig, ResolvedMcpTool } from "../../mcp/types.js";
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
  // Quick check: does this workspace have Supabase connected?
  let hasSupabase = false;
  if (workspaceId) {
    try {
      const { sql } = await import("../../db/index.js");
      const [row] = await sql`
        SELECT 1 FROM integration_connections
        WHERE workspace_id = ${workspaceId}
          AND integration_id = 'supabase-mgmt'
          AND status = 'active'
        LIMIT 1
      `;
      hasSupabase = !!row;
    } catch {}
  }

  const builtinTools = createDoableTools(projectId, userId, workspaceId, { hasSupabase });
  if (!workspaceId) return builtinTools;

  let connectorFilter: string[] | undefined;
  try {
    const { sql } = await import("../../db/index.js");
    const mktDb = marketplaceQueries(sql);
    const { environment } = await mktDb.resolveEffectiveEnvironment(workspaceId, projectId);
    if (environment && environment.connectorRefs.length > 0) {
      connectorFilter = environment.connectorRefs;
    }
    // When environment exists but has no explicit connector refs,
    // leave connectorFilter undefined so all workspace connectors
    // are available.  Empty refs means "not configured", not "block all".
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

    // Lazy-provision the built-in doable.data connector. Projects can be
    // materialized through several paths (POST /projects, the chat
    // create-if-missing seam, dashboard scaffold), and not all of them run
    // the creation-time hook. Provisioning here — the single point every AI
    // turn loads tools through — guarantees the connector exists whenever the
    // feature is on, no matter how the project was created. Idempotent and
    // gated by a cheap indexed lookup so it only writes once per project.
    if (process.env.DOABLE_APP_DB_ENABLED !== "0" && userId) {
      try {
        const [existing] = await sql<Array<{ one: number }>>`
          SELECT 1 AS one FROM mcp_connectors
          WHERE project_id = ${projectId} AND server_command = 'builtin:data'
          LIMIT 1
        `;
        if (!existing) {
          const { ensureDataConnectorForProject } = await import("../../mcp/builtin/data/register.js");
          await ensureDataConnectorForProject(projectId, workspaceId, userId);
        }
      } catch (err) {
        console.warn("[CopilotEngine] builtin:data lazy provision failed:", err instanceof Error ? err.message : err);
      }
    }

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

    // Progressive loading: when many MCP tools exist, inject a discovery
    // meta-tool instead of all definitions. All tools remain callable.
    const PROGRESSIVE_THRESHOLD = 20;
    if (resolvedTools.length > PROGRESSIVE_THRESHOLD) {
      const mcpTools = createMcpTools(resolvedTools, manager, configs, projectId);
      const metaTool = createToolDiscoveryMetaTool(resolvedTools, mcpTools);
      // Include the meta-tool + a summary of what's available
      console.log(`[CopilotEngine] Progressive loading: ${resolvedTools.length} MCP tools deferred behind discovery meta-tool`);
      return [metaTool, ...mcpTools];
    }

    const mcpTools = createMcpTools(resolvedTools, manager, configs, projectId);
    console.log(`[CopilotEngine] Loaded ${mcpTools.length} MCP tools from ${configs.size} connectors`);
    return mcpTools;
  } catch (err) {
    console.warn("[CopilotEngine] MCP tool loading failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Progressive discovery meta-tool — lets the AI search for relevant MCP tools
 * by keyword rather than flooding the context with all tool definitions.
 */
function createToolDiscoveryMetaTool(
  resolvedTools: ResolvedMcpTool[],
  _allTools: Tool[],
): Tool {
  // Build a searchable catalog
  const catalog = resolvedTools.map((t) => ({
    fullName: `mcp_${t.connectorName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${t.tool.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
    connector: t.connectorName,
    name: t.tool.name,
    description: t.tool.description ?? "",
    params: Object.keys(t.tool.inputSchema?.properties ?? {}),
  }));

  const connectorSummary = new Map<string, number>();
  for (const t of resolvedTools) {
    connectorSummary.set(t.connectorName, (connectorSummary.get(t.connectorName) ?? 0) + 1);
  }
  const summaryStr = Array.from(connectorSummary.entries())
    .map(([name, count]) => `${name} (${count} tools)`)
    .join(", ");

  return defineTool("mcp_discover_tools", {
    description: `Search ${catalog.length} available MCP tools across ${connectorSummary.size} servers: ${summaryStr}. Use this to find relevant tools by keyword before calling them. All listed tools are directly callable.`,
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search keyword to find relevant MCP tools (e.g., 'database', 'file', 'search', 'create')",
        },
        connector: {
          type: "string",
          description: "Optional: filter by connector name",
        },
      },
      required: ["query"],
    },
    handler: async (args: Record<string, unknown>) => {
      const query = String(args.query ?? "").toLowerCase();
      const connectorFilter = args.connector ? String(args.connector).toLowerCase() : null;

      const matches = catalog.filter((t) => {
        if (connectorFilter && !t.connector.toLowerCase().includes(connectorFilter)) return false;
        return (
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.connector.toLowerCase().includes(query) ||
          t.params.some((p) => p.toLowerCase().includes(query))
        );
      });

      if (matches.length === 0) {
        return {
          results: [],
          message: `No MCP tools matching "${query}". Available connectors: ${summaryStr}`,
        };
      }

      return {
        results: matches.slice(0, 10).map((m) => ({
          toolName: m.fullName,
          connector: m.connector,
          originalName: m.name,
          description: m.description,
          parameters: m.params,
        })),
        totalMatches: matches.length,
        message: matches.length > 10
          ? `Showing 10 of ${matches.length} matches. Refine your query for more specific results.`
          : `Found ${matches.length} matching tool(s). You can call them directly by their toolName.`,
      };
    },
  }) as Tool;
}
