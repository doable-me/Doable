import type { ChildProcess } from "node:child_process";
import type { Tracer } from "./tracer.js";

// ═══════════════════════════════════════════════════════════════════════════
// Vault (top-level)
// ═══════════════════════════════════════════════════════════════════════════

export interface VaultOptions {
  /**
   * Enable Node.js Permission Model for spawned processes.
   * Restricts filesystem, child_process, and worker_threads at the kernel level.
   * Requires Node.js 22+. Falls back gracefully if unavailable.
   * @default true
   */
  permissionModel?: boolean;

  /** Default resource limits for all spawned processes */
  resourceLimits?: ResourceLimits;

  /**
   * Resource limiter backend selection.
   * - "auto" — pick best available (systemd > win-heap > direct)
   * - "systemd" — Linux cgroup limits via systemd-run
   * - "win-heap" — Windows V8 heap limit (best-effort)
   * - "direct" — no resource limits
   * @default "auto"
   */
  backend?: string;

  /** Custom safe config file templates (key = filename, value = content) */
  templates?: Record<string, string>;

  /** Additional config files to lock beyond built-in defaults */
  lockedFiles?: string[];

  /** Extra read-only directories for all spawned processes */
  readOnlyPaths?: string[];

  /** Audit callback — receives every security-relevant event */
  onAudit?: (entry: AuditEntry) => void;

  /** Tracer for span-level observability (vault.spawn, vault.config_lock, etc.) */
  tracer?: Tracer;
}

export interface SpawnOptions {
  /** Working directory for the spawned process */
  cwd: string;

  /**
   * Jail filesystem access to this directory.
   * When set, Node.js Permission Model restricts reads/writes to this path.
   * Typically the project directory.
   */
  jail?: string;

  /** Extra read-only paths for this specific spawn */
  readOnlyPaths?: string[];

  /**
   * Overwrite config files with safe templates before spawning.
   * Deletes variant files (e.g. vite.config.js when vite.config.ts is canonical)
   * to prevent shadowing attacks.
   * @default true
   */
  lockConfigs?: boolean;

  /**
   * Block child_process (prevents shell execution, reverse shells).
   * @default true
   */
  blockChildProcess?: boolean;

  /**
   * Block outbound network (Linux only — uses systemd IPAddressDeny).
   * Localhost is always allowed so dev servers can bind.
   * @default true
   */
  blockOutboundNet?: boolean;

  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;

  /** Override resource limits for this specific spawn */
  resourceLimits?: ResourceLimits;

  /** stdio configuration. @default "pipe" */
  stdio?: "pipe" | "inherit" | "ignore";
}

// ═══════════════════════════════════════════════════════════════════════════
// Resource limits
// ═══════════════════════════════════════════════════════════════════════════

export interface ResourceLimits {
  /** Memory limit. Examples: "150M", "1G", "512M". @default "200M" */
  memoryMax: string;

  /** CPU quota as percentage. Examples: "30%", "100%". @default "50%" */
  cpuQuota: string;

  /** Max child processes/threads. @default 64 */
  tasksMax: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Jailed process handle
// ═══════════════════════════════════════════════════════════════════════════

export interface JailedProcess {
  /** The underlying Node.js ChildProcess */
  process: ChildProcess;
  /** Process ID (undefined if process hasn't started yet) */
  pid: number | undefined;
  /** Kill the process */
  kill: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditEntry {
  timestamp: string;
  kind: "config_lock" | "spawn" | "permission_jail" | "resource_limit";
  details: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Config guard
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfigGuardOptions {
  /** Custom safe templates (key = filename). Overrides built-in defaults. */
  templates?: Record<string, string>;
  /** Additional files to treat as locked (empty content — just prevent writes) */
  extraLockedFiles?: string[];
  /** Audit callback */
  onAudit?: (entry: AuditEntry) => void;
  /** Optional tracer for span-level observability of lock/check operations */
  tracer?: import("./tracer.js").Tracer;
}

export interface ConfigTemplate {
  /** The filename to write (e.g. "vite.config.ts") */
  canonical: string;
  /** Alternative filenames that could shadow the canonical (deleted on lock) */
  variants: string[];
  /** Safe file content */
  content: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Process jail (Node.js Permission Model)
// ═══════════════════════════════════════════════════════════════════════════

export interface JailOptions {
  /** Root directory to jail filesystem access to */
  jail: string;
  /** Extra directories with read-only access */
  readOnlyPaths?: string[];
  /** Allow spawning child processes. @default false */
  allowChildProcess?: boolean;
  /** Allow Worker threads (needed for esbuild/SWC). @default true */
  allowWorkers?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Resource limiter backend
// ═══════════════════════════════════════════════════════════════════════════

export interface WrapResult {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exec (jailed command execution)
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecOptions {
  /** Working directory for the command */
  cwd: string;

  /**
   * Restrict filesystem access to this directory.
   * Linux: uses systemd ProtectSystem + ReadWritePaths (real OS-level jail).
   * Windows: Job Objects for resources; filesystem is best-effort.
   */
  jail: string;

  /** Environment variables for the command */
  env?: Record<string, string>;

  /** Kill the command after this many milliseconds. @default 30000 */
  timeout?: number;

  /** Override resource limits for this exec */
  resourceLimits?: ResourceLimits;

  /** Block outbound network access. @default true */
  blockNetwork?: boolean;
}

export interface ExecResult {
  /** Exit code (null if killed by signal) */
  exitCode: number | null;

  /** Captured stdout */
  stdout: string;

  /** Captured stderr */
  stderr: string;

  /** Whether the process was killed (timeout, OOM, signal) */
  killed: boolean;

  /** Kill signal if process was killed */
  signal?: string;
}
