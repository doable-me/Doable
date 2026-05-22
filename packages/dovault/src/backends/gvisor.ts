import { execSync } from "node:child_process";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * gVisor — Linux user-space syscall interception via `runsc`.
 *
 * Per devframeworkPRD/11-cross-platform-sandbox.md §4.5. Wraps `runsc do`
 * to provide a strong syscall filter without requiring KVM or root
 * privileges. Useful when the host has hostile-tenant concerns that go
 * beyond what cgroups + namespaces can offer.
 *
 * Opt-in only. Activated when:
 *   - process.platform === "linux"
 *   - DOVAULT_PROFILE === "hardened"  OR  DOVAULT_BACKEND === "gvisor"
 *   - `which runsc` resolves
 *
 * Priority 40 — opt-in tier, below systemd (80) and bubblewrap (65) so
 * the standard auto-detect path keeps using cgroup-backed isolation.
 *
 * Caveats:
 *   - `runsc do` runs without an OCI bundle, so resource caps from
 *     ResourceLimits are not threaded through here; rely on outer
 *     enforcement (systemd-run scoping, cgroup parent, etc.) when
 *     stacking this backend.
 *   - wrapSpawn uses `/` as the implicit rootfs (no FS jail); only
 *     wrapExec mounts a per-job rootfs via --rootfs.
 */
export class GvisorBackend implements ResourceBackend {
  readonly name = "gvisor";
  readonly description = "Linux user-space syscall interception (runsc)";
  readonly priority = 40;

  available(): boolean {
    if (process.platform !== "linux") return false;
    if (
      process.env.DOVAULT_PROFILE !== "hardened" &&
      process.env.DOVAULT_BACKEND !== "gvisor"
    ) {
      return false;
    }
    try {
      execSync("which runsc", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  wrapSpawn(
    command: string,
    args: string[],
    _options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    return {
      command: "runsc",
      args: ["do", "--", command, ...args],
    };
  }

  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    return {
      command: "runsc",
      args: ["do", "--rootfs", options.jail, "--", command, ...args],
    };
  }
}
