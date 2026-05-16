/**
 * Shared helpers for all OOB smoke tests.
 * No framework dependencies — plain Node.js fetch (requires Node 18+).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";

// ─── Config from env ──────────────────────────────────────────────────────
export const BASE = (process.env.DOABLE_BASE ?? "http://localhost:3001").replace(/\/$/, "");
export const API  = BASE.includes("localhost") || BASE.includes("127.0.0.1")
  ? BASE  // bare-metal / docker — API is same host (or set DOABLE_API_BASE separately)
  : BASE;
export const API_BASE = (process.env.DOABLE_API_BASE ?? API).replace(/\/$/, "");
export const WS_BASE  = (process.env.DOABLE_WS_BASE  ?? API_BASE.replace(/^http/, "ws")).replace(/\/$/, "");

export const TEST_EMAIL    = process.env.DOABLE_TEST_EMAIL    ?? `oob-smoke-${Date.now()}@example.local`;
export const TEST_PASSWORD = process.env.DOABLE_TEST_PASSWORD ?? "SmokeTest99!";
export const MINIMAX_KEY   = process.env.DOABLE_MINIMAX_KEY   ?? "";

// ─── Evidence dir ────────────────────────────────────────────────────────
const EVIDENCE_DIR = path.resolve(import.meta.dirname ?? process.cwd(), "..", "evidence");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export function saveEvidence(tcId: string, body: unknown, headers?: Record<string, string>, extra?: string): void {
  const base = path.join(EVIDENCE_DIR, tcId);
  fs.writeFileSync(`${base}.body`, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  if (headers) fs.writeFileSync(`${base}.hdr`, JSON.stringify(headers, null, 2));
  if (extra)   fs.writeFileSync(`${base}.log`, extra);
}

// ─── fetch wrapper — ignores self-signed TLS ─────────────────────────────
const agent = new https.Agent({ rejectUnauthorized: false });

export async function apiFetch(
  path: string,
  init: RequestInit & { token?: string; rawBase?: string } = {},
): Promise<Response> {
  const { token, rawBase, ...rest } = init;
  const url = `${rawBase ?? API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string> ?? {}),
  };
  // @ts-ignore — Node 18 global fetch accepts dispatcher/agent via undici
  return fetch(url, { ...rest, headers, dispatcher: undefined, agent: url.startsWith("https") ? agent : undefined });
}

// ─── Result accumulator ──────────────────────────────────────────────────
export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

export function pass(id: string, name: string): void {
  results.push({ id, name, passed: true });
  console.log(`  PASS  [${id}] ${name}`);
}

export function skip(id: string, name: string, reason: string): void {
  results.push({ id, name, passed: true, error: `SKIP: ${reason}` });
  console.log(`  SKIP  [${id}] ${name} — ${reason}`);
}

export function fail(id: string, name: string, reason: string): void {
  results.push({ id, name, passed: false, error: reason });
  console.error(`  FAIL  [${id}] ${name} — ${reason}`);
}

export function getResults(): TestResult[] { return results; }

// ─── Assertion helpers ───────────────────────────────────────────────────
export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function expectStatus(res: Response, expected: number, tcId: string): Promise<void> {
  const text = await res.text();
  saveEvidence(tcId, text, Object.fromEntries(res.headers.entries()));
  assert(res.status === expected, `Expected HTTP ${expected}, got ${res.status}. Body: ${text.slice(0, 200)}`);
}

export async function expectJson(res: Response, tcId: string): Promise<unknown> {
  const text = await res.text();
  saveEvidence(tcId, text, Object.fromEntries(res.headers.entries()));
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Response is not JSON: ${text.slice(0, 200)}`); }
  return parsed;
}
