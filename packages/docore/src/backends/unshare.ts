/**
 * unshare + systemd-run isolation backend.
 *
 * Combines Linux namespace isolation (PID, mount, IPC) with cgroup v2
 * resource limits. Provides near-nsjail-level isolation using only
 * tools that ship with every Linux distro — no extra packages needed.
 *
 * Isolation layers:
 *   1. PID namespace   — process cannot see or signal host processes
 *   2. Mount namespace — process gets private mount table, private /proc
 *   3. IPC namespace   — process cannot access host shared memory / semaphores
 *   4. UTS namespace   — process cannot change the system hostname
 *   5. Cgroup limits   — memory, CPU, tasks, IO (via systemd-run)
 *   6. /proc remount   — fresh /proc inside PID namespace (hides host PIDs)
 *
 * Security notes:
 *   - Mount namespace + private /proc blocks access to other processes'
 *     environ, fd, and other host process info (equivalent to seccomp
 *     blocking ptrace and process_vm_readv).
 *   - PID namespace prevents signalling host processes (kill, ptrace).
 *   - IPC namespace prevents SysV shared memory attacks.
 *   - Cgroup limits prevent fork bombs, memory exhaustion, CPU hogging.
 *   - Combined with dovault's IPAddressDeny + Node.js permission model,
 *     this provides defense-in-depth comparable to nsjail for VPS setups.
 *
 * Requires: Linux with unshare(1) (util-linux, pre-installed) and systemd-run.
 * Priority 90: preferred over plain systemd (80) but below nsjail (100).
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./types.js";

export interface UnshareConfig extends BackendConfig {
  /** Run systemd-run in user mode (--user). @default true */
  userMode?: boolean;
  /** Also isolate the network namespace. @default false (systemd IPAddressDeny is used instead) */
  isolateNetwork?: boolean;
}

export class UnshareBackend implements IsolationBackend {
  readonly name = "unshare";
  readonly description = "PID/mount/IPC namespace isolation + cgroup limits (Linux)";
  readonly priority = 90;

  available(): boolean {
    if (process.platform !== "linux") return false;
    try {
      execSync("unshare --version", { stdio: "pipe", timeout: 5000 });
      execSync("systemd-run --version", { stdio: "pipe", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  spawn(ctx: SpawnContext, limits: ResourceLimits, config: BackendConfig): ChildProcess {
    const cfg = config as UnshareConfig;
    const userMode = cfg.userMode !== false;
    const unitName = `docore-user-${sanitizeUnitName(ctx.userId)}`;

    // ── systemd-run for cgroup resource limits ──
    const systemdArgs: string[] = [
      ...(userMode ? ["--user"] : []),
      "--scope",
      `--unit=${unitName}`,
      `--property=MemoryMax=${limits.memoryMax}`,
      `--property=CPUQuota=${limits.cpuQuota}`,
      `--property=TasksMax=${limits.tasksMax}`,
      `--property=IOWeight=${limits.ioWeight}`,
      "--",
    ];

    // ── unshare for namespace isolation ──
    const unshareArgs: string[] = [
      "--pid",          // PID namespace: can't see or signal host processes
      "--mount",        // Mount namespace: private mount table
      "--ipc",          // IPC namespace: can't access host shared memory
      "--uts",          // UTS namespace: can't change system hostname
      "--fork",         // Fork so child is PID 1 inside new namespace
      "--kill-child",   // Kill child when parent dies (clean teardown)
      "--mount-proc",   // Remount /proc inside PID namespace (hides host PIDs)
    ];

    if (cfg.isolateNetwork) {
      unshareArgs.push("--net"); // Network namespace (fully isolated)
    }

    // ── CLI arguments ──
    const isJs = ctx.cliPath.endsWith(".js");
    const executable = isJs ? process.execPath : ctx.cliPath;
    const cliArgs = [
      ...(isJs ? [ctx.cliPath] : []),
      "--headless",
      "--no-auto-update",
      "--log-level", ctx.logLevel,
      "--port", ctx.port.toString(),
      "--auth-token-env", ctx.tokenEnvVar,
    ];

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...ctx.env,
      [ctx.tokenEnvVar]: ctx.token,
      NODE_DEBUG: "",
    };

    // Final command:
    //   systemd-run --scope ... -- unshare --pid --mount --ipc --fork --kill-child --mount-proc -- <cli>
    return spawn("systemd-run", [
      ...systemdArgs,
      "unshare",
      ...unshareArgs,
      "--",
      executable,
      ...cliArgs,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ctx.cwd,
      env,
      windowsHide: true,
    });
  }
}

function sanitizeUnitName(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
