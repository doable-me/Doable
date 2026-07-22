/**
 * ensureRuntimeConnectorForProject
 *
 * Idempotently provisions the built-in `doable.runtime` MCP connector row and
 * its default tool-override rows for a single project.
 *
 * Mirror of ensureDataConnectorForProject() in ../data/register.ts
 * but for server_command = 'builtin:runtime'.
 */

import { connectorQueries } from "@doable/db";
import { sql } from "../../../db/index.js";
import { BUILTIN_RUNTIME_TOOLS, buildCapabilitiesCache } from "./connector-spec.js";

export { BUILTIN_RUNTIME_TOOLS, buildCapabilitiesCache } from "./connector-spec.js";

const connectors = connectorQueries(sql);

/**
 * Idempotently upsert the builtin:runtime mcp_connectors row + tool overrides
 * for the given project. Safe to call multiple times; duplicate inserts are
 * suppressed by WHERE NOT EXISTS / ON CONFLICT DO NOTHING.
 */
export async function ensureRuntimeConnectorForProject(
  projectId: string,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  // --- 1. Connector row ---
  const [existing] = await sql<Array<{ id: string }>>`
    SELECT id FROM mcp_connectors
    WHERE project_id = ${projectId}
      AND server_command = 'builtin:runtime'
    LIMIT 1
  `;

  let connectorId: string;

  if (existing) {
    connectorId = existing.id;
  } else {
    const row = await connectors.createConnector({
      workspaceId,
      projectId,
      createdBy: ownerUserId,
      scope: "project",
      name: "Doable App Runtime",
      description:
        "Built-in: named queries, workflows, schedules, webhooks, CDC. Use runtime.validate / upsert_query / test_workflow.",
      transportType: "stdio",
      serverCommand: "builtin:runtime",
      serverArgs: [],
      authType: "none",
    });

    // Mark active immediately so it appears in tool lists without a connect round-trip.
    await sql`
      UPDATE mcp_connectors
      SET status = 'active',
          capabilities_cache = ${sql.json(buildCapabilitiesCache() as { tools: { listChanged: boolean } })}
      WHERE id = ${row.id}
    `;

    connectorId = row.id;
    console.log(
      `[builtin-runtime] Provisioned doable.runtime connector ${connectorId} for project ${projectId}`,
    );
  }

  // --- 2. Tool overrides (ON CONFLICT DO NOTHING handles replay) ---
  for (const toolName of BUILTIN_RUNTIME_TOOLS) {
    await sql`
      INSERT INTO mcp_tool_overrides (connector_id, tool_name, enabled, workspace_id, project_id)
      VALUES (${connectorId}, ${toolName}, true, ${workspaceId}, ${projectId})
      ON CONFLICT DO NOTHING
    `;
  }
}
