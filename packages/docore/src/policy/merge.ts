/**
 * docore policy merge strategies
 *
 * Pure functions that merge a global value with a per-user override
 * to compute the effective policy for a given user.
 */

import type { PolicyKey, PolicyMap, SetPolicy, UserOverrideValue } from "./types.js";

/**
 * Resolve a SetPolicy override against a base string array.
 * - extend mode: union `add`, subtract `remove`
 * - replace mode: return `values` directly
 * - raw string[]: treated as replace
 */
export function mergeStringArray(base: string[], override: SetPolicy | string[]): string[] {
  if (Array.isArray(override)) return override;

  if (override.mode === "replace") {
    return override.values ?? [];
  }

  // extend
  let result = [...base];
  if (override.add?.length) {
    const addSet = new Set(override.add.map(s => s.toLowerCase()));
    for (const item of addSet) {
      if (!result.includes(item)) result.push(item);
    }
  }
  if (override.remove?.length) {
    const removeSet = new Set(override.remove.map(s => s.toLowerCase()));
    result = result.filter(item => !removeSet.has(item.toLowerCase()));
  }
  return result;
}

/**
 * Merge a global policy value with a per-user override value.
 * Returns the effective value.
 */
export function mergePolicy<K extends PolicyKey>(
  key: K,
  globalValue: PolicyMap[K],
  userOverride: UserOverrideValue<K> | undefined,
): PolicyMap[K] {
  if (userOverride === undefined) return globalValue;

  // String arrays can have SetPolicy overrides
  if (Array.isArray(globalValue) && typeof globalValue[0] === "string" || (Array.isArray(globalValue) && globalValue.length === 0)) {
    if (isStringArrayKey(key)) {
      return mergeStringArray(
        globalValue as string[],
        userOverride as SetPolicy | string[],
      ) as PolicyMap[K];
    }
  }

  // Everything else (scalars, booleans, objects, arrays of objects): user replaces global
  return userOverride as PolicyMap[K];
}

/** Keys whose values are string[] and support SetPolicy overrides. */
const STRING_ARRAY_KEYS = new Set<PolicyKey>([
  "sandbox.commands.allowed",
  "sandbox.commands.blocked",
  "sandbox.paths.traversalPatterns",
  "sandbox.paths.readOnlyRoots",
  "sandbox.urls.allowlist",
  "sandbox.urls.denylist",
  "sandbox.mcp.allowedServers",
  "sandbox.mcp.blockedTools",
  "sandbox.customTools.allowed",
  "tools.builtin.blocked",
]);

function isStringArrayKey(key: PolicyKey): boolean {
  return STRING_ARRAY_KEYS.has(key);
}
