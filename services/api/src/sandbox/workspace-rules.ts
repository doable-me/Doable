/**
 * Workspace-scoped sandbox rule layer.
 *
 * Single place that knows the DB shape of `workspace_sandbox_settings` (mig
 * 072) and `workspace_sandbox_rules` (mig 073). The resolver calls into
 * this module to TIGHTEN a profile based on per-workspace policy.
 *
 * Per SandboxAgnosticSandboxingPRD/10-config-management.md
 * ("Defaults vs. overrides" + "Hard floors operators cannot disable"):
 *   - Workspace rules can ONLY tighten — never loosen.
 *   - Network floor entries from sandbox_system_rules are always reapplied.
 *   - If the profile id is not in the workspace's allowed_profile_keys,
 *     resolution fails closed.
 */

import { sql } from "../db/index.js";
import type { SandboxProfile } from "../../../../packages/dovault/src/profile.js";
import { loadSystemRules } from "./system-rules.js";

// ───────────────────────── types ─────────────────────────

export interface WorkspaceSandboxState {
  settings: {
    sandbox_backend: string | null;
    allowed_profile_keys: string[];
    tool_default_action?: "allow" | "deny";
    network_default_action?: "allow" | "deny";
  };
  rules: Array<{
    rule_type: "tool" | "network" | "read" | "bash";
    pattern: string;
    action: "allow" | "deny";
    priority: number;
  }>;
}

// ───────────────────────── loader ─────────────────────────

/**
 * Load workspace policy. Returns null when workspaceId is null, or
 * gracefully (null) when the underlying tables don't yet exist
 * (SQLSTATE 42P01 — undefined_table).
 */
export async function loadWorkspaceSandboxState(
  workspaceId: string | null,
): Promise<WorkspaceSandboxState | null> {
  if (!workspaceId) return null;

  try {
    const settingsRows = await sql<
      Array<{
        sandbox_backend: string | null;
        allowed_profile_keys: string[] | null;
        tool_default_action: "allow" | "deny" | null;
        network_default_action: "allow" | "deny" | null;
      }>
    >`
      SELECT sandbox_backend,
             allowed_profile_keys,
             tool_default_action,
             network_default_action
        FROM workspace_sandbox_settings
       WHERE workspace_id = ${workspaceId}
       LIMIT 1
    `;

    const ruleRows = await sql<
      Array<{
        rule_type: "tool" | "network" | "read" | "bash";
        pattern: string;
        action: "allow" | "deny";
        priority: number;
      }>
    >`
      SELECT rule_type, pattern, action, priority
        FROM workspace_sandbox_rules
       WHERE workspace_id = ${workspaceId}
         AND enabled = true
       ORDER BY priority ASC
    `;

    const s = settingsRows[0];
    return {
      settings: {
        sandbox_backend: s?.sandbox_backend ?? null,
        allowed_profile_keys: s?.allowed_profile_keys ?? [],
        tool_default_action: s?.tool_default_action ?? undefined,
        network_default_action: s?.network_default_action ?? undefined,
      },
      rules: ruleRows,
    };
  } catch (err: unknown) {
    // 42P01 = undefined_table — migrations 072/073 not yet applied.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "42P01"
    ) {
      return null;
    }
    throw err;
  }
}

// ───────────────────────── applier ─────────────────────────

/**
 * Tighten `profile` using workspace policy. Never loosens.
 *
 * 1. If `profile.id` is not in `allowed_profile_keys`, throw.
 * 2. For each rule_type=network deny rule: add pattern to
 *    `profile.network.deny`, and remove it from `profile.network.allow`.
 * 3. rule_type=bash and rule_type=tool deny rules are NOT enforced here —
 *    tool-level enforcement lives in the AI tool handler, not the
 *    sandbox profile (TODO: surface via a future `toolDenylist` field).
 * 4. Network floor entries from sandbox_system_rules (is_floor=true) are
 *    reappended unconditionally so a workspace policy can never remove them.
 */
export async function applyWorkspaceRules(
  profile: SandboxProfile,
  state: WorkspaceSandboxState,
): Promise<SandboxProfile> {
  const allowed = state.settings.allowed_profile_keys;
  if (allowed.length > 0 && !allowed.includes(profile.id)) {
    throw new Error(`Workspace policy prohibits profile ${profile.id}`);
  }

  // Clone the network sub-object so we don't mutate the caller's profile.
  const denySet = new Set<string>(profile.network.deny);
  const allowSet = new Set<string>(profile.network.allow);

  for (const rule of state.rules) {
    if (rule.rule_type === "network" && rule.action === "deny") {
      denySet.add(rule.pattern);
      allowSet.delete(rule.pattern);
    }
    // TODO: rule_type === "bash" | "tool" — enforce in AI tool handler,
    // not here. SandboxProfile has no toolDenylist field yet.
  }

  // Hard floor: load from DB and re-append regardless of workspace policy.
  const sys = await loadSystemRules();
  for (const floor of sys.networkFloors) {
    denySet.add(floor);
  }

  return {
    ...profile,
    network: {
      ...profile.network,
      allow: Array.from(allowSet),
      deny: Array.from(denySet),
    },
  };
}
