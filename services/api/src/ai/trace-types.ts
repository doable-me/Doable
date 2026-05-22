// ─── Trace Collector Types ─────────────────────────────────

export interface TraceCollectorContext {
  projectId: string;
  userId: string;
  workspaceId: string;
  sessionId?: string;
  messageId?: string;
  provider?: string;
  providerLabel?: string;
  model?: string;
}

export interface TraceEvent {
  /** ISO timestamp */
  ts: string;
  /** Milliseconds since turn started */
  elapsed_ms: number;
  /** Event category */
  type: string;
  /** Full event payload — NO truncation for SDK events */
  data: unknown;
}

export interface TraceUsageSummary {
  promptTokens?: number;
  completionTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  model?: string;
}

// ─── Error categorization ──────────────────────────────────

export function categorizeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("auth") || m.includes("unauthorized") || m.includes("forbidden") || m.includes("401") || m.includes("403")) return "AUTH";
  if (m.includes("timeout") || m.includes("timed out") || m.includes("deadline")) return "TIMEOUT";
  if (m.includes("rate limit") || m.includes("429") || m.includes("too many")) return "RATE_LIMIT";
  if (m.includes("network") || m.includes("econnrefused") || m.includes("econnreset") || m.includes("enotfound") || m.includes("dns") || m.includes("socket")) return "NETWORK";
  if (m.includes("not found") || m.includes("404")) return "NOT_FOUND";
  if (m.includes("parse") || m.includes("json") || m.includes("syntax") || m.includes("unexpected token")) return "PARSE";
  if (m.includes("permission") || m.includes("denied") || m.includes("access")) return "PERMISSION";
  if (m.includes("quota") || m.includes("limit") || m.includes("exceeded")) return "QUOTA";
  if (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504") || m.includes("internal server error") || m.includes("bad gateway") || m.includes("service unavailable")) return "SERVER";
  if (m.includes("session") || m.includes("not started") || m.includes("stopped") || m.includes("disconnected")) return "SESSION";
  return "UNKNOWN";
}

// ─── Category filtering ────────────────────────────────────

export const CATEGORY_PREFIXES: Record<"sdk" | "tool" | "sandbox" | "vault", string[]> = {
  sdk: ["docore.session.", "docore.assistant.", "docore.user.", "sdk.", "session."],
  tool: ["docore.tool.", "tool_start", "tool_end", "tool."],
  sandbox: ["docore.sandbox.", "sandbox."],
  vault: ["vault."],
};

/** Filter a trace event list to a single category. */
export function filterTraceByCategory(
  events: TraceEvent[],
  category: "sdk" | "tool" | "sandbox" | "vault",
): TraceEvent[] {
  const prefixes = CATEGORY_PREFIXES[category];
  return events.filter((e) => prefixes.some((p) => e.type.startsWith(p)));
}
