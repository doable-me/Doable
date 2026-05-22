// ─── Usage Display Formatting Helpers ──────────────────────
// Pure functions for formatting token counts, costs, and durations
// for the per-message usage display (PRD 23 Phase 7B).

/**
 * Format a token count for display.
 * - 1234 -> "1,234"
 * - 1234567 -> "1.2M"
 * - 0 -> "0"
 */
export function formatTokenCount(tokens: number | null | undefined): string {
  if (tokens == null || isNaN(tokens)) return "0";
  if (tokens < 0) return "0";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  return tokens.toLocaleString("en-US");
}

/**
 * Format a USD cost for display.
 * - 0.0043 -> "$0.004"
 * - 1.23 -> "$1.23"
 * - 0 -> "$0.00"
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || isNaN(usd)) return "$0.00";
  if (usd < 0) return "$0.00";
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${usd.toFixed(4)}`;
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds for display.
 * - 350 -> "350ms"
 * - 2100 -> "2.1s"
 * - 65000 -> "1m 5s"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || isNaN(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const s = ms / 1000;
    return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format cost with a "(local)" suffix for local providers.
 */
export function formatCostWithLocal(usd: number | null | undefined, isLocal: boolean): string {
  if (isLocal) return "$0.00 (local)";
  return formatCost(usd);
}
