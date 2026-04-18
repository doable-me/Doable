import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Pluggable backend for OS-level resource limits.
 *
 * Each backend wraps a command with platform-specific mechanisms:
 *   - systemd: cgroup limits via systemd-run (Linux)
 *   - win-heap: V8 heap limit via --max-old-space-size (Windows)
 *   - direct: no limits (fallback)
 *
 * Custom backends can be registered for nsjail, Firecracker, etc.
 */
export interface ResourceBackend {
  /** Short identifier (e.g. "systemd", "win-heap", "direct") */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /**
   * Priority for auto-detection. Higher = preferred.
   * Built-in: systemd=80, windows=60, win-heap=40, direct=0
   */
  readonly priority: number;

  /** Check if this backend can run on the current platform */
  available(): boolean;

  /**
   * Wrap a command with resource-limiting mechanisms.
   * Returns the modified command, args, and extra env vars.
   */
  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult;

  /**
   * Wrap a command for jailed execution (filesystem isolation + resource limits).
   * Unlike wrapSpawn, this adds filesystem protection:
   *   - Linux: ProtectSystem=strict, ProtectHome=true, ReadWritePaths=<jail>
   *   - Windows: Job Objects (resources only; no kernel-level FS jail)
   *   - macOS/other: no isolation (falls back to wrapSpawn behavior)
   *
   * If not implemented, falls back to wrapSpawn (resources only, no FS jail).
   */
  wrapExec?(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult;
}
