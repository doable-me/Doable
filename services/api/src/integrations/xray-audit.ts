import type { SandboxAuditRecord, VaultAuditRecord, XraySpan } from "./xray-types.js";

// ─── Sandbox + Vault audit history (rolling, additive) ────

const sandboxHistory: SandboxAuditRecord[] = [];
const vaultHistory: VaultAuditRecord[] = [];
const SANDBOX_HISTORY_MAX = 500;
const VAULT_HISTORY_MAX = 500;

// ─── Span history (docore + dovault operation traces) ─────

const spanHistory: XraySpan[] = [];
const SPAN_HISTORY_MAX = 1000;

export function recordSandboxDecision(entry: {
  timestamp?: number;
  userId?: string;
  kind?: string;
  decision?: string;
  reason?: string;
  details?: unknown;
} | SandboxAuditRecord): void {
  const rec: SandboxAuditRecord = {
    timestamp: entry.timestamp ?? Date.now(),
    userId: entry.userId,
    kind: entry.kind ?? "unknown",
    decision: entry.decision ?? "unknown",
    reason: entry.reason,
    details: entry.details,
  };
  sandboxHistory.push(rec);
  if (sandboxHistory.length > SANDBOX_HISTORY_MAX) sandboxHistory.shift();
}

export function recordVaultEvent(event: {
  timestamp?: number;
  projectId?: string;
  type?: string;
  data?: unknown;
}): void {
  const rec: VaultAuditRecord = {
    timestamp: event.timestamp ?? Date.now(),
    projectId: event.projectId,
    type: event.type ?? "vault.unknown",
    data: event.data,
  };
  vaultHistory.push(rec);
  if (vaultHistory.length > VAULT_HISTORY_MAX) vaultHistory.shift();
}

export function getSandboxHistory(userId?: string, limit = 50): SandboxAuditRecord[] {
  const filtered = userId ? sandboxHistory.filter((e) => e.userId === userId) : sandboxHistory;
  return filtered.slice(-limit);
}

export function getVaultHistory(projectId?: string, limit = 50): VaultAuditRecord[] {
  const filtered = projectId ? vaultHistory.filter((e) => e.projectId === projectId) : vaultHistory;
  return filtered.slice(-limit);
}

// ─── Span recording ─────────────────────────────────────

export function recordSpan(span: XraySpan): void {
  spanHistory.push(span);
  if (spanHistory.length > SPAN_HISTORY_MAX) spanHistory.shift();
}

export function getSpans(opts?: {
  source?: "docore" | "dovault";
  name?: string;
  limit?: number;
}): XraySpan[] {
  const limit = opts?.limit ?? 50;
  let filtered = spanHistory;
  if (opts?.source) filtered = filtered.filter((s) => s.source === opts.source);
  if (opts?.name) filtered = filtered.filter((s) => s.name === opts.name);
  return filtered.slice(-limit);
}

export function getSpanStats(): {
  total: number;
  bySource: Record<string, number>;
  byName: Record<string, { count: number; avgMs: number; maxMs: number; errorCount: number }>;
} {
  const bySource: Record<string, number> = {};
  const byName: Record<string, { count: number; totalMs: number; maxMs: number; errorCount: number }> = {};

  for (const s of spanHistory) {
    bySource[s.source] = (bySource[s.source] ?? 0) + 1;

    if (!byName[s.name]) byName[s.name] = { count: 0, totalMs: 0, maxMs: 0, errorCount: 0 };
    const entry = byName[s.name]!;
    entry.count++;
    if (s.durationMs != null) {
      entry.totalMs += s.durationMs;
      if (s.durationMs > entry.maxMs) entry.maxMs = s.durationMs;
    }
    if (s.status === "error") entry.errorCount++;
  }

  const result: Record<string, { count: number; avgMs: number; maxMs: number; errorCount: number }> = {};
  for (const [name, entry] of Object.entries(byName)) {
    result[name] = {
      count: entry.count,
      avgMs: entry.count > 0 ? Math.round(entry.totalMs / entry.count) : 0,
      maxMs: entry.maxMs,
      errorCount: entry.errorCount,
    };
  }

  return { total: spanHistory.length, bySource, byName: result };
}
