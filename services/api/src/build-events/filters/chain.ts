/**
 * LogFilterChain — applies a list of redaction filters in declared
 * order with fail-closed semantics. Per PRD 04 §2 and §9.
 */

import type { FilterContext, LogFilter } from "./types.js";

export class LogFilterChain {
  constructor(private readonly filters: ReadonlyArray<LogFilter>) {}

  /**
   * Run the chain over `line`. Returns the (possibly transformed)
   * line, or `null` if any filter dropped it OR threw.
   *
   * Filters are applied in order. A `null` return short-circuits the
   * remainder of the chain. A thrown filter is logged and treated as
   * a drop (fail-closed) so credential-shaped novel inputs cannot
   * slip through unredacted on a filter bug.
   */
  run(line: string, ctx: FilterContext): string | null {
    let cur: string | null = line;
    for (const f of this.filters) {
      try {
        cur = f.apply(cur as string, ctx);
        if (cur === null) {
          return null;
        }
      } catch (e) {
        // Fail-closed per PRD 04 §9. Telemetry plumbing is wired in
        // a follow-up; for now emit a structured warning.
        // eslint-disable-next-line no-console
        console.warn(
          "[build-events/filters] filter threw, dropping line (fail-closed)",
          { id: f.id, err: e instanceof Error ? e.message : String(e) },
        );
        return null;
      }
    }
    return cur;
  }

  /** Number of filters in the chain (for diagnostics / tests). */
  get size(): number {
    return this.filters.length;
  }

  /** Filter ids in order (for diagnostics / tests). */
  get ids(): ReadonlyArray<string> {
    return this.filters.map((f) => f.id);
  }
}
