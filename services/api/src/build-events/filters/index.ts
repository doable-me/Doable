/**
 * Barrel export + canonical default-chain factory for the build-event
 * redaction pipeline. Per PRD 04 §2.1 / §4.3.
 *
 * Canonical order (always-on baseline):
 *   1. truncate    (input cap, MAX_LINE_BYTES = 8192) — inline at chain entry
 *   2. env-values
 *   3. shapes
 *   4. entropy
 *   5. path
 *   6. url
 *   7. username
 *
 * Adapter-supplied and workspace-supplied filters run AFTER this set
 * (PRD 04 §4) and are appended by the publisher when it composes the
 * final chain.
 */

export type { FilterContext, LogFilter } from "./types.js";
export { LogFilterChain } from "./chain.js";

export { buildEnvRedactor, clearEnvRedactorCache } from "./env-values.js";
export { buildShapeRedactor } from "./shapes.js";
export { buildEntropyRedactor } from "./entropy.js";
export { buildPathRedactor } from "./paths.js";
export { buildUrlRedactor } from "./urls.js";
export { buildUsernameRedactor } from "./usernames.js";

import type { LogFilter } from "./types.js";
import { buildEnvRedactor } from "./env-values.js";
import { buildShapeRedactor } from "./shapes.js";
import { buildEntropyRedactor } from "./entropy.js";
import { buildPathRedactor } from "./paths.js";
import { buildUrlRedactor } from "./urls.js";
import { buildUsernameRedactor } from "./usernames.js";

/** PRD 03 §6.4 / PRD 04 §8 — input truncation cap, in bytes. */
export const MAX_LINE_BYTES = 8192;

/**
 * Truncate filter. Runs first so all subsequent regex work is
 * bounded. Truncation suffix is `<TRUNC:+N>` per PRD 04 §8.
 *
 * Truncation operates on UTF-8 byte length, but we slice on UTF-16
 * code units (JS String semantics). The cap is generous enough that
 * the byte-vs-code-unit distinction is not security-relevant — it
 * only affects how aggressively pathological lines are clipped.
 */
function buildTruncateFilter(): LogFilter {
  return {
    id: "truncate",
    alwaysOn: true,
    apply(line) {
      // Cheap upper bound: UTF-8 is at most 4 bytes/code-unit, but in
      // practice ASCII-heavy logs are 1:1. Use Buffer.byteLength if
      // present; fall back to String.length otherwise.
      let byteLen: number;
      try {
        byteLen = Buffer.byteLength(line, "utf8");
      } catch {
        byteLen = line.length;
      }
      if (byteLen <= MAX_LINE_BYTES) return line;

      // Trim by code units with a safety margin so multi-byte chars
      // at the boundary don't push us back over the cap.
      const overshoot = byteLen - MAX_LINE_BYTES;
      const safeCutoff = Math.max(0, line.length - overshoot - 16);
      const head = line.slice(0, safeCutoff);
      return `${head}<TRUNC:+${overshoot}>`;
    },
  };
}

/**
 * Default always-on filter chain in canonical order.
 *
 * Adapter-supplied / workspace-supplied filters are NOT included here —
 * the publisher appends those when it constructs the runtime chain.
 */
export function buildDefaultFilters(): LogFilter[] {
  return [
    buildTruncateFilter(),
    buildEnvRedactor(),
    buildShapeRedactor(),
    buildEntropyRedactor(),
    buildPathRedactor(),
    buildUrlRedactor(),
    buildUsernameRedactor(),
  ];
}
