import type { SandboxAuditRecord, VaultAuditRecord } from "./xray-types.js";

// ─── Sandbox + Vault audit history (rolling, additive) ────

const sandboxHistory: SandboxAuditRecord[] = [];
const vaultHistory: VaultAuditRecord[] = [];
const SANDBOX_HISTORY_MAX = 500;
const VAULT_HISTORY_MAX = 500;

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
