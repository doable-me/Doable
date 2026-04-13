import {
  spawn as nodeSpawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { ResourceLimits } from "./types.js";
import type { ResourceBackend } from "./backends/types.js";
import { SystemdBackend } from "./backends/systemd.js";
import { WindowsBackend } from "./backends/windows.js";
import { WindowsHeapBackend } from "./backends/win-heap.js";
import { DirectBackend } from "./backends/direct.js";

/**
 * Spawns processes with OS-level resource limits.
 *
 * Auto-detects the best available backend:
 *   Linux:   systemd-run (cgroups + network policy)
 *   Windows: V8 heap limit (best-effort)
 *   Other:   direct spawn (no limits)
 *
 * Custom backends can be registered for nsjail, Firecracker, etc.
 */
export class ResourceLimiter {
  readonly backend: ResourceBackend;

  constructor(backend?: ResourceBackend | string) {
    if (typeof backend === "object") {
      this.backend = backend;
    } else {
      this.backend = detectBackend(backend);
    }
  }

  /**
   * Spawn a process with resource limits applied.
   *
   * The backend wraps the command with platform-specific mechanisms:
   *   systemd: systemd-run --scope -p MemoryMax=... -p IPAddressDeny=any -- <cmd>
   *   win-heap: NODE_OPTIONS="--max-old-space-size=..." <cmd>
   *   direct: <cmd> (no wrapping)
   */
  spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: Record<string, string>;
      limits?: ResourceLimits;
      stdio?: SpawnOptions["stdio"];
      blockNetwork?: boolean;
    },
  ): ChildProcess {
    const defaults: ResourceLimits = {
      memoryMax: "200M",
      cpuQuota: "50%",
      tasksMax: 64,
    };

    const wrapped = this.backend.wrapSpawn(command, args, {
      limits: options.limits ?? defaults,
      blockNetwork: options.blockNetwork ?? true,
    });

    return nodeSpawn(wrapped.command, wrapped.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, ...wrapped.env },
      stdio: options.stdio ?? "pipe",
    });
  }
}

/**
 * Auto-detect the best available resource limiter backend.
 * Sorted by priority — higher priority backends are preferred.
 */
function detectBackend(preferred?: string): ResourceBackend {
  const backends: ResourceBackend[] = [
    new SystemdBackend(),
    new WindowsBackend(),
    new WindowsHeapBackend(),
    new DirectBackend(),
  ];

  // Explicit backend requested
  if (preferred && preferred !== "auto") {
    const found = backends.find((b) => b.name === preferred);
    if (found && found.available()) return found;
    if (found) {
      console.warn(
        `[dovault] Backend "${preferred}" found but not available on this platform, falling back`,
      );
    } else {
      console.warn(
        `[dovault] Backend "${preferred}" not found, falling back to auto-detection`,
      );
    }
  }

  // Auto-detect: highest priority available backend
  backends.sort((a, b) => b.priority - a.priority);
  for (const b of backends) {
    if (b.available()) return b;
  }

  // DirectBackend.available() always returns true, so we never reach here
  return new DirectBackend();
}
