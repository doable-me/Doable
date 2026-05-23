/**
 * ensureDataConnectorForProject
 *
 * Idempotently provisions the built-in `doable.data` MCP connector row and
 * its five default tool-override rows for a single project.
 *
 * Called:
 *   - at project creation (send-handler.ts afterInsert seam)
 *   - potentially at first AI-build turn as a re-entrancy guard
 *
 * Mirror of ensureBuiltinConnectorsForWorkspace() in ../builtin-connectors.ts
 * but scoped to project-level rows (scope = 'project').
 */

import { connectorQueries } from "@doable/db";
import { sql } from "../../../db/index.js";
import { BUILTIN_DATA_TOOLS, buildCapabilitiesCache } from "./connector-spec.js";

export { BUILTIN_DATA_TOOLS, buildCapabilitiesCache } from "./connector-spec.js";

const connectors = connectorQueries(sql);

/**
 * Idempotently upsert the builtin:data mcp_connectors row + tool overrides
 * for the given project. Safe to call multiple times; duplicate inserts are
 * suppressed by WHERE NOT EXISTS / ON CONFLICT DO NOTHING.
 */
export async function ensureDataConnectorForProject(
  projectId: string,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  // --- 1. Connector row ---
  const [existing] = await sql<Array<{ id: string }>>`
    SELECT id FROM mcp_connectors
    WHERE project_id = ${projectId}
      AND server_command = 'builtin:data'
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
      name: "Doable Per-App Database",
      description:
        "Built-in: per-project PGlite. Use data.query for runtime DML, data.migrate for schema.",
      transportType: "stdio",
      serverCommand: "builtin:data",
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
      `[builtin-data] Provisioned doable.data connector ${connectorId} for project ${projectId}`,
    );
  }

  // --- 2. Tool overrides (ON CONFLICT DO NOTHING handles replay) ---
  for (const toolName of BUILTIN_DATA_TOOLS) {
    await sql`
      INSERT INTO mcp_tool_overrides (connector_id, tool_name, enabled, workspace_id, project_id)
      VALUES (${connectorId}, ${toolName}, true, ${workspaceId}, ${projectId})
      ON CONFLICT DO NOTHING
    `;
  }
}
