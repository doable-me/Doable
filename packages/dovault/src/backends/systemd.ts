import { execSync } from "node:child_process";
import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Linux resource limits via systemd-run --scope.
 *
 * Creates a transient systemd scope unit with cgroup v2 limits:
 *   - MemoryMax: hard memory ceiling (OOM-killed if exceeded)
 *   - CPUQuota: CPU time percentage cap
 *   - TasksMax: max processes + threads (blocks fork bombs)
 *   - IPAddressDeny/Allow: network policy (blocks exfiltration)
 *
 * Zero overhead — cgroup limits are enforced by the kernel, not by polling.
 * Works for unprivileged users on Ubuntu 22.04+ with cgroup delegation.
 */
export class SystemdBackend implements ResourceBackend {
  readonly name = "systemd";
  readonly priority = 80;
  readonly description = "Linux cgroup limits via systemd-run (memory, CPU, tasks, network)";

  available(): boolean {
    if (process.platform !== "linux") return false;
    try {
      execSync("systemd-run --version", { stdio: "pipe", timeout: 5000 });
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
    const { limits, blockNetwork } = options;
    const sysArgs: string[] = ["--scope", "--quiet"];

    // Resource caps
    if (limits.memoryMax) {
      sysArgs.push("-p", `MemoryMax=${limits.memoryMax}`);
    }
    if (limits.cpuQuota) {
      sysArgs.push("-p", `CPUQuota=${limits.cpuQuota}`);
    }
    if (limits.tasksMax) {
      sysArgs.push("-p", `TasksMax=${limits.tasksMax}`);
    }

    // Network isolation: block all outbound except localhost.
    // IPAddressDeny/Allow use BPF on cgroup v2 — zero runtime cost.
    if (blockNetwork !== false) {
      sysArgs.push("-p", "IPAddressDeny=any");
      sysArgs.push("-p", "IPAddressAllow=localhost");
    }

    // The actual command follows the systemd-run flags
    // Also apply proxy poisoning as defense-in-depth — catches HTTP libs
    // that might bypass IPAddressDeny (e.g. if cgroup v2 is not available).
    const env: Record<string, string> = {};
    if (blockNetwork !== false) {
      env.HTTP_PROXY = "http://0.0.0.0:1";
      env.HTTPS_PROXY = "http://0.0.0.0:1";
      env.http_proxy = "http://0.0.0.0:1";
      env.https_proxy = "http://0.0.0.0:1";
      env.NO_PROXY = "localhost,127.0.0.1,::1";
      env.no_proxy = "localhost,127.0.0.1,::1";
    }

    return {
      command: "systemd-run",
      args: [...sysArgs, "--", command, ...args],
      env,
    };
  }
}
