// ─── X-Ray Types ────────────────────────────────────────

export type CallKind = "integration" | "mcp" | "sandbox" | "vault";

export interface XrayPhase {
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
}

export interface XrayHttpCall {
  seq: number;
  method: string;
  url: string;
  phase: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  statusCode: number | null;
  error: string | null;
  requestBody: string | null;
  responseBody: string | null;
}

export interface XrayCall {
  id: string;
  kind: CallKind;
  integrationId: string;
  actionName: string;
  projectId: string | null;
  userId: string | null;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  status: "running" | "success" | "error";
  error: string | null;
  phases: XrayPhase[];
  httpCalls: XrayHttpCall[];
  currentPhase: string | null;
}

export interface XraySnapshot {
  id: string;
  kind: CallKind;
  integrationId: string;
  actionName: string;
  projectId: string | null;
  runningForMs: number;
  currentPhase: string | null;
  currentPhaseRunningMs: number | null;
  httpCallCount: number;
  activeHttp: { method: string; url: string; runningMs: number } | null;
  phases: Array<{ name: string; durationMs: number | null }>;
}

export interface XrayStats {
  integrationId: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  slowestHttp: Array<{
    url: string;
    method: string;
    durationMs: number;
    statusCode: number | null;
    actionName: string;
    ts: number;
  }>;
  slowestPhases: Array<{
    phase: string;
    durationMs: number;
    actionName: string;
    ts: number;
  }>;
  lastCallAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
}

export interface XrayCallHandle {
  call: XrayCall;
  phase(name: string): void;
  httpStart(method: string, url: string, requestBody?: string | null): XrayHttpCall;
  httpEnd(httpEntry: XrayHttpCall, statusCode: number | null, durationMs: number, responseBody?: string | null, error?: string | null): void;
  end(status: "success" | "error", error?: string): void;
  readonly currentActiveHttp: XrayHttpCall | null;
}

// ─── Sandbox + Vault audit types ────────────────────────

export interface SandboxAuditRecord {
  timestamp: number;
  userId?: string;
  kind: string;
  decision: string;
  reason?: string;
  details?: unknown;
}

export interface VaultAuditRecord {
  timestamp: number;
  projectId?: string;
  type: string;
  data?: unknown;
}

// ─── Span types (docore + dovault operation traces) ─────

export interface XraySpan {
  /** Source package: "docore" or "dovault" */
  source: "docore" | "dovault";
  /** Span ID from the tracer */
  id: string;
  /** Operation name (e.g. "engine.connect", "vault.spawn") */
  name: string;
  /** Parent span ID, if nested */
  parentId?: string;
  /** Epoch ms when the span started */
  startedAt: number;
  /** Epoch ms when the span ended */
  endedAt: number | null;
  /** Duration in ms */
  durationMs: number | null;
  /** "ok" or "error" */
  status: "ok" | "error";
  /** Error message if status is "error" */
  error?: string;
  /** Extra metadata */
  attributes: Record<string, unknown>;
}
