/**
 * systemd-run isolation backend.
 *
 * Uses cgroup v2 limits via systemd-run --scope. Provides resource
 * isolation (memory, CPU, task count, IO weight) but no mount/PID/network
 * namespace isolation. Linux only.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./types.js";

export interface SystemdConfig extends BackendConfig {
  userMode?: boolean;
}

export class SystemdBackend implements IsolationBackend {
  readonly name = "systemd";
  readonly description = "Cgroup resource limits via systemd-run (Linux)";
  readonly priority = 80;

  available(): boolean {
    if (process.platform !== "linux") return false;
    try {
      execSync("systemd-run --version", { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  spawn(ctx: SpawnContext, limits: ResourceLimits, config: BackendConfig): ChildProcess {
    const cfg = config as SystemdConfig;
    const userMode = cfg.userMode !== false;
    const unitName = `docore-user-${sanitizeUnitName(ctx.userId)}`;

    const systemdArgs = [
      ...(userMode ? ["--user"] : []),
      "--scope",
      `--unit=${unitName}`,
      `--property=MemoryMax=${limits.memoryMax}`,
      `--property=CPUQuota=${limits.cpuQuota}`,
      `--property=TasksMax=${limits.tasksMax}`,
      `--property=IOWeight=${limits.ioWeight}`,
      "--",
    ];

    const isJs = ctx.cliPath.endsWith(".js");
    const cliArgs = [
      ...(isJs ? [ctx.cliPath] : []),
      "--headless",
      "--no-auto-update",
      "--log-level", ctx.logLevel,
      "--port", ctx.port.toString(),
      "--auth-token-env", ctx.tokenEnvVar,
    ];

    const executable = isJs ? process.execPath : ctx.cliPath;

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...ctx.env,
      [ctx.tokenEnvVar]: ctx.token,
      NODE_DEBUG: "",
    };

    return spawn("systemd-run", [...systemdArgs, executable, ...cliArgs], {
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
