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
