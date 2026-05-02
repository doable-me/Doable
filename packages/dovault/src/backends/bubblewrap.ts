import { execSync } from "node:child_process";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Bubblewrap — Linux fallback when systemd cgroup delegation is unavailable.
 *
 * Per devframeworkPRD/11-cross-platform-sandbox.md §4.2. Provides:
 *   - Unprivileged user / mount / pid / uts / ipc namespaces
 *   - Optional --unshare-net (network deny toggle)
 *   - Read-only /usr, /lib, /lib64, /etc; bind --rw <jail>
 *   - --die-with-parent / --new-session for clean lifecycle
 *
 * Resource caps are best-effort (no native cgroups in bubblewrap):
 *   - prlimit RLIMIT_AS for memory ceiling (advisory)
 *   - prlimit RLIMIT_NPROC for tasksMax
 *   - CPU quota cannot be enforced without cgroups; documented limitation.
 *
 * Priority 65 — below `systemd` (80) so that when systemd cgroup delegation
 * is available we prefer real cgroups; above `direct` (0) so any Linux
 * host without systemd still gets a real FS namespace jail.
 */
export class BubblewrapBackend implements ResourceBackend {
  readonly name = "bubblewrap";
  readonly description = "Linux unprivileged namespaces (bwrap)";
  readonly priority = 65;

  available(): boolean {
    if (process.platform !== "linux") return false;
    try {
      execSync("which bwrap", { stdio: "ignore" });
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
    return this.buildWrapResult(command, args, options, /*jail*/ undefined);
  }

  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    return this.buildWrapResult(command, args, options, options.jail);
  }

  private buildWrapResult(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
    jail: string | undefined,
  ): WrapResult {
    const bwrapArgs: string[] = [
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/etc", "/etc",
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-uts",
      "--unshare-ipc",
      "--die-with-parent",
      "--new-session",
    ];

    if (options.blockNetwork) bwrapArgs.push("--unshare-net");

    if (jail) {
      bwrapArgs.push("--bind", jail, jail);
      bwrapArgs.push("--chdir", jail);
    }

    // prlimit wrapper for advisory memory + task caps.
    // bash -c so the shell expands prlimit's --as= without quoting trouble.
    const memoryBytes = parseMemory(options.limits.memoryMax ?? "512M");
    const tasksMax = options.limits.tasksMax ?? 256;
    const prlimitedCmd = `prlimit --as=${memoryBytes} --nproc=${tasksMax} -- ${command} ${args.map(quote).join(" ")}`;

    bwrapArgs.push("/bin/sh", "-c", prlimitedCmd);

    return { command: "bwrap", args: bwrapArgs };
  }
}

function parseMemory(spec: string): number {
  const m = spec.match(/^(\d+)\s*([KMG])?$/i);
  if (!m) return 512 * 1024 * 1024;
  const n = parseInt(m[1] ?? "0", 10);
  const unit = (m[2] ?? "M").toUpperCase();
  const mul = unit === "K" ? 1024 : unit === "G" ? 1024 ** 3 : 1024 ** 2;
  return n * mul;
}

function quote(s: string): string {
  return /^[A-Za-z0-9_=:./@-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
