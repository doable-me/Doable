/**
 * Integration X-Ray — full forensic visibility into every integration call.
 *
 * Tracks:
 *   - Every in-flight integration/MCP call with sub-step phase timing
 *   - Every HTTP request inside those calls (URL, method, status, latency)
 *   - Per-integration latency histograms (p50/p95/p99/max)
 *   - Currently stuck/slow calls
 *
 * No timeouts. No killing. Pure observability.
 *
 * Usage:
 *   const call = xray.start({ kind, integrationId, actionName, projectId, ... });
 *   call.phase("credential_lookup");         // marks phase start (auto-ends prior phase)
 *   call.phase("token_refresh");
 *   call.phase("piece_load");
 *   call.phase("action_run");
 *   call.httpStart("POST", "https://api.slack.com/...");
 *   call.httpEnd(200, 140);                  // status, durationMs
 *   call.end("success");                     // or "error"
 *
 *   xray.getActive();                        // all in-flight calls right now
 *   xray.getStats("slack");                  // per-integration latency stats
 *   xray.getStuck(30_000);                   // calls running > 30s
 */

import { getActiveTrace } from "../ai/trace-collector.js";

// ─── Types ──────────────────────────────────────────────

export type CallKind = "integration" | "mcp";

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
  phase: string;            // which phase this HTTP call belongs to
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  statusCode: number | null;
  error: string | null;
  /** Redacted request summary */
  requestBody: string | null;
  /** Truncated response summary */
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
  /** The currently in-flight HTTP call, if any */
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
  /** Slowest individual HTTP calls across all invocations */
  slowestHttp: Array<{
    url: string;
    method: string;
    durationMs: number;
    statusCode: number | null;
    actionName: string;
    ts: number;
  }>;
  /** Slowest phases across all invocations */
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

// ─── Call handle ────────────────────────────────────────

let callSeq = 0;

function createCallHandle(
  call: XrayCall,
  onEnd: () => void,
): XrayCallHandle {
  let httpSeq = 0;
  let currentActiveHttp: XrayHttpCall | null = null;

  function phase(name: string): void {
    const now = Date.now();
    // End the current phase
    const prev = call.phases[call.phases.length - 1];
    if (prev && prev.endedAt === null) {
      prev.endedAt = now;
      prev.durationMs = now - prev.startedAt;
    }
    call.phases.push({
      name,
      startedAt: now,
      endedAt: null,
      durationMs: null,
    });
    call.currentPhase = name;

    // Push to trace
    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_phase", {
        callId: call.id,
        kind: call.kind,
        integrationId: call.integrationId,
        actionName: call.actionName,
        phase: name,
        elapsedMs: now - call.startedAt,
        priorPhase: prev?.name ?? null,
        priorPhaseDurationMs: prev?.durationMs ?? null,
      });
    } catch { /* tracing must not break calls */ }
  }

  function httpStart(method: string, url: string, requestBody?: string | null): XrayHttpCall {
    const now = Date.now();
    const entry: XrayHttpCall = {
      seq: ++httpSeq,
      method,
      url,
      phase: call.currentPhase ?? "unknown",
      startedAt: now,
      endedAt: null,
      durationMs: null,
      statusCode: null,
      error: null,
      requestBody: requestBody ? (requestBody.length > 2048 ? requestBody.slice(0, 2048) + `...[${requestBody.length - 2048}c]` : requestBody) : null,
      responseBody: null,
    };
    call.httpCalls.push(entry);
    currentActiveHttp = entry;
    return entry;
  }

  function httpEnd(
    httpEntry: XrayHttpCall,
    statusCode: number | null,
    durationMs: number,
    responseBody?: string | null,
    error?: string | null,
  ): void {
    httpEntry.endedAt = Date.now();
    httpEntry.durationMs = durationMs;
    httpEntry.statusCode = statusCode;
    httpEntry.error = error ?? null;
    httpEntry.responseBody = responseBody ? (responseBody.length > 2048 ? responseBody.slice(0, 2048) + `...[${responseBody.length - 2048}c]` : responseBody) : null;
    if (currentActiveHttp === httpEntry) currentActiveHttp = null;

    // Push to trace
    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_http", {
        callId: call.id,
        kind: call.kind,
        integrationId: call.integrationId,
        actionName: call.actionName,
        phase: httpEntry.phase,
        method: httpEntry.method,
        url: httpEntry.url,
        statusCode,
        durationMs,
        error: error ?? null,
        requestBody: httpEntry.requestBody,
        responseBody: httpEntry.responseBody,
      });
    } catch { /* tracing must not break calls */ }
  }

  function end(status: "success" | "error", error?: string): void {
    const now = Date.now();
    // Close current phase
    const lastPhase = call.phases[call.phases.length - 1];
    if (lastPhase && lastPhase.endedAt === null) {
      lastPhase.endedAt = now;
      lastPhase.durationMs = now - lastPhase.startedAt;
    }
    call.endedAt = now;
    call.durationMs = now - call.startedAt;
    call.status = status;
    call.error = error ?? null;

    // Push summary to trace
    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_complete", {
        callId: call.id,
        kind: call.kind,
        integrationId: call.integrationId,
        actionName: call.actionName,
        status,
        durationMs: call.durationMs,
        error: error ?? null,
        phases: call.phases.map(p => ({
          name: p.name,
          durationMs: p.durationMs,
        })),
        httpCalls: call.httpCalls.map(h => ({
          seq: h.seq,
          method: h.method,
          url: h.url,
          phase: h.phase,
          statusCode: h.statusCode,
          durationMs: h.durationMs,
          error: h.error,
        })),
      });
    } catch { /* tracing must not break calls */ }

    // Console summary
    const phases = call.phases.map(p => `${p.name}:${p.durationMs ?? "?"}ms`).join(" → ");
    const httpSummary = call.httpCalls.map(h =>
      `  ${h.method} ${h.url} → ${h.statusCode ?? "ERR"} ${h.durationMs ?? "?"}ms [${h.phase}]${h.error ? ` ERR: ${h.error}` : ""}`
    ).join("\n");
    const prefix = `[X-Ray:${call.kind}]`;
    console.log(`${prefix} ${status.toUpperCase()} ${call.integrationId}/${call.actionName} ${call.durationMs}ms\n  Phases: ${phases}${call.httpCalls.length > 0 ? `\n  HTTP:\n${httpSummary}` : ""}${error ? `\n  Error: ${error}` : ""}`);

    onEnd();
  }

  return {
    call,
    phase,
    httpStart,
    httpEnd,
    end,
    get currentActiveHttp() { return currentActiveHttp; },
  };
}

export interface XrayCallHandle {
  call: XrayCall;
  phase(name: string): void;
  httpStart(method: string, url: string, requestBody?: string | null): XrayHttpCall;
  httpEnd(httpEntry: XrayHttpCall, statusCode: number | null, durationMs: number, responseBody?: string | null, error?: string | null): void;
  end(status: "success" | "error", error?: string): void;
  readonly currentActiveHttp: XrayHttpCall | null;
}

// ─── Registry ───────────────────────────────────────────

/** All currently in-flight calls */
const activeCalls = new Map<string, XrayCallHandle>();

/** Completed call history — ring buffer per integration */
const MAX_HISTORY_PER_INTEGRATION = 100;
const completedHistory = new Map<string, XrayCall[]>();

/** Per-integration latency samples (ring buffer, last 500) */
const MAX_LATENCY_SAMPLES = 500;
const latencySamples = new Map<string, number[]>();

/** Per-integration slow HTTP calls (top 20 slowest) */
const MAX_SLOW_HTTP = 20;
const slowHttp = new Map<string, XrayStats["slowestHttp"]>();

/** Per-integration slow phases (top 20 slowest) */
const MAX_SLOW_PHASES = 20;
const slowPhases = new Map<string, XrayStats["slowestPhases"]>();

/** Per-integration error / success counts */
const counters = new Map<string, { success: number; error: number; lastCallAt: number; lastError: string | null; lastErrorAt: number | null }>();

function recordCompletion(call: XrayCall): void {
  const key = call.integrationId;

  // Update counters
  let c = counters.get(key);
  if (!c) {
    c = { success: 0, error: 0, lastCallAt: 0, lastError: null, lastErrorAt: null };
    counters.set(key, c);
  }
  c.lastCallAt = call.endedAt ?? Date.now();
  if (call.status === "success") {
    c.success++;
  } else {
    c.error++;
    c.lastError = call.error;
    c.lastErrorAt = call.endedAt ?? Date.now();
  }

  // Record latency
  if (call.durationMs != null) {
    let samples = latencySamples.get(key);
    if (!samples) { samples = []; latencySamples.set(key, samples); }
    samples.push(call.durationMs);
    if (samples.length > MAX_LATENCY_SAMPLES) samples.shift();
  }

  // Record slow HTTP
  for (const h of call.httpCalls) {
    if (h.durationMs == null) continue;
    let arr = slowHttp.get(key);
    if (!arr) { arr = []; slowHttp.set(key, arr); }
    arr.push({
      url: h.url,
      method: h.method,
      durationMs: h.durationMs,
      statusCode: h.statusCode,
      actionName: call.actionName,
      ts: h.startedAt,
    });
    arr.sort((a, b) => b.durationMs - a.durationMs);
    if (arr.length > MAX_SLOW_HTTP) arr.length = MAX_SLOW_HTTP;
  }

  // Record slow phases
  for (const p of call.phases) {
    if (p.durationMs == null) continue;
    let arr = slowPhases.get(key);
    if (!arr) { arr = []; slowPhases.set(key, arr); }
    arr.push({
      phase: p.name,
      durationMs: p.durationMs,
      actionName: call.actionName,
      ts: p.startedAt,
    });
    arr.sort((a, b) => b.durationMs - a.durationMs);
    if (arr.length > MAX_SLOW_PHASES) arr.length = MAX_SLOW_PHASES;
  }

  // History
  let hist = completedHistory.get(key);
  if (!hist) { hist = []; completedHistory.set(key, hist); }
  hist.push(call);
  if (hist.length > MAX_HISTORY_PER_INTEGRATION) hist.shift();
}

// ─── Public API ─────────────────────────────────────────

function start(opts: {
  kind: CallKind;
  integrationId: string;
  actionName: string;
  projectId?: string | null;
  userId?: string | null;
  args?: unknown;
}): XrayCallHandle {
  const id = `xray-${++callSeq}-${Date.now()}`;
  const call: XrayCall = {
    id,
    kind: opts.kind,
    integrationId: opts.integrationId,
    actionName: opts.actionName,
    projectId: opts.projectId ?? null,
    userId: opts.userId ?? null,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: null,
    status: "running",
    error: null,
    phases: [],
    httpCalls: [],
    currentPhase: null,
  };

  const handle = createCallHandle(call, () => {
    activeCalls.delete(id);
    recordCompletion(call);
  });

  activeCalls.set(id, handle);

  // Push to trace
  try {
    const trace = opts.projectId ? getActiveTrace(opts.projectId) : null;
    trace?.pushRaw("xray_start", {
      callId: id,
      kind: opts.kind,
      integrationId: opts.integrationId,
      actionName: opts.actionName,
      args: opts.args,
    });
  } catch { /* tracing must not break calls */ }

  return handle;
}

/** Get snapshots of all currently in-flight calls */
function getActive(): XraySnapshot[] {
  const now = Date.now();
  const result: XraySnapshot[] = [];
  for (const handle of activeCalls.values()) {
    const c = handle.call;
    const lastPhase = c.phases[c.phases.length - 1];
    const activeHttp = handle.currentActiveHttp;
    result.push({
      id: c.id,
      kind: c.kind,
      integrationId: c.integrationId,
      actionName: c.actionName,
      projectId: c.projectId,
      runningForMs: now - c.startedAt,
      currentPhase: c.currentPhase,
      currentPhaseRunningMs: lastPhase && lastPhase.endedAt === null
        ? now - lastPhase.startedAt
        : null,
      httpCallCount: c.httpCalls.length,
      activeHttp: activeHttp && activeHttp.endedAt === null
        ? { method: activeHttp.method, url: activeHttp.url, runningMs: now - activeHttp.startedAt }
        : null,
      phases: c.phases.map(p => ({
        name: p.name,
        durationMs: p.endedAt ? p.durationMs : (now - p.startedAt),
      })),
    });
  }
  return result.sort((a, b) => b.runningForMs - a.runningForMs);
}

/** Get calls that have been running longer than thresholdMs */
function getStuck(thresholdMs = 30_000): XraySnapshot[] {
  return getActive().filter(s => s.runningForMs >= thresholdMs);
}

/** Get per-integration latency stats */
function getStats(integrationId: string): XrayStats | null {
  const samples = latencySamples.get(integrationId);
  const c = counters.get(integrationId);
  if (!samples?.length && !c) return null;

  const sorted = [...(samples ?? [])].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)] ?? 0;

  return {
    integrationId,
    totalCalls: (c?.success ?? 0) + (c?.error ?? 0),
    successCount: c?.success ?? 0,
    errorCount: c?.error ?? 0,
    avgMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    slowestHttp: slowHttp.get(integrationId) ?? [],
    slowestPhases: slowPhases.get(integrationId) ?? [],
    lastCallAt: c?.lastCallAt ?? null,
    lastError: c?.lastError ?? null,
    lastErrorAt: c?.lastErrorAt ?? null,
  };
}

/** Get stats for ALL integrations that have been called */
function getAllStats(): XrayStats[] {
  const allKeys = new Set([...counters.keys(), ...latencySamples.keys()]);
  const result: XrayStats[] = [];
  for (const key of allKeys) {
    const s = getStats(key);
    if (s) result.push(s);
  }
  return result.sort((a, b) => b.totalCalls - a.totalCalls);
}

/** Get recent completed call history for an integration */
function getHistory(integrationId: string, limit = 20): XrayCall[] {
  const hist = completedHistory.get(integrationId);
  if (!hist) return [];
  return hist.slice(-limit);
}

/** Get a single call by ID (active or recent completed) */
function getCall(callId: string): XrayCall | null {
  const active = activeCalls.get(callId);
  if (active) return active.call;
  for (const hist of completedHistory.values()) {
    const found = hist.find(c => c.id === callId);
    if (found) return found;
  }
  return null;
}

export const xray = {
  start,
  getActive,
  getStuck,
  getStats,
  getAllStats,
  getHistory,
  getCall,
};
