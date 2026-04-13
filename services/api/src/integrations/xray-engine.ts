import { getActiveTrace } from "../ai/trace-collector.js";
import type {
  CallKind,
  XrayPhase,
  XrayHttpCall,
  XrayCall,
  XraySnapshot,
  XrayStats,
  XrayCallHandle,
} from "./xray-types.js";
import {
  recordSandboxDecision,
  recordVaultEvent,
  getSandboxHistory,
  getVaultHistory,
  recordSpan,
  getSpans,
  getSpanStats,
} from "./xray-audit.js";

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
    const prev = call.phases[call.phases.length - 1];
    if (prev && prev.endedAt === null) {
      prev.endedAt = now;
      prev.durationMs = now - prev.startedAt;
    }
    call.phases.push({ name, startedAt: now, endedAt: null, durationMs: null });
    call.currentPhase = name;

    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_phase", {
        callId: call.id, kind: call.kind, integrationId: call.integrationId,
        actionName: call.actionName, phase: name, elapsedMs: now - call.startedAt,
        priorPhase: prev?.name ?? null, priorPhaseDurationMs: prev?.durationMs ?? null,
      });
    } catch { /* tracing must not break calls */ }
  }

  function httpStart(method: string, url: string, requestBody?: string | null): XrayHttpCall {
    const now = Date.now();
    const entry: XrayHttpCall = {
      seq: ++httpSeq, method, url, phase: call.currentPhase ?? "unknown",
      startedAt: now, endedAt: null, durationMs: null, statusCode: null, error: null,
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

    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_http", {
        callId: call.id, kind: call.kind, integrationId: call.integrationId,
        actionName: call.actionName, phase: httpEntry.phase,
        method: httpEntry.method, url: httpEntry.url,
        statusCode, durationMs, error: error ?? null,
        requestBody: httpEntry.requestBody, responseBody: httpEntry.responseBody,
      });
    } catch { /* tracing must not break calls */ }
  }

  function end(status: "success" | "error", error?: string): void {
    const now = Date.now();
    const lastPhase = call.phases[call.phases.length - 1];
    if (lastPhase && lastPhase.endedAt === null) {
      lastPhase.endedAt = now;
      lastPhase.durationMs = now - lastPhase.startedAt;
    }
    call.endedAt = now;
    call.durationMs = now - call.startedAt;
    call.status = status;
    call.error = error ?? null;

    try {
      const trace = call.projectId ? getActiveTrace(call.projectId) : null;
      trace?.pushRaw("xray_complete", {
        callId: call.id, kind: call.kind, integrationId: call.integrationId,
        actionName: call.actionName, status, durationMs: call.durationMs,
        error: error ?? null,
        phases: call.phases.map(p => ({ name: p.name, durationMs: p.durationMs })),
        httpCalls: call.httpCalls.map(h => ({
          seq: h.seq, method: h.method, url: h.url, phase: h.phase,
          statusCode: h.statusCode, durationMs: h.durationMs, error: h.error,
        })),
      });
    } catch { /* tracing must not break calls */ }

    const phases = call.phases.map(p => `${p.name}:${p.durationMs ?? "?"}ms`).join(" → ");
    const httpSummary = call.httpCalls.map(h =>
      `  ${h.method} ${h.url} → ${h.statusCode ?? "ERR"} ${h.durationMs ?? "?"}ms [${h.phase}]${h.error ? ` ERR: ${h.error}` : ""}`
    ).join("\n");
    const prefix = `[X-Ray:${call.kind}]`;
    console.log(`${prefix} ${status.toUpperCase()} ${call.integrationId}/${call.actionName} ${call.durationMs}ms\n  Phases: ${phases}${call.httpCalls.length > 0 ? `\n  HTTP:\n${httpSummary}` : ""}${error ? `\n  Error: ${error}` : ""}`);

    onEnd();
  }

  return {
    call, phase, httpStart, httpEnd, end,
    get currentActiveHttp() { return currentActiveHttp; },
  };
}

// ─── Registry ───────────────────────────────────────────

const activeCalls = new Map<string, XrayCallHandle>();
const MAX_HISTORY_PER_INTEGRATION = 100;
const completedHistory = new Map<string, XrayCall[]>();
const MAX_LATENCY_SAMPLES = 500;
const latencySamples = new Map<string, number[]>();
const MAX_SLOW_HTTP = 20;
const slowHttp = new Map<string, XrayStats["slowestHttp"]>();
const MAX_SLOW_PHASES = 20;
const slowPhases = new Map<string, XrayStats["slowestPhases"]>();
const counters = new Map<string, { success: number; error: number; lastCallAt: number; lastError: string | null; lastErrorAt: number | null }>();

function recordCompletion(call: XrayCall): void {
  const key = call.integrationId;

  let c = counters.get(key);
  if (!c) { c = { success: 0, error: 0, lastCallAt: 0, lastError: null, lastErrorAt: null }; counters.set(key, c); }
  c.lastCallAt = call.endedAt ?? Date.now();
  if (call.status === "success") { c.success++; } else { c.error++; c.lastError = call.error; c.lastErrorAt = call.endedAt ?? Date.now(); }

  if (call.durationMs != null) {
    let samples = latencySamples.get(key);
    if (!samples) { samples = []; latencySamples.set(key, samples); }
    samples.push(call.durationMs);
    if (samples.length > MAX_LATENCY_SAMPLES) samples.shift();
  }

  for (const h of call.httpCalls) {
    if (h.durationMs == null) continue;
    let arr = slowHttp.get(key);
    if (!arr) { arr = []; slowHttp.set(key, arr); }
    arr.push({ url: h.url, method: h.method, durationMs: h.durationMs, statusCode: h.statusCode, actionName: call.actionName, ts: h.startedAt });
    arr.sort((a, b) => b.durationMs - a.durationMs);
    if (arr.length > MAX_SLOW_HTTP) arr.length = MAX_SLOW_HTTP;
  }

  for (const p of call.phases) {
    if (p.durationMs == null) continue;
    let arr = slowPhases.get(key);
    if (!arr) { arr = []; slowPhases.set(key, arr); }
    arr.push({ phase: p.name, durationMs: p.durationMs, actionName: call.actionName, ts: p.startedAt });
    arr.sort((a, b) => b.durationMs - a.durationMs);
    if (arr.length > MAX_SLOW_PHASES) arr.length = MAX_SLOW_PHASES;
  }

  let hist = completedHistory.get(key);
  if (!hist) { hist = []; completedHistory.set(key, hist); }
  hist.push(call);
  if (hist.length > MAX_HISTORY_PER_INTEGRATION) hist.shift();
}

// ─── Public API ─────────────────────────────────────────

function start(opts: {
  kind: CallKind; integrationId: string; actionName: string;
  projectId?: string | null; userId?: string | null; args?: unknown;
}): XrayCallHandle {
  const id = `xray-${++callSeq}-${Date.now()}`;
  const call: XrayCall = {
    id, kind: opts.kind, integrationId: opts.integrationId,
    actionName: opts.actionName, projectId: opts.projectId ?? null,
    userId: opts.userId ?? null, startedAt: Date.now(), endedAt: null,
    durationMs: null, status: "running", error: null, phases: [],
    httpCalls: [], currentPhase: null,
  };

  const handle = createCallHandle(call, () => { activeCalls.delete(id); recordCompletion(call); });
  activeCalls.set(id, handle);

  try {
    const trace = opts.projectId ? getActiveTrace(opts.projectId) : null;
    trace?.pushRaw("xray_start", { callId: id, kind: opts.kind, integrationId: opts.integrationId, actionName: opts.actionName, args: opts.args });
  } catch { /* tracing must not break calls */ }

  return handle;
}

function getActive(): XraySnapshot[] {
  const now = Date.now();
  const result: XraySnapshot[] = [];
  for (const handle of activeCalls.values()) {
    const c = handle.call;
    const lastPhase = c.phases[c.phases.length - 1];
    const activeHttp = handle.currentActiveHttp;
    result.push({
      id: c.id, kind: c.kind, integrationId: c.integrationId,
      actionName: c.actionName, projectId: c.projectId,
      runningForMs: now - c.startedAt, currentPhase: c.currentPhase,
      currentPhaseRunningMs: lastPhase && lastPhase.endedAt === null ? now - lastPhase.startedAt : null,
      httpCallCount: c.httpCalls.length,
      activeHttp: activeHttp && activeHttp.endedAt === null
        ? { method: activeHttp.method, url: activeHttp.url, runningMs: now - activeHttp.startedAt }
        : null,
      phases: c.phases.map(p => ({ name: p.name, durationMs: p.endedAt ? p.durationMs : (now - p.startedAt) })),
    });
  }
  return result.sort((a, b) => b.runningForMs - a.runningForMs);
}

function getStuck(thresholdMs = 30_000): XraySnapshot[] {
  return getActive().filter(s => s.runningForMs >= thresholdMs);
}

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
    p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    slowestHttp: slowHttp.get(integrationId) ?? [],
    slowestPhases: slowPhases.get(integrationId) ?? [],
    lastCallAt: c?.lastCallAt ?? null,
    lastError: c?.lastError ?? null,
    lastErrorAt: c?.lastErrorAt ?? null,
  };
}

function getAllStats(): XrayStats[] {
  const allKeys = new Set([...counters.keys(), ...latencySamples.keys()]);
  const result: XrayStats[] = [];
  for (const key of allKeys) { const s = getStats(key); if (s) result.push(s); }
  return result.sort((a, b) => b.totalCalls - a.totalCalls);
}

function getHistory(integrationId: string, limit = 20): XrayCall[] {
  const hist = completedHistory.get(integrationId);
  if (!hist) return [];
  return hist.slice(-limit);
}

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
  start, getActive, getStuck, getStats, getAllStats, getHistory, getCall,
  recordSandboxDecision, recordVaultEvent, getSandboxHistory, getVaultHistory,
  recordSpan, getSpans, getSpanStats,
};
