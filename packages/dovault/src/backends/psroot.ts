import { execSync } from "node:child_process";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Psroot — Windows AppContainer + Job Objects via the local Psroot CLI.
 *
 * Per devframeworkPRD/11-cross-platform-sandbox.md §4.1. Provides:
 *   - AppContainer  — kernel-enforced FS + registry + named-object isolation
 *   - Job Objects   — memory cap, CPU rate, max-procs, kill-on-close
 *   - Network mode  — none | outbound | full (gates outbound traffic)
 *
 * No VT-x. No admin (Standard tier). Replaces today's Job-Objects-only
 * `WindowsBackend` as the preferred Windows backend; the older one remains
 * as a fallback when `psroot.exe` is not on PATH.
 *
 * Bundling: Doable should ship `psroot.exe` in a vendored location and
 * prepend that path to PATH. See PRD 11 §8.
 */
export class PsrootBackend implements ResourceBackend {
  readonly name = "psroot";
  readonly description = "Windows AppContainer + Job Objects (Psroot CLI)";
  /**
   * Priority 70 — slightly above the older Job-Objects-only WindowsBackend
   * (priority 60) so auto-detection prefers the AppContainer-backed path
   * when psroot.exe is present.
   */
  readonly priority = 70;

  available(): boolean {
    if (process.platform !== "win32") return false;
    try {
      execSync("where psroot.exe", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    const psrootArgs = [
      "spawn",
      "--memory", options.limits.memoryMax ?? "512M",
      "--cpu-rate", String(parseCpuQuota(options.limits.cpuQuota ?? "50%")),
      "--max-procs", String(options.limits.tasksMax ?? 256),
      "--network", options.blockNetwork ? "none" : "outbound",
      "--",
      command,
      ...args,
    ];
    return { command: "psroot.exe", args: psrootArgs };
  }

  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    const psrootArgs = [
      "spawn",
      "--memory", options.limits.memoryMax ?? "512M",
      "--cpu-rate", String(parseCpuQuota(options.limits.cpuQuota ?? "50%")),
      "--max-procs", String(options.limits.tasksMax ?? 256),
      "--network", options.blockNetwork ? "none" : "outbound",
      // AppContainer FS isolation — only the workdir + jail are writable.
      "--rw", options.jail,
      "--workdir", options.jail,
      "--",
      command,
      ...args,
    ];
    return { command: "psroot.exe", args: psrootArgs };
  }
}

/**
 * Parse "50%" -> 50 (as integer percentage). Psroot's --cpu-rate takes
 * a 0-100 integer, mirroring Job Object CPU rate control. Strips trailing
 * "%" if present; returns 50 on parse failure to avoid NaN.
 */
function parseCpuQuota(quota: string): number {
  const n = parseInt(quota.replace(/%$/, ""), 10);
  return Number.isFinite(n) ? n : 50;
}
