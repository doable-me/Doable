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
   * Built-in: systemd=80, win-heap=40, direct=0
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
}
