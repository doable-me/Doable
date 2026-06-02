import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * System directories the sandbox needs read-only. Bound only when present so we
 * work across layouts: usrmerge distros (Ubuntu/Debian: /bin and /sbin are
 * symlinks into /usr — they MUST be bound or `/bin/sh` won't resolve inside the
 * namespace), split-/usr systems, and minimal ones lacking /lib64 or /sbin.
 */
const SYSTEM_RO_DIRS = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/etc"] as const;

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
 *   - prlimit RLIMIT_NPROC for tasksMax (fork-bomb guard)
 *   - Memory is NOT capped here: RLIMIT_AS breaks Node/V8 (it reserves huge
 *     virtual address space, so any sane --as aborts the build with OOM). RSS
 *     capping needs cgroups — use the systemd backend (MemoryMax) for that.
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

  /** Memoised capability probe — see available(). */
  private _available?: boolean;

  available(): boolean {
    if (this._available !== undefined) return this._available;
    if (process.platform !== "linux") return (this._available = false);
    try {
      execSync("which bwrap", { stdio: "ignore" });
    } catch {
      return (this._available = false);
    }
    // The binary existing is not sufficient: unprivileged user namespaces may be
    // disabled (kernel.unprivileged_userns_clone=0, seccomp/AppArmor policy, or
    // inside a restrictive container) — bwrap would then fail at runtime on every
    // command. Probe the REAL capability by actually creating the namespaces and
    // running `true` through the exact mount shape we use, so detectBackend()
    // can fall through to `direct` when bwrap can't work here.
    try {
      const args = [...this.baseSandboxArgs(), "/bin/sh", "-c", "true"];
      execSync(`bwrap ${args.map(quote).join(" ")}`, { stdio: "ignore", timeout: 5000 });
      return (this._available = true);
    } catch {
      return (this._available = false);
    }
  }

  /** Read-only system binds (existence-guarded) + namespace flags shared by the
   *  capability probe and the real wrap. Excludes the jail bind and net toggle. */
  private baseSandboxArgs(): string[] {
    const args: string[] = [];
    for (const dir of SYSTEM_RO_DIRS) {
      if (existsSync(dir)) args.push("--ro-bind", dir, dir);
    }
    args.push(
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-uts",
      "--unshare-ipc",
      "--die-with-parent",
      "--new-session",
    );
    return args;
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    // CONTRACT: wrapSpawn is "resource limits only, NO filesystem jail" (see
    // ResourceBackend). The systemd backend honours this — it applies cgroup
    // caps WITHOUT a mount namespace, so the process keeps full filesystem
    // access. Builds depend on that: `npx vite build` needs to see the project
    // directory (its cwd) AND the npm/npx cache under $HOME. A bubblewrap mount
    // namespace here would expose neither (only the dirs we bind), so the build
    // fails with "Cannot resolve entry module index.html" / npx cache misses.
    //
    // So wrapSpawn provides best-effort resource caps (prlimit fork-bomb guard)
    // and leaves the filesystem alone. The real namespace jail lives in
    // wrapExec, which binds an explicit jail path for untrusted execs.
    const tasksMax = options.limits.tasksMax ?? 256;
    const env: Record<string, string> = {};
    if (options.blockNetwork) {
      // No mount/net namespace here, so poison proxy env as a best-effort
      // outbound-network deterrent for HTTP clients that honour it.
      env.HTTP_PROXY = "http://0.0.0.0:1";
      env.HTTPS_PROXY = "http://0.0.0.0:1";
      env.http_proxy = "http://0.0.0.0:1";
      env.https_proxy = "http://0.0.0.0:1";
      env.NO_PROXY = "localhost,127.0.0.1,::1";
      env.no_proxy = "localhost,127.0.0.1,::1";
    }
    return { command: "prlimit", args: [`--nproc=${tasksMax}`, "--", command, ...args], env };
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
    const bwrapArgs: string[] = this.baseSandboxArgs();

    if (options.blockNetwork) bwrapArgs.push("--unshare-net");

    if (jail) {
      bwrapArgs.push("--bind", jail, jail);
      bwrapArgs.push("--chdir", jail);
    }

    // prlimit wrapper for a fork-bomb guard (process/thread count).
    //
    // Deliberately NO `--as` (RLIMIT_AS / virtual address space): Node/V8 RESERVES
    // a large virtual address space (the pointer-compression cage, code range,
    // etc.) far beyond its real RSS, so ANY sane --as value — even 1G — makes V8
    // configure a tiny heap and abort immediately with "FATAL ERROR: JavaScript
    // heap out of memory" before the build does any work. RLIMIT_AS is simply the
    // wrong tool for Node. Real memory capping by RSS needs cgroups, which the
    // systemd backend provides (MemoryMax); in this namespaces-only fallback we
    // rely on namespace isolation + the task-count cap and leave RSS uncapped.
    const tasksMax = options.limits.tasksMax ?? 256;
    const prlimitedCmd = `prlimit --nproc=${tasksMax} -- ${command} ${args.map(quote).join(" ")}`;

    bwrapArgs.push("/bin/sh", "-c", prlimitedCmd);

    return { command: "bwrap", args: bwrapArgs };
  }
}

function quote(s: string): string {
  return /^[A-Za-z0-9_=:./@-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}
