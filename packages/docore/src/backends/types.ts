/**
 * Isolation backend interface.
 *
 * Implement this to add a new isolation strategy. The ProcessIsolator
 * will call `available()` during auto-detection (highest priority first)
 * and `spawn()` when it picks your backend.
 */

import type { ChildProcess } from "node:child_process";

/** Shared context passed to every backend's spawn() */
export interface SpawnContext {
  userId: string;
  cliPath: string;
  token: string;
  cwd: string;
  port: number;
  tokenEnvVar: string;
  logLevel: string;
  env?: Record<string, string>;
}

/** Resource limits extracted from IsolatorOptions */
export interface ResourceLimits {
  memoryMax: string;
  cpuQuota: string;
  tasksMax: number;
  timeLimitSec: number;
  maxFileSize: number;
  ioWeight: number;
}

/** Per-backend configuration (opaque to the isolator) */
export type BackendConfig = Record<string, unknown>;

export interface IsolationBackend {
  /** Unique name for this backend (used in logs and option matching) */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /**
   * Priority for auto-detection. Higher = tried first.
   * Built-in priorities: nsjail=100, systemd=80, jobobject=60, direct=0
   */
  readonly priority: number;

  /**
   * Return true if this backend can run on the current system.
   * Called once during detection, result is cached.
   * Should be fast (< 5s). May shell out to check for binaries.
   */
  available(): boolean;

  /**
   * Spawn the CLI process with this backend's isolation flavor.
   * Returns the ChildProcess whose stdout the isolator will watch
   * for the "listening on port" message.
   */
  spawn(ctx: SpawnContext, limits: ResourceLimits, config: BackendConfig): ChildProcess;
}
