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
 */

import { resolveVaultEnv } from "../env/vault-bridge.js";

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

  const lines = manifest.map((entry) => {
    const hint = entry.runtimeHint ?? "Connected service.";
    const client =
      entry.clientEnvVars.length > 0
        ? ` Client env (in import.meta.env): ${entry.clientEnvVars.join(", ")}.`
        : "";
    const server =
      entry.serverEnvVars.length > 0
        ? ` Server env: ${entry.serverEnvVars.join(", ")}.`
        : "";
    const tools =
      entry.toolPrefixes.length > 0
        ? ` Tools: ${entry.toolPrefixes.join(", ")}.`
        : "";
    return `- ${entry.integrationId} (${entry.displayName}): ${hint}${client}${server}${tools}`;
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
