/**
 * Direct spawn backend (no isolation).
 *
 * Spawns the CLI process with no OS-level isolation at all.
 * Useful for local development or when running on macOS where
 * neither nsjail nor systemd nor Job Objects are available.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./types.js";

export class DirectBackend implements IsolationBackend {
  readonly name = "none";
  readonly description = "No isolation (direct spawn)";
  readonly priority = 0;

  available(): boolean {
    return true; // always available as last resort
  }

  spawn(ctx: SpawnContext, _limits: ResourceLimits, _config: BackendConfig): ChildProcess {
    const isJs = ctx.cliPath.endsWith(".js");
    const args = [
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

    return spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ctx.cwd,
      env,
      windowsHide: true,
    });
  }
}
