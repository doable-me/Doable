/**
 * env-values redactor — ALWAYS ON. Per PRD 04 §3.1.
 *
 * Receives `ctx.envSecrets` (resolved env-var values for the spawned
 * build process) and replaces every occurrence on the line with
 * `<REDACTED:env>`. The env-var KEY is intentionally NOT included in
 * the token because the key itself can reveal which integration
 * leaked (e.g. STRIPE_SECRET_KEY).
 */

import type { LogFilter } from "./types.js";

const TOKEN = "<REDACTED:env>";
const MIN_VALUE_LENGTH = 4;

/** Per-build cache of compiled literal-match regexes, keyed by value. */
const literalRegexCache = new Map<string, RegExp>();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLiteralRegex(value: string): RegExp {
  const cached = literalRegexCache.get(value);
  if (cached) {
    // Reset lastIndex defensively — global regex state can leak across calls.
    cached.lastIndex = 0;
    return cached;
  }
  const re = new RegExp(escapeRegExp(value), "g");
  literalRegexCache.set(value, re);
  return re;
}

export function buildEnvRedactor(): LogFilter {
  return {
    id: "env-values",
    alwaysOn: true,
    apply(line, ctx) {
      let out = line;
      for (const v of ctx.envSecrets) {
        if (!v || v.length < MIN_VALUE_LENGTH) continue;
        const re = getLiteralRegex(v);
        out = out.replace(re, TOKEN);
      }
      return out;
    },
  };
}

/** Test / shutdown helper: clear the per-build LRU. */
export function clearEnvRedactorCache(): void {
  literalRegexCache.clear();
}
