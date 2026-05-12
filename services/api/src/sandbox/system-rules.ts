/**
 * System-level sandbox rule loader.
 *
 * Reads `sandbox_system_rules` (Migration 080) and caches the result
 * for 60 seconds to avoid per-spawn queries. All hardcoded security
 * constants formerly in `./profiles/constants.ts` are now fully
 * configurable via `doable admin` CLI/TUI.
 *
 * Three scopes:
 *   scope='global'          → applies to ALL profiles (hard floors)
 *   scope='profile:<key>'   → per-profile defaults
 */

import { sql } from "../db/index.js";

// ───────────────────────── types ─────────────────────────

export interface SystemRule {
  id: string;
  scope: string;
  rule_type: string;
  pattern: string;
  action: "allow" | "deny";
  priority: number;
  is_floor: boolean;
  enabled: boolean;
  description: string | null;
}

export interface SystemRules {
  /** All loaded system rules. */
  all: SystemRule[];

  /** Global network deny floors (is_floor=true, scope='global', rule_type='network'). */
  networkFloors: string[];

  /** Global syscall deny floors (scope='global', rule_type='syscall'). */
  syscallFloors: string[];

  /** Global blocked packages (scope='global', rule_type='package'). */
  blockedPackages: Set<string>;

  /** Network allows for a specific profile (scope='profile:<key>'). */
  profileNetworkAllows: (profileKey: string) => string[];

  /** Network denies for a specific profile (scope='profile:<key>'). */
  profileNetworkDenies: (profileKey: string) => string[];
}

// ───────────────────────── fallback defaults ─────────────────────────

// Used ONLY when the sandbox_system_rules table doesn't exist yet (pre-080).
const FALLBACK_NET_FLOORS = ["ipinfo.io", "*.ipinfo.io", "169.254.169.254"];

const FALLBACK_SYSCALL_FLOORS = [
  "bpf", "keyctl", "io_uring_setup", "io_uring_enter", "io_uring_register",
  "userfaultfd", "perf_event_open", "ptrace", "process_vm_readv", "process_vm_writev",
  "unshare", "setns", "mount", "umount", "umount2", "pivot_root", "chroot",
  "kexec_load", "kexec_file_load", "init_module", "finit_module", "delete_module",
  "create_module", "query_module", "get_kernel_syms", "syslog",
  "_sysctl", "lookup_dcookie", "uselib", "iopl", "ioperm",
];

const FALLBACK_BLOCKED_PACKAGES = new Set(["eval", "child_process", "fs-extra-unsafe"]);

const FALLBACK_PROFILE_NET: Record<string, string[]> = {
  "ai-bash": ["registry.npmjs.org", "api.anthropic.com", "api.openai.com", "ghcr.io", "github.com"],
  "vite-preview": ["registry.npmjs.org", "registry.yarnpkg.com", "esm.sh", "unpkg.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"],
  "install": ["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org"],
  "build": ["registry.npmjs.org", "*.sentry.io"],
};

// ───────────────────────── cache ─────────────────────────

let cachedRules: SystemRules | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Force the cache to expire so the next call re-queries the DB.
 * Useful after a CLI/TUI mutation.
 */
export function invalidateSystemRulesCache(): void {
  cachedRules = null;
  cacheExpiry = 0;
}

// ───────────────────────── loader ─────────────────────────

/**
 * Load system rules from the database. Returns cached result if fresh.
 * Falls back to hardcoded defaults if the table doesn't exist yet
 * (pre-Migration-080).
 */
export async function loadSystemRules(): Promise<SystemRules> {
  const now = Date.now();
  if (cachedRules && now < cacheExpiry) return cachedRules;

  try {
    const rows = await sql<SystemRule[]>`
      SELECT id, scope, rule_type, pattern, action, priority, is_floor, enabled, description
      FROM sandbox_system_rules
      WHERE enabled = true
      ORDER BY scope, rule_type, priority ASC
    `;

    cachedRules = buildSystemRules(rows);
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedRules;
  } catch (err: unknown) {
    // 42P01 = undefined_table — migration 080 not applied yet.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "42P01"
    ) {
      cachedRules = buildFallbackRules();
      cacheExpiry = now + CACHE_TTL_MS;
      return cachedRules;
    }
    throw err;
  }
}

// ───────────────────────── builders ─────────────────────────

function buildSystemRules(rows: SystemRule[]): SystemRules {
  const networkFloors: string[] = [];
  const syscallFloors: string[] = [];
  const blockedPackages = new Set<string>();

  // Index profile network rules by profile key
  const profileNet = new Map<string, { allows: string[]; denies: string[] }>();

  for (const r of rows) {
    if (r.scope === "global") {
      switch (r.rule_type) {
        case "network":
          if (r.action === "deny") networkFloors.push(r.pattern);
          break;
        case "syscall":
          if (r.action === "deny") syscallFloors.push(r.pattern);
          break;
        case "package":
          if (r.action === "deny") blockedPackages.add(r.pattern);
          break;
      }
    } else if (r.scope.startsWith("profile:")) {
      const profileKey = r.scope.slice("profile:".length);
      if (!profileNet.has(profileKey)) {
        profileNet.set(profileKey, { allows: [], denies: [] });
      }
      const entry = profileNet.get(profileKey)!;
      if (r.rule_type === "network") {
        if (r.action === "allow") entry.allows.push(r.pattern);
        else entry.denies.push(r.pattern);
      }
    }
  }

  return {
    all: rows,
    networkFloors,
    syscallFloors,
    blockedPackages,
    profileNetworkAllows: (key: string) => profileNet.get(key)?.allows ?? [],
    profileNetworkDenies: (key: string) => profileNet.get(key)?.denies ?? [],
  };
}

function buildFallbackRules(): SystemRules {
  return {
    all: [],
    networkFloors: [...FALLBACK_NET_FLOORS],
    syscallFloors: [...FALLBACK_SYSCALL_FLOORS],
    blockedPackages: new Set(FALLBACK_BLOCKED_PACKAGES),
    profileNetworkAllows: (key: string) => FALLBACK_PROFILE_NET[key] ?? [],
    profileNetworkDenies: () => [],
  };
}
