/**
 * Built-in MCP Apps that ship with Doable by default.
 *
 * Every workspace gets these connectors provisioned exactly once. If the
 * user deletes one (the marketplace UI lets them remove any connector),
 * we do NOT re-add it on server restart — provisioning is tracked in the
 * `workspace_builtin_provisioned` table.
 *
 * To add a new builtin: append to BUILTIN_MCP_APPS. The `id` is the
 * stable identifier stored in `workspace_builtin_provisioned.builtin_id`
 * — never reuse one.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { connectorQueries } from "@doable/db";
import { sql } from "../db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Walk up: services/api/src/mcp -> services/api/src -> services/api -> services -> repo root
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const MCP_SERVERS_DIR = process.env.DOABLE_MCP_SERVERS_DIR
  ?? path.join(REPO_ROOT, "mcp-servers");

// Cache: once the tracking table is confirmed to exist, skip future checks.
let _provisionedTableExists: boolean | null = null;
async function provisionedTableExists(): Promise<boolean> {
  if (_provisionedTableExists === true) return true;
  const [row] = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'workspace_builtin_provisioned'
    ) AS exists
  `;
  _provisionedTableExists = row?.exists ?? false;
  return _provisionedTableExists;
}

interface BuiltinMcpApp {
  /** Stable identifier — used as the row key in workspace_builtin_provisioned. */
  id: string;
  name: string;
  description: string;
  /** Absolute path to the stdio entrypoint (.mjs / .js). */
  entrypoint: string;
}

export const BUILTIN_MCP_APPS: BuiltinMcpApp[] = [
  {
    id: "presentation-builder@1",
    name: "Presentation Builder",
    description:
      "Built-in MCP App. Creates editable PowerPoint (.pptx) decks from a topic via an "
      + "interactive picker. Standards-compliant MCP App (mcpui.dev) — see "
      + "mcp-servers/presentation-builder for the source as a developer reference.",
    entrypoint: path.join(MCP_SERVERS_DIR, "presentation-builder", "index.mjs"),
  },
  {
    id: "spreadsheet-builder@1",
    name: "Spreadsheet Builder",
    description:
      "Built-in MCP App. Creates editable Excel (.xlsx) workbooks plus CSV exports from a "
      + "topic, with formulas, formatting, and a live in-chat table preview. Standards-"
      + "compliant MCP App (mcpui.dev) — see mcp-servers/spreadsheet-builder.",
    entrypoint: path.join(MCP_SERVERS_DIR, "spreadsheet-builder", "index.mjs"),
  },
  {
    id: "markdown-builder@1",
    name: "Markdown Builder",
    description:
      "Built-in MCP App. Creates polished Markdown documents with frontmatter, tables, "
      + "and a live rendered HTML preview, plus .md and .html downloads. Standards-"
      + "compliant MCP App (mcpui.dev) — see mcp-servers/markdown-builder.",
    entrypoint: path.join(MCP_SERVERS_DIR, "markdown-builder", "index.mjs"),
  },
  {
    id: "pdf-builder@1",
    name: "PDF Builder",
    description:
      "Built-in MCP App. Creates print-ready PDF documents from a topic by generating a "
      + "single-file HTML and rendering it via headless Chrome. Returns .pdf and .html "
      + "downloads with a live preview. Standards-compliant MCP App (mcpui.dev) — see "
      + "mcp-servers/pdf-builder.",
    entrypoint: path.join(MCP_SERVERS_DIR, "pdf-builder", "index.mjs"),
  },
];

const connectors = connectorQueries(sql);

/**
 * Provision all builtin MCP Apps for a workspace, idempotently.
 *
 * A row in `workspace_builtin_provisioned` tracks that provisioning
 * was attempted. If the actual connector is later deleted, the marker
 * is cleared and the connector is re-created on next call.
 */
export async function ensureBuiltinConnectorsForWorkspace(
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  // Guard: skip if the tracking table hasn't been created yet (migration 048).
  if (!(await provisionedTableExists())) return;

  for (const app of BUILTIN_MCP_APPS) {
    try {
      // Skip if entrypoint isn't on disk (e.g., test env, partial install).
      if (!existsSync(app.entrypoint)) {
        console.warn(
          `[builtin-mcp] Skipping ${app.id} for workspace ${workspaceId}: `
          + `entrypoint not found at ${app.entrypoint}`,
        );
        continue;
      }

      // Already provisioned? Only skip if the connector still exists and is active.
      const [existing] = await sql<Array<{ workspace_id: string }>>`
        SELECT workspace_id FROM workspace_builtin_provisioned
        WHERE workspace_id = ${workspaceId} AND builtin_id = ${app.id}
        LIMIT 1
      `;
      if (existing) {
        // Verify the actual connector row still exists — if the user deleted
        // it, clear the marker so we re-provision below.
        const [connectorRow] = await sql<Array<{ id: string; status: string }>>`
          SELECT id, status FROM mcp_connectors
          WHERE workspace_id = ${workspaceId}
            AND scope = 'workspace'
            AND name = ${app.name}
          LIMIT 1
        `;
        if (connectorRow) continue; // connector still present — nothing to do

        // Connector was deleted; clear the marker so it gets re-created.
        await sql`
          DELETE FROM workspace_builtin_provisioned
          WHERE workspace_id = ${workspaceId} AND builtin_id = ${app.id}
        `;
        console.log(
          `[builtin-mcp] Marker existed but connector deleted for "${app.name}" in workspace ${workspaceId} — re-provisioning`,
        );
      }

      // Dedupe: if a workspace-scope connector with the same name already
      // exists (e.g., a user added it manually before backfill ran), claim
      // it as the builtin instead of creating a duplicate.
      const [dup] = await sql<Array<{ id: string }>>`
        SELECT id FROM mcp_connectors
        WHERE workspace_id = ${workspaceId}
          AND scope = 'workspace'
          AND name = ${app.name}
        ORDER BY created_at ASC LIMIT 1
      `;
      if (dup) {
        await sql`
          INSERT INTO workspace_builtin_provisioned (workspace_id, builtin_id)
          VALUES (${workspaceId}, ${app.id})
          ON CONFLICT DO NOTHING
        `;
        console.log(
          `[builtin-mcp] Claimed existing "${app.name}" connector ${dup.id} as builtin for workspace ${workspaceId}`,
        );
        continue;
      }

      await connectors.createConnector({
        workspaceId,
        createdBy: ownerUserId,
        scope: "workspace",
        name: app.name,
        description: app.description,
        transportType: "stdio",
        serverCommand: "node",
        serverArgs: [app.entrypoint],
        authType: "none",
      });

      // Mark as active so it shows up immediately in tool lists.
      const [row] = await sql<Array<{ id: string }>>`
        SELECT id FROM mcp_connectors
        WHERE workspace_id = ${workspaceId}
          AND scope = 'workspace'
          AND name = ${app.name}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (row) {
        await sql`UPDATE mcp_connectors SET status = 'active' WHERE id = ${row.id}`;
      }

      await sql`
        INSERT INTO workspace_builtin_provisioned (workspace_id, builtin_id)
        VALUES (${workspaceId}, ${app.id})
        ON CONFLICT DO NOTHING
      `;

      console.log(
        `[builtin-mcp] Provisioned "${app.name}" for workspace ${workspaceId}`,
      );
    } catch (err) {
      console.error(
        `[builtin-mcp] Failed to provision ${app.id} for workspace ${workspaceId}:`,
        err,
      );
    }
  }
}

/**
 * Backfill: provision builtin MCP Apps for every existing workspace that
 * doesn't have them yet. Called once at API startup.
 */
export async function backfillBuiltinConnectors(): Promise<void> {
  try {
    // Guard: skip if the tracking table hasn't been created yet (migration 048).
    // This avoids a 42P01 crash when the API starts before migrations run.
    if (!(await provisionedTableExists())) {
      console.warn(
        "[builtin-mcp] Skipping backfill: workspace_builtin_provisioned table does not exist. Run migrations first.",
      );
      return;
    }

    const workspaces = await sql<Array<{ id: string; owner_id: string }>>`
      SELECT id, owner_id FROM workspaces
    `;
    if (workspaces.length === 0) return;

    let provisioned = 0;
    for (const ws of workspaces) {
      const before = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count FROM workspace_builtin_provisioned
        WHERE workspace_id = ${ws.id}
      `;
      await ensureBuiltinConnectorsForWorkspace(ws.id, ws.owner_id);
      const after = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count FROM workspace_builtin_provisioned
        WHERE workspace_id = ${ws.id}
      `;
      if (Number(after[0]?.count ?? 0) > Number(before[0]?.count ?? 0)) {
        provisioned += 1;
      }
    }
    if (provisioned > 0) {
      console.log(
        `[builtin-mcp] Backfill: provisioned builtins for ${provisioned} workspace(s)`,
      );
    }
  } catch (err) {
    console.error("[builtin-mcp] Backfill failed:", err);
  }
}
