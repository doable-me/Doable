/**
 * Profile resolver.
 *
 * Returns the SandboxProfile for a given ProfileKey by starting from the
 * package default and applying a profile-specific override.
 *
 * The override map is exported so chapter 07 of the PRD (W1-D, composer
 * wiring) can populate it without touching this file's body. Phase 1
 * ships with the map empty — every profile resolves to defaultProfile.
 */

// Try relative import first (during local development before package
// resolution is settled); the .js extension follows the repo's Node ESM
// convention. Once @doable/dovault exports `defaultProfile` and the
// SandboxProfile type, callers can switch to the named import.
import {
  defaultProfile,
  compileProfileOverrides,
  type SandboxProfile,
} from "../../../../packages/dovault/src/profile.js";

import type { ProfileKey, SpawnContext } from "./orchestrator.js";
import { profileCatalog } from "./profiles/index.js";
import {
  loadWorkspaceSandboxState,
  applyWorkspaceRules,
} from "./workspace-rules.js";
import { loadSystemRules } from "./system-rules.js";

// ───────────────────────── override map ─────────────────────────

/**
 * Profile-specific overrides applied on top of the catalog profile.
 *
 * Catalog factories in `./profiles/` provide the baseline; this map
 * lets workspace/runtime overrides be layered (per PRD ch07 §
 * "Workspace overrides"). Workspace overrides happen *here*, not in
 * the catalog factories themselves.
 *
 * Exported so tests and chapter-08 (workspace policy) wiring can
 * register entries without re-importing the file.
 */
export const profileOverrides: Map<ProfileKey, Partial<SandboxProfile>> = new Map();

// ───────────────────────── resolver ─────────────────────────

export async function resolveProfile(
  profileKey: ProfileKey,
  ctx: SpawnContext,
): Promise<SandboxProfile> {
  // 0. Load system-level rules from DB (cached 60s).
  const sys = await loadSystemRules();

  // 1. Look up catalog factory; fall back to defaultProfile if unknown.
  const factory = profileCatalog[profileKey];
  const base: SandboxProfile = factory
    ? factory(ctx, sys)
    : defaultProfile(String(profileKey), ctx.projectId);

  // 2. Apply any workspace/runtime overrides registered in the map.
  const override = profileOverrides.get(profileKey);
  const afterOverride = override ? compileProfileOverrides(base, override) : base;

  // 3. Layer per-workspace policy on top (can only tighten, never loosen).
  //    See SandboxAgnosticSandboxingPRD/10-config-management.md.
  const workspaceState = await loadWorkspaceSandboxState(ctx.workspaceId);
  if (!workspaceState) return afterOverride;

  return await applyWorkspaceRules(afterOverride, workspaceState);
}
