import {
  spawn as nodeSpawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type { ResourceLimits, ExecResult } from "./types.js";
import type { ResourceBackend } from "./backends/types.js";
import { SystemdBackend } from "./backends/systemd.js";
import { BubblewrapBackend } from "./backends/bubblewrap.js";
import { WindowsBackend } from "./backends/windows.js";
import { PsrootBackend } from "./backends/psroot.js";
import { SandboxExecBackend } from "./backends/sandbox-exec.js";
import { AppleContainerBackend } from "./backends/apple-container.js";
import { GvisorBackend } from "./backends/gvisor.js";
import { WindowsHeapBackend } from "./backends/win-heap.js";
import { DirectBackend } from "./backends/direct.js";

/**
 * Spawns processes with OS-level resource limits.
 *
 * Auto-detects the best available backend:
 *   Linux:   systemd-run (cgroups + network policy)
 *   Windows: V8 heap limit (best-effort)
 *   Other:   direct spawn (no limits)
 *
 * Custom backends can be registered for nsjail, Firecracker, etc.
 */
export class ResourceLimiter {
  readonly backend: ResourceBackend;

  constructor(backend?: ResourceBackend | string) {
    if (typeof backend === "object") {
      this.backend = backend;
    } else {
      this.backend = detectBackend(backend);
    }
  }

  /**
   * Spawn a process with resource limits applied.
   *
   * The backend wraps the command with platform-specific mechanisms:
   *   systemd: systemd-run --scope -p MemoryMax=... -p IPAddressDeny=any -- <cmd>
   *   win-heap: NODE_OPTIONS="--max-old-space-size=..." <cmd>
   *   direct: <cmd> (no wrapping)
   */
  spawn(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: Record<string, string>;
      limits?: ResourceLimits;
      stdio?: SpawnOptions["stdio"];
      blockNetwork?: boolean;
    },
  ): ChildProcess {
    const defaults: ResourceLimits = {
      memoryMax: "200M",
      cpuQuota: "50%",
      tasksMax: 64,
    };

    const wrapped = this.backend.wrapSpawn(command, args, {
      limits: options.limits ?? defaults,
      blockNetwork: options.blockNetwork ?? true,
    });

    return nodeSpawn(wrapped.command, wrapped.args, {
      cwd: options.cwd,
      // SECURITY: Use only the caller-provided env + backend env.
      // Never spread process.env — the caller is responsible for building
      // a safe env (see services/api/src/projects/safe-env.ts).
      env: { ...options.env, ...wrapped.env },
      stdio: options.stdio ?? "pipe",
      // On Windows, bare commands like "npx" need shell:true to resolve .cmd/.bat extensions.
      shell: process.platform === "win32" && !wrapped.command.includes("/") && !wrapped.command.includes("\\"),
    });
  }

  /**
   * Execute a command inside an OS-level jail and return its output.
   *
   * Uses the backend's wrapExec (filesystem isolation + resource limits)
   * if available, otherwise falls back to wrapSpawn (resources only).
   *
   *   Linux:   systemd-run with ProtectSystem=strict, ReadWritePaths=<jail>
   *   Windows: Job Object (resources) — no kernel FS jail
   *   macOS:   direct (no isolation)
   */
  exec(
    command: string,
    args: string[],
    options: {
      cwd: string;
      jail: string;
      env?: Record<string, string>;
      limits?: ResourceLimits;
      blockNetwork?: boolean;
      timeout?: number;
    },
  ): Promise<ExecResult> {
    const defaults: ResourceLimits = {
      memoryMax: "200M",
      cpuQuota: "50%",
      tasksMax: 64,
    };

    const limits = options.limits ?? defaults;
    const blockNetwork = options.blockNetwork ?? true;
    const timeout = options.timeout ?? 30_000;

    // Use wrapExec if the backend supports it, otherwise fall back to wrapSpawn
    const wrapped = this.backend.wrapExec
      ? this.backend.wrapExec(command, args, { limits, blockNetwork, jail: options.jail })
      : this.backend.wrapSpawn(command, args, { limits, blockNetwork });

    return new Promise<ExecResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const child = nodeSpawn(wrapped.command, wrapped.args, {
        cwd: options.cwd,
        env: { ...options.env, ...wrapped.env },
        stdio: "pipe",
        shell: process.platform === "win32",
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeout);

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
        // Cap output at 1MB to prevent memory exhaustion
        if (stdout.length > 1_048_576) {
          killed = true;
          child.kill("SIGKILL");
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 1_048_576) {
          killed = true;
          child.kill("SIGKILL");
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout,
          stderr: stderr || err.message,
          killed: false,
        });
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 50_000),
          killed,
          signal: signal ?? undefined,
        });
      });
    });
  }
}

/**
 * Auto-detect the best available resource limiter backend.
 * Sorted by priority — higher priority backends are preferred.
 */
function detectBackend(preferred?: string): ResourceBackend {
  const backends: ResourceBackend[] = [
    new SystemdBackend(),       // linux, prio 80
    new PsrootBackend(),        // win32, prio 70  (replaces WindowsBackend when psroot.exe is on PATH)
    new BubblewrapBackend(),    // linux, prio 65  (fallback when systemd cgroup delegation absent)
    new WindowsBackend(),       // win32, prio 60  (Job Objects only; FS jail-less fallback)
    new SandboxExecBackend(),   // darwin, prio 50 (replaces direct.ts on macOS; was no isolation)
    new AppleContainerBackend(),// darwin, prio 45 (opt-in; macOS 15+ Apple Silicon, DOVAULT_PROFILE=hardened)
    new WindowsHeapBackend(),   // win32, prio 40
    new GvisorBackend(),        // linux, prio 40  (opt-in; DOVAULT_PROFILE=hardened or DOVAULT_BACKEND=gvisor)
    new DirectBackend(),        // any,    prio 0
  ];

  // Explicit backend requested
  if (preferred && preferred !== "auto") {
    const found = backends.find((b) => b.name === preferred);
    if (found && found.available()) return found;
    if (found) {
      console.warn(
        `[dovault] Backend "${preferred}" found but not available on this platform, falling back`,
      );
    } else {
      console.warn(
        `[dovault] Backend "${preferred}" not found, falling back to auto-detection`,
      );
    }
  }

  // Auto-detect: highest priority available backend
  backends.sort((a, b) => b.priority - a.priority);
  for (const b of backends) {
    if (b.available()) return b;
  }

  // DirectBackend.available() always returns true, so we never reach here
  return new DirectBackend();
}
