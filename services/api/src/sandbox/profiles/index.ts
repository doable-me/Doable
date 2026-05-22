/**
 * Sandbox profile catalog — re-exports + ProfileKey -> factory map.
 *
 * See SandboxAgnosticSandboxingPRD/07-jail-profiles.md.
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { ProfileKey, SpawnContext } from "../orchestrator.js";
import type { SystemRules } from "../system-rules.js";

import { aiBashProfile } from "./ai-bash.js";
import { vitePreviewProfile } from "./vite-preview.js";
import { installProfile } from "./install.js";
import { buildProfile } from "./build.js";

export { aiBashProfile } from "./ai-bash.js";
export { vitePreviewProfile } from "./vite-preview.js";
export { installProfile } from "./install.js";
export { buildProfile } from "./build.js";
export * from "./constants.js";

export type ProfileFactory = (ctx: SpawnContext, sys: SystemRules) => SandboxProfile;

/**
 * Catalog of well-known profiles. Profile-resolver looks up
 * `profileCatalog[profileKey]` and calls with ctx; falls back to
 * defaultProfile if the key is unknown.
 */
export const profileCatalog: Record<ProfileKey, ProfileFactory> = {
  "ai-bash": aiBashProfile,
  "vite-preview": vitePreviewProfile,
  "install": installProfile,
  "build": buildProfile,
};
