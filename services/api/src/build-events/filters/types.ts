/**
 * Per devframeworkPRD/04-redaction-and-filters.md §2.
 *
 * Pipeline contract for redaction filters that run at the
 * BuildEventPublisher boundary BEFORE any byte is serialized to SSE
 * or WS. There is no downstream redaction; if a string reaches the
 * wire, it has already passed every filter in this chain.
 */

export interface FilterContext {
  /** Which child stream produced the line. */
  stream: "stdout" | "stderr";
  /** Build session identifier. */
  buildId: string;
  /** Project identifier (UUID). */
  projectId: string;
  /** Snapshot of env-var values active for this build. */
  envSecrets: ReadonlyArray<string>;
  /** OS usernames seen on the host. */
  osUsernames: ReadonlyArray<string>;
  /** Project workspace path so we can rewrite to project-relative. */
  projectPath: string;
}

/**
 * Pure transformation. Returns:
 *   - the (possibly transformed) line to pass to the next filter
 *   - null to DROP the line entirely
 *
 * Filters MUST NOT throw on user input. Throws are caught by the
 * chain and cause the line to be dropped (fail-closed) per PRD 04 §9.
 */
export type LogFilter = {
  id: string;
  /** Always-on filters cannot be removed by the chain composer. */
  alwaysOn?: boolean;
  apply(line: string, ctx: FilterContext): string | null;
};
