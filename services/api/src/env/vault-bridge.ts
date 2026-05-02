/**
 * Vault → Env Bridge (Phase 1B of integration↔AI chat bridge)
 *
 * Decrypts the active integration connections for a given scope and expands
 * them into:
 *   1. A flat `env` map suitable for spawning child processes (values included).
 *   2. A `manifest` of integration metadata (env var NAMES only — never values),
 *      safe to embed in the AI system prompt.
 *
 * Security guarantees enforced here:
 *   - `client.*` env var names SHOULD use a recognized client prefix (VITE_,
 *     NEXT_PUBLIC_, NUXT_PUBLIC_, PUBLIC_) but are emitted regardless since
 *     the integration author declares them browser-safe via envKeyMap.client.
 *   - `server.*` env var names MUST NOT use any client prefix (VITE_,
 *     NEXT_PUBLIC_, NUXT_PUBLIC_, PUBLIC_) — they would leak server secrets
 *     into the browser bundle and are dropped with a warn.
 *   - Credential VALUES are never logged. Only env var names + integration ids.
 *   - Credential VALUES are never returned outside of the `env` field.
 *
 * Hard rules from `glittery-riding-rocket.md` §"Security constraints":
 *   - The vault-bridge enforces the prefix split.
 *   - The AI must never see decrypted values; the manifest contains names only.
 *   - Per-integration `client_safe` allowlist == `envKeyMap.client`.
 */

import { credentialVault } from "../integrations/credential-vault.js";
import { getIntegration } from "../integrations/registry/index.js";

/** Known client-exposure prefixes across supported frameworks. */
const CLIENT_PREFIXES = ["VITE_", "NEXT_PUBLIC_", "NUXT_PUBLIC_", "PUBLIC_"] as const;

function hasClientPrefix(name: string): boolean {
  return CLIENT_PREFIXES.some((p) => name.startsWith(p));
}

export interface IntegrationEnvManifest {
  /** Integration ID, e.g. "supabase" */
  integrationId: string;
  /** Display name from the registry, e.g. "Supabase" */
  displayName: string;
  /** Registry-provided description (used as a fallback runtime hint). */
  description?: string;
  /** One-line description of what the integration provides at runtime.
   *  Comes from envKeyMap.runtimeHint; falls back to `description`. */
  runtimeHint?: string;
  /** Browser-safe env var names (VITE_-prefixed). NO VALUES. */
  clientEnvVars: string[];
  /** Server-only env var names. NO VALUES. */
  serverEnvVars: string[];
  /** Tool names the AI can call for this integration, e.g. "supabase_create_row". */
  toolPrefixes: string[];
}

export interface ResolveVaultEnvResult {
  /** Flat env map (NAME → VALUE) suitable for spreading into `child.env`. */
  env: Record<string, string>;
  /** Metadata-only manifest — safe to expose to the AI / system prompt. */
  manifest: IntegrationEnvManifest[];
}

/**
 * Resolve all vault-backed env vars for a workspace/project/user scope.
 *
 * Never throws — failures decrypting individual connections are logged and
 * the remaining connections are still processed.
 */
export async function resolveVaultEnv(
  workspaceId: string,
  projectId: string | undefined,
  userId: string,
): Promise<ResolveVaultEnvResult> {
  const env: Record<string, string> = {};
  const manifest: IntegrationEnvManifest[] = [];

  let connections;
  try {
    connections = await credentialVault.getEffective(workspaceId, projectId, userId);
  } catch (err) {
    console.warn("[vault-bridge] failed to load effective connections:", err);
    return { env, manifest };
  }

  // Dedupe by integration_id — same pattern as tool-bridge.ts:189.
  // getEffective returns rows ordered by `scope DESC`, so the first occurrence
  // is the highest-priority (project > user > workspace).
  const seen = new Set<string>();

  for (const conn of connections) {
    if (seen.has(conn.integration_id)) continue;
    seen.add(conn.integration_id);

    const def = getIntegration(conn.integration_id);
    if (!def) continue;

    const clientEnvVars: string[] = [];
    const serverEnvVars: string[] = [];

    // Only decrypt credentials when the integration opts into env-var
    // injection via envKeyMap. Tool-only integrations (no envKeyMap) still
    // appear in the manifest below so the AI has a clean summary of what's
    // connected, but we skip the decrypt round-trip for them — the
    // Activepieces tool-bridge decrypts per-call when tools are invoked.
    if (def.envKeyMap) {
      let creds: Record<string, unknown> | null = null;
      try {
        const decrypted = await credentialVault.decrypt(conn.id);
        if (decrypted && typeof decrypted === "object") {
          creds = decrypted as Record<string, unknown>;
        }
      } catch (err) {
        console.warn(
          `[vault-bridge] decrypt failed for ${conn.integration_id}:`,
          err,
        );
      }

      if (creds) {
        // ── Client-side mappings (declared browser-safe by envKeyMap) ──
        if (def.envKeyMap.client) {
          for (const [fieldName, envVarName] of Object.entries(def.envKeyMap.client)) {
            if (!hasClientPrefix(envVarName)) {
              // Warn but still emit — the integration author declared it client-safe.
              // This handles edge cases like bare names in framework-less setups.
              console.warn(
                `[vault-bridge] client mapping "${envVarName}" lacks a recognized client prefix (VITE_, NEXT_PUBLIC_, etc.) — emitting anyway`,
              );
            }
            const value = creds[fieldName];
            if (value === undefined || value === null || value === "") continue;
            env[envVarName] = String(value);
            clientEnvVars.push(envVarName);
          }
        }

        // ── Server-side mappings (must NOT have any client prefix) ──
        if (def.envKeyMap.server) {
          for (const [fieldName, envVarName] of Object.entries(def.envKeyMap.server)) {
            if (hasClientPrefix(envVarName)) {
              console.warn(
                `[vault-bridge] dropping server mapping "${envVarName}" — has client prefix, would leak to browser bundle`,
              );
              continue;
            }
            const value = creds[fieldName];
            if (value === undefined || value === null || value === "") continue;
            env[envVarName] = String(value);
            serverEnvVars.push(envVarName);
          }
        }
      }
    }

    // ── Compute tool prefixes (matches tool-bridge.ts:218-224 naming) ──
    //
    // Always emit tool prefixes, even for integrations without envKeyMap —
    // the AI still needs to know the tool names it can call for
    // Activepieces-backed services (Slack, Gmail, Notion, etc.).
    const safeIntegrationId = conn.integration_id
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();
    const toolPrefixes = (def.actions ?? []).map((actionName) => {
      const safeActionName = actionName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      return `${safeIntegrationId}_${safeActionName}`;
    });

    manifest.push({
      integrationId: conn.integration_id,
      displayName: def.displayName,
      description: def.description,
      runtimeHint: def.envKeyMap?.runtimeHint,
      clientEnvVars,
      serverEnvVars,
      toolPrefixes,
    });
  }

  return { env, manifest };
}
