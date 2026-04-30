// Central kill-switch state. Resolves the effective tracing level for a given
// (user, workspace, route) tuple. Consulted by DoableSampler on every span.

import { sql } from "../db/index.js";
import type { TracingLevel } from "./types.js";

let globalLevel: TracingLevel = (process.env.TRACING_LEVEL as TracingLevel) ?? "off";

interface CachedOverride {
  level: TracingLevel;
  expiresAt: number;
}

// Per-key caches with TTL = expiresAt
const userOverrides = new Map<string, CachedOverride>();
const workspaceOverrides = new Map<string, CachedOverride>();
const routeOverrides: Array<{ pattern: RegExp; level: TracingLevel }> = [];

let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export function getGlobalLevel(): TracingLevel {
  return globalLevel;
}

export function setGlobalLevel(level: TracingLevel): TracingLevel {
  const prev = globalLevel;
  globalLevel = level;
  return prev;
}

export interface LevelResolutionInput {
  userId?: string;
  workspaceId?: string;
  spanName?: string;
  hasError?: boolean;
}

/**
 * Resolve the effective level. Hierarchy (most-specific wins):
 *   1. per-trace error boost (handled by tail-sample step, not here)
 *   2. per-user override
 *   3. per-workspace override
 *   4. per-route override
 *   5. global (default)
 */
export function resolveLevel(input: LevelResolutionInput): TracingLevel {
  const now = Date.now();
  if (input.userId) {
    const u = userOverrides.get(input.userId);
    if (u && u.expiresAt > now) return u.level;
  }
  if (input.workspaceId) {
    const w = workspaceOverrides.get(input.workspaceId);
    if (w && w.expiresAt > now) return w.level;
  }
  if (input.spanName) {
    for (const r of routeOverrides) if (r.pattern.test(input.spanName)) return r.level;
  }
  return globalLevel;
}

/** Refresh override caches from Postgres. Cheap when nothing changes. */
export async function refreshOverrideCaches(): Promise<void> {
  const now = Date.now();
  if (now - cacheLoadedAt < CACHE_TTL_MS) return;
  cacheLoadedAt = now;
  try {
    const rows = (await sql`
      SELECT scope, scope_value, level, expires_at
      FROM tracing_overrides
      WHERE revoked_at IS NULL AND expires_at > now()
    `) as Array<{ scope: string; scope_value: string; level: TracingLevel; expires_at: Date }>;

    userOverrides.clear();
    workspaceOverrides.clear();
    routeOverrides.length = 0;

    for (const r of rows) {
      const expMs = new Date(r.expires_at).getTime();
      if (r.scope === "user") userOverrides.set(r.scope_value, { level: r.level, expiresAt: expMs });
      else if (r.scope === "workspace") workspaceOverrides.set(r.scope_value, { level: r.level, expiresAt: expMs });
      else if (r.scope === "route") {
        try { routeOverrides.push({ pattern: new RegExp(r.scope_value), level: r.level }); }
        catch { /* invalid regex — ignore */ }
      }
    }
  } catch {
    // Override table may not exist yet (migration not run) or DB unreachable.
    // Fall through to global level — never block app on tracing infra.
  }
}

export interface OverrideInput {
  scope: "user" | "workspace" | "route";
  scopeValue: string;
  level: TracingLevel;
  reason: string;
  grantedBy: string | null;
  ttlMinutes: number;
}

export async function addOverride(input: OverrideInput): Promise<string> {
  const ttlMin = Math.min(Math.max(input.ttlMinutes, 1), 240); // cap at 4h
  const [r] = (await sql`
    INSERT INTO tracing_overrides (scope, scope_value, level, reason, granted_by, expires_at)
    VALUES (${input.scope}, ${input.scopeValue}, ${input.level}, ${input.reason},
            ${input.grantedBy}, now() + ${`${ttlMin} minutes`}::interval)
    RETURNING id
  `) as Array<{ id: string }>;
  cacheLoadedAt = 0; // invalidate
  if (!r) throw new Error("addOverride: INSERT returned no row");
  return r.id;
}

export async function listActiveOverrides() {
  return await sql`
    SELECT id, scope, scope_value, level, reason, granted_by, granted_at, expires_at
    FROM tracing_overrides
    WHERE revoked_at IS NULL AND expires_at > now()
    ORDER BY granted_at DESC
  `;
}

export async function revokeOverride(id: string): Promise<void> {
  await sql`UPDATE tracing_overrides SET revoked_at = now() WHERE id = ${id}::uuid`;
  cacheLoadedAt = 0;
}
