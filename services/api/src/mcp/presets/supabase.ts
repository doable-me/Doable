/**
 * Supabase MCP preset (Phase 2B of integration↔AI chat bridge).
 *
 * Synthesizes a VIRTUAL `McpConnectorConfig` that runs the official
 * `@supabase/mcp-server-supabase` stdio server against the user's existing
 * `integration_connections` row. Nothing is persisted — the config is rebuilt
 * every time `loadMcpTools` runs, so rotating the underlying OAuth token just
 * works without a DB write.
 *
 * Hard rules (from glittery-riding-rocket.md §2B):
 *   - `--read-only` is ON unless `metadata.mcp_writes_enabled === true`.
 *   - `--project-ref` MUST be set. Never run unscoped across the user's org.
 *   - NEVER log decrypted tokens.
 *   - Return `null` when the connection lacks either an access token or a
 *     projectRef — the caller falls back to "no MCP tools" silently.
 */

import type { McpConnectorConfig } from "../types.js";
import type { DecryptedConnection } from "../../integrations/types.js";

/**
 * Well-known tool names exported by `@supabase/mcp-server-supabase`.
 *
 * The prompt-manifest builder consumes these before the MCP server has been
 * spawned (tool discovery happens on the first chat turn, but the manifest
 * runs on every turn). They also double as the `mcp_supabase_*` names the AI
 * sees at runtime — the stdio server's tool list is stable across patches.
 *
 * Tools flagged `write: true` are only exposed when the connection opts in
 * via `metadata.mcp_writes_enabled`. Read tools run under `--read-only`.
 */
export const SUPABASE_MCP_TOOLS: ReadonlyArray<{
  name: string;
  write: boolean;
}> = [
  // ── Read-only: schema + data inspection ───────────────
  { name: "list_tables", write: false },
  { name: "list_extensions", write: false },
  { name: "list_migrations", write: false },
  { name: "execute_sql", write: false },
  { name: "get_logs", write: false },
  { name: "get_advisors", write: false },
  { name: "get_project_url", write: false },
  { name: "get_anon_key", write: false },
  { name: "generate_typescript_types", write: false },
  { name: "list_edge_functions", write: false },
  { name: "list_branches", write: false },
  { name: "search_docs", write: false },
  // ── Writes: only available when `mcp_writes_enabled === true` ──
  { name: "apply_migration", write: true },
  { name: "deploy_edge_function", write: true },
  { name: "create_branch", write: true },
  { name: "delete_branch", write: true },
  { name: "merge_branch", write: true },
  { name: "reset_branch", write: true },
  { name: "rebase_branch", write: true },
];

/**
 * Copilot-SDK-facing tool names the AI will see at runtime, mirroring the
 * naming convention in `tool-bridge.ts:createMcpTools`. The connector name
 * we pass (`Supabase`) sanitizes to `supabase`, so the full names are
 * `mcp_supabase_<tool>`. Exposed so the prompt-manifest can list them.
 */
export const SUPABASE_MCP_FULL_TOOL_NAMES = SUPABASE_MCP_TOOLS.map(
  (t) => ({ ...t, fullName: `mcp_supabase_${t.name}` }),
);

/** Name used for the synthesized connector. Kept stable so the `mcp_supabase_*`
 *  tool names remain deterministic and match the prompt-manifest preview. */
const CONNECTOR_NAME = "Supabase";

/**
 * Extract the Management-API access token from a Supabase-family connection.
 *
 * Accepts both:
 *   - `supabase-mgmt` rows (Phase 2A's OAuth-only flow) — `creds.access_token`
 *     is set directly.
 *   - `supabase` data-plane rows (Phase 1 enhanced auth + Phase 2A provisioner).
 *     Today these DON'T reliably carry the mgmt token; we still probe for both
 *     camelCase and snake_case in case a future enhancement persists it.
 *
 * Returns `null` if no usable token is present — the caller MUST then skip
 * building the connector (running unauthenticated would fail on every call).
 */
/** Extract the OAuth Management API token — this enables DDL (CREATE TABLE, migrations). */
function extractOAuthToken(conn: DecryptedConnection): string | null {
  const creds = conn.credentials as Record<string, unknown> | null;
  if (!creds) return null;
  const token =
    (creds.access_token as string | undefined) ??
    (creds.accessToken as string | undefined);
  return token && token.length > 0 ? token : null;
}

/** Extract any usable token — OAuth first, then serviceRoleKey as fallback.
 *  serviceRoleKey works for PostgREST CRUD but NOT for DDL/Management API. */
function extractAccessToken(conn: DecryptedConnection): string | null {
  const oauth = extractOAuthToken(conn);
  if (oauth) return oauth;
  const creds = conn.credentials as Record<string, unknown> | null;
  if (!creds) return null;
  const srk =
    (creds.serviceRoleKey as string | undefined) ??
    (creds.service_role_key as string | undefined);
  return srk && srk.length > 0 ? srk : null;
}

/**
 * Extract the Supabase `projectRef` for the data connection. Lives under
 * `metadata.projectRef` (set by both enhanced-auth and provisioner flows).
 */
function extractProjectRef(conn: DecryptedConnection): string | null {
  const meta = conn.metadata as Record<string, unknown> | undefined;
  const ref = meta?.projectRef;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

/** Writes are always enabled — Doable is designed to give the AI full
 *  control so users don't have to create tables manually. */
function writesEnabled(_conn: DecryptedConnection): boolean {
  return true;
}

/**
 * Build the virtual MCP connector config for a Supabase connection.
 *
 * Called from the presets registry (`presets/index.ts`) which in turn is
 * called from `copilot.ts:loadMcpTools`. If this function has all the data
 * it needs — access token + projectRef — it returns a config that `npx`s
 * the official server with the `--read-only --project-ref <ref>` flags.
 *
 * `context.allConnections` is a convenience escape hatch: the supabase
 * data-plane row carries `projectRef` but may not carry the management-API
 * access_token, while the `supabase-mgmt` OAuth row is the reverse. When
 * we're handed one, we can scan siblings to fill the gap. Always scoped to
 * the same workspace because `allConnections` already comes from
 * `credentialVault.getEffective` for the current scope.
 */
export function buildSupabaseConnectorConfig(
  connection: DecryptedConnection,
  context?: { allConnections?: DecryptedConnection[] },
): McpConnectorConfig | null {
  // ── Resolve projectRef ──
  let projectRef = extractProjectRef(connection);
  if (!projectRef && context?.allConnections) {
    // `supabase-mgmt` rows don't carry projectRef — look for a sibling
    // `supabase` data row in the same scope.
    const sibling = context.allConnections.find(
      (c) => c.integration_id === "supabase" && extractProjectRef(c),
    );
    if (sibling) projectRef = extractProjectRef(sibling);
  }
  if (!projectRef) return null;

  // ── Resolve access_token ──
  // PREFER the OAuth management token (from supabase-mgmt sibling) because
  // it enables DDL (CREATE TABLE, migrations) via the Management API.
  // The serviceRoleKey only works for PostgREST CRUD — the MCP server
  // can't run execute_sql or apply_migration with it.
  let accessToken: string | null = null;

  // 1. Check if this connection has an OAuth token directly
  accessToken = extractOAuthToken(connection);

  // 2. Look for a sibling supabase-mgmt OAuth row (the common case:
  //    supabase data row has projectRef, supabase-mgmt has access_token)
  if (!accessToken && context?.allConnections) {
    const mgmtSibling = context.allConnections.find(
      (c) => c.integration_id === "supabase-mgmt" && extractOAuthToken(c),
    );
    if (mgmtSibling) accessToken = extractOAuthToken(mgmtSibling);
  }

  // 3. Last resort: serviceRoleKey (enables PostgREST CRUD but NOT DDL)
  if (!accessToken) {
    accessToken = extractAccessToken(connection);
    if (!accessToken && context?.allConnections) {
      const dataSibling = context.allConnections.find(
        (c) => c.integration_id === "supabase" && extractAccessToken(c),
      );
      if (dataSibling) accessToken = extractAccessToken(dataSibling);
    }
  }
  if (!accessToken) return null;

  // ── Decide whether to pass --read-only ──
  // Either connection (data or mgmt) can flip the bit. OR rather than AND so
  // the user only has to toggle it in one place.
  const readOnly =
    !writesEnabled(connection) &&
    !(context?.allConnections ?? []).some(
      (c) =>
        (c.integration_id === "supabase" ||
          c.integration_id === "supabase-mgmt") &&
        writesEnabled(c),
    );

  const serverArgs = [
    "-y",
    "@supabase/mcp-server-supabase@latest",
    ...(readOnly ? ["--read-only"] : []),
    "--project-ref",
    projectRef,
  ];

  const displayName = connection.display_name ?? `Supabase (${projectRef})`;

  return {
    // `virtual-` prefix makes these trivially distinguishable from DB rows.
    id: `virtual-supabase-${connection.id}`,
    workspaceId: connection.workspace_id,
    projectId: connection.project_id,
    scope: connection.scope,
    // Keep `name` stable so the derived `mcp_supabase_*` tool names in the
    // prompt-manifest match what the copilot sees at runtime (`tool-bridge.ts`
    // sanitizes name → `supabase`). Project info goes in `description`.
    name: CONNECTOR_NAME,
    description: `Official Supabase MCP server${readOnly ? " (read-only)" : ""} — ${displayName}`,
    transportType: "stdio",
    serverCommand: "npx",
    serverArgs,
    // Auth is via the env map, not HTTP headers, so `none` is correct here.
    authType: "none",
    status: "active",
    // Env injected at spawn time — the connector-manager's `connect()` checks
    // `inlineServerEnv` before attempting a (would-fail) DB decrypt.
    inlineServerEnv: {
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_PROJECT_REF: projectRef,
    },
    createdBy: connection.user_id,
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
  };
}
