/**
 * Per devframeworkPRD/04-redaction-and-filters.md §4.2-§4.3 + §5.
 *
 * Workspace-scoped filter loader. Reads `workspace_log_filters` rows
 * for a workspace and converts them into LogFilter objects that run
 * AFTER the always-on baseline chain (PRD 04 §5).
 *
 * Cached for 60s so the dev-server / builder hot path does not hit
 * the DB on every spawn. Failures (DB error, regex compile error)
 * silently skip — workspace filter loading must never block dev-server
 * start or builds.
 */

import { sql } from "../../db/index.js";
import type { LogFilter, FilterContext } from "./types.js";

interface CachedFilters {
  loadedAt: number;
  filters: LogFilter[];
}

const cache = new Map<string, CachedFilters>();
const CACHE_TTL_MS = 60_000;

interface WorkspaceFilterRow {
  id: number;
  filter_id: "deny-pattern" | "drop-pattern";
  config: { pattern: string; token?: string };
  enabled: boolean;
}

/**
 * Load enabled workspace log filters for the given workspace, with a
 * short in-memory TTL cache. Returns an empty list if the workspaceId
 * is empty, the DB query fails, or no rows are enabled.
 */
export async function loadWorkspaceFilters(
  workspaceId: string,
): Promise<LogFilter[]> {
  const now = Date.now();
  const cached = cache.get(workspaceId);
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) return cached.filters;

  let rows: WorkspaceFilterRow[];
  try {
    rows = await sql<WorkspaceFilterRow[]>`
      SELECT id, filter_id, config, enabled
      FROM workspace_log_filters
      WHERE workspace_id = ${workspaceId} AND enabled = true
      ORDER BY id
    `;
  } catch (err) {
    console.warn(
      "[workspace-filters] load failed:",
      err instanceof Error ? err.message : err,
    );
    cache.set(workspaceId, { loadedAt: now, filters: [] });
    return [];
  }

  const filters: LogFilter[] = [];
  for (const row of rows) {
    if (row.filter_id === "deny-pattern") {
      const pattern = row.config?.pattern;
      const token = row.config?.token ?? "<REDACTED:custom>";
      if (typeof pattern !== "string" || pattern.length === 0) continue;
      let re: RegExp;
      try {
        re = new RegExp(pattern, "g");
      } catch {
        continue;
      }
      filters.push({
        id: `deny-pattern:${row.id}`,
        apply(line: string, _ctx: FilterContext): string | null {
          return line.replace(re, token);
        },
      });
    } else if (row.filter_id === "drop-pattern") {
      const pattern = row.config?.pattern;
      if (typeof pattern !== "string" || pattern.length === 0) continue;
      let re: RegExp;
      try {
        re = new RegExp(pattern);
      } catch {
        continue;
      }
      filters.push({
        id: `drop-pattern:${row.id}`,
        apply(line: string, _ctx: FilterContext): string | null {
          return re.test(line) ? null : line;
        },
      });
    }
  }

  cache.set(workspaceId, { loadedAt: now, filters });
  return filters;
}

/**
 * Drop the cache entry for a workspace (or all entries when called
 * without an argument). Called by the workspace-admin UI after a row
 * is created/edited/deleted so the new policy takes effect immediately.
 */
export function clearWorkspaceFilterCache(workspaceId?: string): void {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}
