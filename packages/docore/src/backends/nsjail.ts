/**
 * nsjail isolation backend.
 *
 * Full namespace + cgroup + seccomp isolation on Linux.
 * Requires the nsjail binary (apt install nsjail or build from source).
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./types.js";

export interface NsjailConfig extends BackendConfig {
  nsjailPath?: string;
  keepNetworkAccess?: boolean;
  extraReadOnlyMounts?: string[];
}

export class NsjailBackend implements IsolationBackend {
  readonly name = "nsjail";
  readonly description = "Full namespace + cgroup + seccomp isolation (Linux)";
  readonly priority = 100;

  available(): boolean {
    if (process.platform !== "linux") return false;
    try {
      execSync("nsjail --help", { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  spawn(ctx: SpawnContext, limits: ResourceLimits, config: BackendConfig): ChildProcess {
    const cfg = config as NsjailConfig;
    const nsjail = cfg.nsjailPath ?? "nsjail";
    const isJs = ctx.cliPath.endsWith(".js");
    const executable = isJs ? process.execPath : ctx.cliPath;

    const memBytes = parseMemoryLimit(limits.memoryMax);
    const cpuMs = parseCpuQuota(limits.cpuQuota);

    const args: string[] = [
      "--mode", "o",
      "--keep_env",
      "--really_quiet",
      "--user", "65534",
      "--group", "65534",
      "--cgroup_mem_max", memBytes.toString(),
      "--cgroup_pids_max", limits.tasksMax.toString(),
      "--cgroup_cpu_ms_per_sec", cpuMs.toString(),
      "--rlimit_fsize", Math.ceil(limits.maxFileSize / (1024 * 1024)).toString(),
      "--disable_clone_newcgroup",
      ...(cfg.keepNetworkAccess ? ["--disable_clone_newnet"] : []),
      ...(limits.timeLimitSec > 0 ? ["--time_limit", limits.timeLimitSec.toString()] : []),
      "-R", "/usr",
      "-R", "/lib",
      "-R", "/lib64",
      "-R", "/bin",
      "-R", "/sbin",
      "-R", "/etc/resolv.conf",
      "-R", "/etc/hosts",
      "-R", "/etc/ssl",
      "-R", "/etc/ca-certificates",
      "-R", process.execPath,
      "-T", "/tmp",
      "-R", "/dev/null",
      "-R", "/dev/urandom",
      "-R", "/dev/zero",
      "--proc_path", "/proc",
    ];

    if (isJs) {
      const cliDir = path.dirname(ctx.cliPath);
      args.push("-R", cliDir);
      const nodeModules = findAncestorNodeModules(ctx.cliPath);
      if (nodeModules && nodeModules !== cliDir) {
        args.push("-R", nodeModules);
      }
    } else {
      args.push("-R", ctx.cliPath);
    }

    for (const mount of cfg.extraReadOnlyMounts ?? []) {
      args.push("-R", mount);
    }

    args.push("-B", ctx.cwd);
    args.push("--cwd", ctx.cwd);

    args.push("--", executable);
    if (isJs) args.push(ctx.cliPath);
    args.push(
      "--headless",
      "--no-auto-update",
      "--log-level", ctx.logLevel,
      "--port", ctx.port.toString(),
      "--auth-token-env", ctx.tokenEnvVar,
    );

    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: ctx.cwd,
      NODE_ENV: "production",
      [ctx.tokenEnvVar]: ctx.token,
      ...ctx.env,
    };

    return spawn(nsjail, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)\s*([KMGT]?)B?$/i);
  if (!match) return 200 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  switch ((match[2] || "").toUpperCase()) {
    case "K": return num * 1024;
    case "M": return num * 1024 * 1024;
    case "G": return num * 1024 * 1024 * 1024;
    case "T": return num * 1024 * 1024 * 1024 * 1024;
    default: return num;
  }
}

function parseCpuQuota(quota: string): number {
  const match = quota.match(/^(\d+)%$/);
  if (!match) return 500;
  return parseInt(match[1], 10) * 10;
}

function findAncestorNodeModules(filePath: string): string | null {
  let dir = path.dirname(filePath);
  for (let i = 0; i < 10; i++) {
    if (dir === path.dirname(dir)) break;
    if (dir.includes("node_modules")) {
      const parts = dir.split(path.sep);
      const nmIdx = parts.lastIndexOf("node_modules");
      return parts.slice(0, nmIdx + 1).join(path.sep);
    }
    dir = path.dirname(dir);
  }
  return null;
}
