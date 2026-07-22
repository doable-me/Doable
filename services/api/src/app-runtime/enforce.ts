/**
 * Hard gates for generated-app writes when the app runtime is enabled.
 * create_file / edit_file call this before writing to disk.
 */

import { DOABLE_APP_RUNTIME_ENABLED } from "./config.js";

const APP_CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/i;

/** Paths that may contain SQL / workflow JS — not subject to UI SQL bans. */
function isExemptPath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (p.startsWith(".doable/")) return true;
  if (p.includes("/node_modules/") || p.startsWith("node_modules/")) return true;
  if (/\.(sql|md|json)$/i.test(p)) return true;
  return false;
}

function isAppSourcePath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (!APP_CODE_EXT.test(p)) return false;
  if (isExemptPath(p)) return false;
  return true;
}

/** Any ad-hoc SQL via @doable/data in app UI (named queries are required). */
const RAW_DB_QUERY =
  /\bdb\.(?:admin\.)?(?:query|exec)\s*\(/;

const CUSTOM_SERVER =
  /(?:from\s+['"]express['"]|require\s*\(\s*['"]express['"]|from\s+['"]fastify['"]|require\s*\(\s*['"]fastify['"]|from\s+['"]koa['"]|require\s*\(\s*['"]koa['"]|createServer\s*\()/;

export interface RuntimeWriteViolation {
  rule: "raw_db_query" | "custom_server";
  message: string;
}

/**
 * Returns a violation if content must not be written under the current flag.
 * When runtime is disabled (`DOABLE_APP_RUNTIME_ENABLED=0`), always returns null.
 */
export function findRuntimeWriteViolation(
  filePath: string,
  content: string,
  opts?: { enabled?: boolean },
): RuntimeWriteViolation | null {
  const enabled = opts?.enabled ?? DOABLE_APP_RUNTIME_ENABLED;
  if (!enabled) return null;
  if (!isAppSourcePath(filePath)) return null;

  if (RAW_DB_QUERY.test(content)) {
    return {
      rule: "raw_db_query",
      message:
        `⛔ Blocked write to ${filePath}: raw db.query / db.admin.query / db.exec with SQL is forbidden when the app runtime is enabled. ` +
        `Put SQL in .doable/backend/queries/<name>.sql and call \`import { runtime } from "@doable/runtime"; await runtime.queries.run("name", params)\`. ` +
        `Keep \`import { db } from "@doable/data"\` only for db.auth.* (signup/login/getUser). ` +
        `Set DOABLE_APP_RUNTIME_ENABLED=0 to disable this gate.`,
    };
  }

  if (CUSTOM_SERVER.test(content)) {
    return {
      rule: "custom_server",
      message:
        `⛔ Blocked write to ${filePath}: Express / Fastify / Koa / createServer backends are forbidden. ` +
        `Use named queries (.doable/backend/queries), auto CRUD (/__doable/api), and workflows (.doable/backend/workflows). ` +
        `Set DOABLE_APP_RUNTIME_ENABLED=0 to disable this gate.`,
    };
  }

  return null;
}

/** Error string for tool handlers, or null if OK. */
export function runtimeWriteGuardError(filePath: string, content: string): string | null {
  return findRuntimeWriteViolation(filePath, content)?.message ?? null;
}
