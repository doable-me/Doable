import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Windows resource limits via V8 heap size cap.
 *
 * Uses --max-old-space-size in NODE_OPTIONS to limit the V8 JavaScript heap.
 * This is best-effort:
 *   - Limits JS heap, not total process memory (native addons can allocate more)
 *   - CPU and task limits are not enforced (no cgroup equivalent on Windows)
 *   - No network isolation
 *
 * For full Windows isolation, consider using docore's Job Object backend
 * or running inside WSL2 with the systemd backend.
 *
 * Zero overhead — V8 checks heap size on GC, not per-allocation.
 */
export class WindowsHeapBackend implements ResourceBackend {
  readonly name = "win-heap";
  readonly priority = 40;
  readonly description = "Windows V8 heap limit via --max-old-space-size (best-effort)";

  available(): boolean {
    return process.platform === "win32";
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    const memoryMb = parseMemoryToMb(options.limits.memoryMax);
    const existing = process.env.NODE_OPTIONS ?? "";
    const nodeOptions = `${existing} --max-old-space-size=${memoryMb}`.trim();

    return {
      command,
      args,
      env: { NODE_OPTIONS: nodeOptions },
    };
  }
}

function parseMemoryToMb(value: string): number {
  const match = value.match(/^(\d+)\s*(M|G|K)?$/i);
  if (!match) return 200;
  const num = parseInt(match[1]!, 10);
  const unit = (match[2] ?? "M").toUpperCase();
  switch (unit) {
    case "G": return num * 1024;
    case "K": return Math.max(1, Math.round(num / 1024));
    default: return num;
  }
}
