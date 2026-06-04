/**
 * Prompt Manifest (Phase 1E of integration↔AI chat bridge)
 *
 * Builds the `<connected-integrations>` block injected into the AI system
 * prompt. Reuses `resolveVaultEnv` from the vault-bridge but DROPS the `env`
 * map — only the metadata-only `manifest` is consumed here. The AI never sees
 * credential values; only env var NAMES, integration ids, display names, and
 * tool names.
 *
 * Hard rules from `glittery-riding-rocket.md` §E:
 *   - Never log, return, or embed credential values.
 *   - Block format must match the plan exactly so the model's training
 *     priors on similar manifest formats kick in.
 *   - Failure is non-fatal: log warn and return empty string.
 *
 * Phase 2B addition: when an integration has a virtual MCP preset (Supabase
 * today), append the well-known MCP tool names to its manifest line so the
 * AI knows `mcp_supabase_execute_sql` et al. are available. The tool list is
 * hardcoded in the preset file (not discovered from the live server) because
 * the manifest runs BEFORE MCP tool loading on every chat turn.
 */

import { resolveVaultEnv } from "../env/vault-bridge.js";
import { SUPABASE_MCP_FULL_TOOL_NAMES } from "../mcp/presets/supabase.js";
import { sql } from "../db/index.js";
import { connectorQueries } from "@doable/db";
import { BUILTIN_MCP_APPS } from "../mcp/builtin-connectors.js";

/**
 * MCP tool-line extensions, keyed by integration id. Each entry returns a
 * single preformatted suffix appended after the Activepieces tool list. The
 * function receives the manifest entry in case we want to gate on runtime
 * hints in the future.
 *
 * Note: tool names here are stable because the virtual preset passes a fixed
 * connector `name` to the tool-bridge (see `supabase.ts:CONNECTOR_NAME`). If a
 * future preset makes the connector name dynamic, the manifest line must be
 * regenerated from the live tool set instead.
 */
const MCP_TOOL_LINES: Record<string, () => string> = {
  supabase: () => {
    const reads = SUPABASE_MCP_FULL_TOOL_NAMES.filter((t) => !t.write)
      .map((t) => t.fullName)
      .join(", ");
    const writes = SUPABASE_MCP_FULL_TOOL_NAMES.filter((t) => t.write)
      .map((t) => t.fullName)
      .join(", ");
    // Writes appear in the list but are flagged — the preset keeps them
    // disabled unless `metadata.mcp_writes_enabled` is set on the connection.
    return ` MCP tools: ${reads} (read-only), ${writes} (writes, opt-in).`;
  },
};

/**
 * Build the `<connected-integrations>` system-prompt block for a scope.
 *
 * Returns an empty string if no integrations are connected, or if the
 * underlying vault-bridge call throws.
 */
export async function buildConnectedIntegrationsContext(
  projectId: string,
  workspaceId: string,
  userId: string,
): Promise<string> {
  let manifest;
  try {
    const result = await resolveVaultEnv(workspaceId, projectId, userId);
    manifest = result.manifest;
  } catch (err) {
    console.warn("[prompt-manifest] failed:", err);
    return "";
  }

  if (!manifest || manifest.length === 0) return "";

  // Cap the tool list per integration so a single chatty integration (e.g.
  // Notion with 20+ actions) doesn't dominate the system prompt. The full
  // tool list is still available to the AI via the Copilot SDK's tools
  // parameter — this is just the human-readable summary block.
  const MAX_TOOLS_LISTED = 6;

  const lines = manifest.map((entry) => {
    // Prefer the envKeyMap runtimeHint, fall back to the registry description
    // so tool-only integrations (no envKeyMap) still get a meaningful line.
    const hint = entry.runtimeHint ?? entry.description ?? "Connected service.";
    const client =
      entry.clientEnvVars.length > 0
        ? ` Client env (in import.meta.env): ${entry.clientEnvVars.join(", ")}.`
        : "";
    const server =
      entry.serverEnvVars.length > 0
        ? ` Server env: ${entry.serverEnvVars.join(", ")}.`
        : "";
    let tools = "";
    if (entry.toolPrefixes.length > 0) {
      const shown = entry.toolPrefixes.slice(0, MAX_TOOLS_LISTED).join(", ");
      const extra = entry.toolPrefixes.length - MAX_TOOLS_LISTED;
      tools = extra > 0
        ? ` Tools: ${shown}, +${extra} more.`
        : ` Tools: ${shown}.`;
    }
    // Phase 2B: append virtual MCP tool names when a preset exists for this
    // integration. Hardcoded per-integration — the preset's tool list is
    // stable across minor releases of the upstream MCP server.
    const mcpLine = MCP_TOOL_LINES[entry.integrationId]?.() ?? "";
    return `- ${entry.integrationId} (${entry.displayName}): ${hint}${client}${server}${tools}${mcpLine}`;
  });

  return [
    "<connected-integrations>",
    "The user has pre-connected these services. You MUST use them via the listed env vars and tools. NEVER ask the user for API keys, URLs, or tokens for these services — Doable has already provisioned them.",
    "",
    ...lines,
    "",
    "Rules:",
    "1. Reference env vars by NAME only — they are injected at runtime.",
    "2. NEVER hardcode URLs/keys in generated code.",
    "3. NEVER log, print, or echo env var values.",
    "4. If you need an integration NOT listed here, call the request_integration tool. Do NOT ask the user to paste keys.",
    "</connected-integrations>",
  ].join("\n");
}


// ─── Connected MCP servers (user-added connectors) ────────────

/** Builtin connector display names that must NOT be advertised as runtime
 *  data sources for the generated app (per-app DB + builder MCP Apps). */
const BUILTIN_CONNECTOR_NAMES = new Set(BUILTIN_MCP_APPS.map((a) => a.name));

/**
 * Build the `<connected-mcp-servers>` system-prompt block.
 *
 * Surfaces every ACTIVE, user-connected MCP connector for the workspace
 * (excluding Doable's builtin per-app-DB and builder MCP Apps) together with
 * the EXACT AI-prefixed tool names the generated app must call at runtime via
 * `@doable/sdk`'s `doable.mcp.call()`.
 *
 * Why this exists: without it, a user-added MCP server (e.g. an eDiscovery
 * server) only appears to the agent as `mcp_*` chat tools. The agent then
 * calls those tools itself and dumps the result in chat, building no
 * data-wired app — the "empty dashboard" failure. This block tells the agent
 * the connector is a RUNTIME data source to wire into the app, and gives it
 * the precise tool identifiers the runtime proxy resolves.
 *
 * Generic by construction: driven entirely by the live connector list +
 * capabilities cache, so it works for ANY MCP server on ANY install. The tool
 * name derivation mirrors the connector-proxy (`mcp_<safeName>_<safeTool>`).
 *
 * Non-fatal: returns "" on any error or when no external MCP servers exist.
 */
export async function buildConnectedMcpServersContext(
  workspaceId: string,
): Promise<string> {
  let rows;
  try {
    rows = await connectorQueries(sql).listConnectors(workspaceId);
  } catch (err) {
    console.warn("[mcp-manifest] failed:", err);
    return "";
  }

  const external = rows.filter(
    (r) =>
      r.status === "active" &&
      !(r.server_command ?? "").startsWith("builtin:") &&
      !BUILTIN_CONNECTOR_NAMES.has(r.name),
  );
  if (external.length === 0) return "";

  const MAX_TOOLS = 24;
  const lines: string[] = [];
  for (const row of external) {
    const safeName = row.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const cache = row.capabilities_cache as
      | { tools?: { list?: Array<{ name: string; description?: string }> } }
      | null;
    const toolList = cache?.tools?.list ?? [];
    lines.push(`- **${row.name}**${row.description ? ` — ${row.description}` : ""}`);
    if (toolList.length === 0) {
      lines.push(
        "    (tools load on first use — call `doable.mcp.list()` at runtime to discover them)",
      );
      continue;
    }
    for (const tool of toolList.slice(0, MAX_TOOLS)) {
      const safeTool = tool.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const full = `mcp_${safeName}_${safeTool}`;
      const desc = tool.description
        ? ` — ${tool.description.replace(/\s+/g, " ").slice(0, 140)}`
        : "";
      lines.push(`    - \`${full}\`${desc}`);
    }
    if (toolList.length > MAX_TOOLS) {
      lines.push(
        `    - …and ${toolList.length - MAX_TOOLS} more (call \`doable.mcp.list()\` to enumerate all)`,
      );
    }
  }

  return [
    "<connected-mcp-servers>",
    "The user has connected the MCP server(s) below. Their tools are available TO THE GENERATED APP AT RUNTIME through the pre-linked `@doable/sdk` — they are not merely chat tools for you to call.",
    "",
    ...lines,
    "",
    "**🔌 HOW TO USE — build the data INTO the app; never just print it in chat:**",
    "```ts",
    "import { createDoableClient } from '@doable/sdk';",
    "const doable = createDoableClient();",
    "const r = await doable.mcp.call('<one of the mcp_… names above>', { /* tool args */ });",
    "if (r.success) { /* render r.data in a table / chart / card */ } else { /* show r.error.message */ }",
    "```",
    "RULES — MANDATORY whenever the user asks for a dashboard, report, view, or to \"show the data\":",
    "1. You MUST generate React components that call `doable.mcp.call(...)` at runtime and render the returned data as dashboards, tables, charts, and cards ON THE PAGE (with loading and error states).",
    "2. DO NOT merely call the MCP tool yourself and show its response in chat. DO NOT bake the tool's output into the code as a hardcoded/static constant — the live preview AND the deployed site must fetch fresh data.",
    "3. You MAY call an MCP tool AT MOST ONCE here to learn the response SHAPE, then build the UI around live `doable.mcp.call` calls.",
    "4. Use the EXACT `mcp_…` tool names listed above — that is how the runtime proxy resolves the connector + tool. `@doable/sdk` is pre-linked: import it directly, never add it to package.json, and never hardcode the MCP server URL or credentials.",
    "5. This works identically in the live preview and the deployed site — the auth token / project key is injected automatically.",
    "6. **🔐 HANDLE AUTH/ERRORS GRACEFULLY — never show raw errors to end-users.** `doable.mcp.call` returns `{ success, data, error }` and does NOT throw. Show a loading state while a call is in flight. If a result is not successful and `error.code === 'AUTH_REQUIRED'`, render a clean centered panel telling the user the data source needs to be connected, with a Sign in button that opens `error.loginUrl` (when present) in a new tab — never a raw error and never a silently-empty dashboard. For any other failure show a small inline Retry affordance. Never surface 401/404 codes, stack traces, or the phrase 'authentication error' to end-users.",
    "</connected-mcp-servers>",
  ].join("\n");
}
