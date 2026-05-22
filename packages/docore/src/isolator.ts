/**
 * docore process isolator
 *
 * Spawns Copilot CLI processes inside OS-level sandboxes for per-user
 * resource and security isolation without full containers.
 *
 * Uses a **pluggable backend registry**. Built-in backends (by priority):
 *   1. **nsjail** (100) - mount/PID/network namespaces + cgroups + seccomp (Linux)
 *   2. **systemd** (80) - cgroup limits via systemd-run (Linux)
 *   3. **jobobject** (60) - Win32 Job Objects for memory + process limits (Windows)
 *   4. **none** (0) - direct spawn, no isolation (always available)
 *
 * To add a custom backend:
 *
 *   import { ProcessIsolator } from "docore";
 *   import type { IsolationBackend } from "docore/backends";
 *
 *   class FirecrackerBackend implements IsolationBackend {
 *     name = "firecracker";
 *     description = "MicroVM isolation via Firecracker";
 *     priority = 150; // higher than nsjail, so it wins auto-detect
 *     available() { ... }
 *     spawn(ctx, limits, config) { ... }
 *   }
 *
 *   const isolator = new ProcessIsolator();
 *   isolator.register(new FirecrackerBackend());
 *
 * Architecture:
 *   UserManager -> ProcessIsolator.spawn(userId) -> backend.spawn() -> CLI --port N
 *                                                                        |
 *   DoCoreEngine <- cliUrl: "localhost:N" <------------------------------+
 */

import type { ChildProcess } from "node:child_process";
import * as path from "node:path";

import type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./backends/types.js";
import { NsjailBackend } from "./backends/nsjail.js";
import { UnshareBackend } from "./backends/unshare.js";
import { SystemdBackend } from "./backends/systemd.js";
import { JobObjectBackend } from "./backends/jobobject.js";
import { DirectBackend } from "./backends/direct.js";
import type { PolicyStore } from "./policy/store.js";

// Re-export backend types for consumers
export type { IsolationBackend, SpawnContext, ResourceLimits, BackendConfig } from "./backends/types.js";

// ============================================================================
// Configuration
// ============================================================================

export interface IsolatorOptions {
  /** Path to the Copilot CLI entry point. Auto-resolved from @github/copilot if not set. */
  cliPath?: string;

  /**
   * Backend selection.
   *   - A backend name string (e.g. "nsjail", "systemd", "jobobject", "none", or any custom name)
   *   - "auto" to pick the highest-priority available backend
   * @default "auto"
   */
  backend?: string;

  /** Memory limit per user process. @default "200M" */
  memoryMax?: string;

  /** CPU quota as percentage. @default "50%" */
  cpuQuota?: string;

  /** Max tasks (processes/threads) per user. @default 64 */
  tasksMax?: number;

  /** Wall-clock time limit in seconds. 0 = no limit. @default 0 */
  timeLimitSec?: number;

  /** Max file size a process can create (bytes). @default 50_000_000 */
  maxFileSize?: number;

  /** I/O weight (1-10000). @default 100 */
  ioWeight?: number;

  /** GitHub token env var name. @default "COPILOT_SDK_AUTH_TOKEN" */
  tokenEnvVar?: string;

  /** Additional environment variables for the CLI process. */
  env?: Record<string, string>;

  /** CLI log level. @default "warning" */
  logLevel?: string;

  /** Port range start. @default 10000 */
  portRangeStart?: number;

  /** Lifecycle event callback. */
  onEvent?: (event: IsolatorEvent) => void;

  /**
   * Opaque config bag passed to the backend's spawn().
   * Each backend defines its own config shape (NsjailConfig, SystemdConfig, etc.)
   */
  backendConfig?: BackendConfig;

  /**
   * PolicyStore for runtime-configurable resource limits.
   * When provided, spawn() reads effective limits per userId from the store
   * instead of using the static defaults from this options object.
   */
  policyStore?: PolicyStore;
}

export interface IsolatorEvent {
  type: "spawn" | "ready" | "exit" | "error" | "fallback" | "backend-selected";
  userId: string;
  port?: number;
  pid?: number;
  exitCode?: number | null;
  message?: string;
  backend?: string;
}

// ============================================================================
// Isolated process handle
// ============================================================================

export interface IsolatedProcess {
  port: number;
  cliUrl: string;
  process: ChildProcess;
  pid: number | undefined;
  kill: () => void;
}

// ============================================================================
// Process Isolator
// ============================================================================

export class ProcessIsolator {
  private opts: {
    memoryMax: string;
    cpuQuota: string;
    tasksMax: number;
    timeLimitSec: number;
    maxFileSize: number;
    ioWeight: number;
    tokenEnvVar: string;
    logLevel: string;
    portRangeStart: number;
  } & IsolatorOptions;

  private nextPort: number;
  private processes = new Map<string, IsolatedProcess>();
  private resolvedCliPath: string | null = null;
  private resolvedBackend: IsolationBackend | null = null;

  /** Registered backends, sorted by priority (highest first) */
  private backends: IsolationBackend[] = [];

  constructor(options: IsolatorOptions = {}) {
    this.opts = {
      memoryMax: "200M",
      cpuQuota: "50%",
      tasksMax: 64,
      timeLimitSec: 0,
      maxFileSize: 50_000_000,
      ioWeight: 100,
      tokenEnvVar: "COPILOT_SDK_AUTH_TOKEN",
      logLevel: "warning",
      portRangeStart: 10000,
      ...options,
    };
    this.nextPort = this.opts.portRangeStart;

    // Register built-in backends
    this.register(new NsjailBackend());
    this.register(new UnshareBackend());
    this.register(new SystemdBackend());
    this.register(new JobObjectBackend());
    this.register(new DirectBackend());
  }

  // --------------------------------------------------------------------------
  // Backend registry
  // --------------------------------------------------------------------------

  /**
   * Register a custom isolation backend.
   * If a backend with the same name exists, it is replaced.
   * Backends are tried in descending priority order during auto-detection.
   */
  register(backend: IsolationBackend): this {
    this.backends = this.backends.filter(b => b.name !== backend.name);
    this.backends.push(backend);
    this.backends.sort((a, b) => b.priority - a.priority);
    // Reset resolved backend so next spawn re-detects
    this.resolvedBackend = null;
    return this;
  }

  /** Unregister a backend by name. */
  unregister(name: string): this {
    this.backends = this.backends.filter(b => b.name !== name);
    this.resolvedBackend = null;
    return this;
  }

  /** List all registered backends (sorted by priority, highest first). */
  get registeredBackends(): ReadonlyArray<{ name: string; description: string; priority: number }> {
    return this.backends.map(b => ({ name: b.name, description: b.description, priority: b.priority }));
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  get activeCount(): number { return this.processes.size; }

  get backend(): string | null { return this.resolvedBackend?.name ?? null; }

  async spawn(userId: string, token: string, cwd: string): Promise<IsolatedProcess> {
    const existing = this.processes.get(userId);
    if (existing) return existing;

    const port = this.nextPort++;
    const cliPath = await this.getCliPath();
    const chosen = this.detectBackend();

    const emit = (type: IsolatorEvent["type"], extra?: Partial<IsolatorEvent>) => {
      this.opts.onEvent?.({ type, userId, port, backend: chosen.name, ...extra });
    };

    const ctx: SpawnContext = {
      userId,
      cliPath,
      token,
      cwd,
      port,
      tokenEnvVar: this.opts.tokenEnvVar,
      logLevel: this.opts.logLevel,
      env: this.opts.env,
    };

    // Build resource limits: PolicyStore (per-user effective) > static opts > defaults
    const limits: ResourceLimits = this.buildLimitsForUser(userId);

    if (chosen.name === "none") {
      emit("fallback", { message: "No isolation backend available; spawning directly" });
    }

    const child = chosen.spawn(ctx, limits, this.opts.backendConfig ?? {});
    emit("spawn", { pid: child.pid });

    const portReady = await this.waitForPort(child, port, userId);
    if (!portReady) {
      // On Windows SIGKILL is not a real signal; Node maps it to TerminateProcess
      child.kill(process.platform === "win32" ? "SIGTERM" : "SIGKILL");
      throw new Error(`CLI process for user ${userId} failed to start on port ${port} (backend: ${chosen.name})`);
    }

    emit("ready", { pid: child.pid });

    const isolated: IsolatedProcess = {
      port,
      cliUrl: `localhost:${port}`,
      process: child,
      pid: child.pid,
      kill: () => {
        child.kill("SIGTERM");
        const forceKill = setTimeout(() => {
          try { child.kill(process.platform === "win32" ? "SIGTERM" : "SIGKILL"); } catch { /* already dead */ }
        }, 5000);
        child.once("exit", () => clearTimeout(forceKill));
      },
    };

    this.processes.set(userId, isolated);

    child.once("exit", (code) => {
      this.processes.delete(userId);
      emit("exit", { pid: child.pid, exitCode: code });
    });

    child.on("error", (err) => {
      emit("error", { pid: child.pid, message: err.message });
    });

    return isolated;
  }

  async kill(userId: string): Promise<void> {
    const proc = this.processes.get(userId);
    if (!proc) return;
    proc.kill();
    await new Promise<void>((resolve) => {
      if (proc.process.exitCode !== null) {
        this.processes.delete(userId);
        resolve();
        return;
      }
      proc.process.once("exit", () => {
        this.processes.delete(userId);
        resolve();
      });
    });
  }

  async killAll(): Promise<void> {
    const kills = [...this.processes.keys()].map((id) => this.kill(id));
    await Promise.all(kills);
  }

  get(userId: string): IsolatedProcess | undefined {
    return this.processes.get(userId);
  }

  // --------------------------------------------------------------------------
  // PolicyStore-aware resource limits
  // --------------------------------------------------------------------------

  /**
   * Build resource limits for a user. If a PolicyStore was provided, it reads
   * the effective (global + user override) values. Otherwise falls back to
   * the static options passed at construction time.
   */
  private buildLimitsForUser(userId: string): ResourceLimits {
    const store = this.opts.policyStore;
    if (store) {
      return {
        memoryMax: store.getEffective(userId, "isolation.memory.max"),
        cpuQuota: store.getEffective(userId, "isolation.cpu.quota"),
        tasksMax: store.getEffective(userId, "isolation.tasks.max"),
        timeLimitSec: store.getEffective(userId, "isolation.time.limitSec"),
        maxFileSize: store.getEffective(userId, "isolation.files.maxSize"),
        ioWeight: store.getEffective(userId, "isolation.io.weight"),
      };
    }
    return {
      memoryMax: this.opts.memoryMax,
      cpuQuota: this.opts.cpuQuota,
      tasksMax: this.opts.tasksMax,
      timeLimitSec: this.opts.timeLimitSec,
      maxFileSize: this.opts.maxFileSize,
      ioWeight: this.opts.ioWeight,
    };
  }

  // --------------------------------------------------------------------------
  // Backend detection
  // --------------------------------------------------------------------------

  private detectBackend(): IsolationBackend {
    if (this.resolvedBackend) return this.resolvedBackend;

    const requested = this.opts.backend ?? "auto";

    if (requested !== "auto") {
      const match = this.backends.find(b => b.name === requested);
      if (!match) {
        throw new Error(
          `Unknown isolation backend "${requested}". ` +
          `Available: ${this.backends.map(b => b.name).join(", ")}`
        );
      }
      if (!match.available()) {
        throw new Error(
          `Isolation backend "${requested}" is not available on this system. ` +
          `Use backend: "auto" to fall back automatically.`
        );
      }
      this.resolvedBackend = match;
    } else {
      // Auto: pick the highest-priority available backend
      for (const b of this.backends) {
        if (b.available()) {
          this.resolvedBackend = b;
          break;
        }
      }
      if (!this.resolvedBackend) {
        throw new Error("No isolation backend available (not even DirectBackend). This should not happen.");
      }
    }

    this.opts.onEvent?.({
      type: "backend-selected",
      userId: "",
      backend: this.resolvedBackend.name,
      message: `Using isolation backend: ${this.resolvedBackend.name} (${this.resolvedBackend.description})`,
    });

    return this.resolvedBackend;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async waitForPort(child: ChildProcess, _expectedPort: number, _userId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let stdout = "";
      const timeout = setTimeout(() => {
        resolve(false);
      }, 30_000);

      const onData = (data: Buffer) => {
        stdout += data.toString();
        const match = stdout.match(/listening on port (\d+)/i);
        if (match) {
          clearTimeout(timeout);
          child.stdout?.off("data", onData);
          resolve(true);
        }
      };

      child.stdout?.on("data", onData);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve(false);
      });

      child.once("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async getCliPath(): Promise<string> {
    if (this.resolvedCliPath) return this.resolvedCliPath;

    if (this.opts.cliPath) {
      this.resolvedCliPath = this.opts.cliPath;
      return this.resolvedCliPath;
    }

    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const copilotPkgPath = require.resolve("@github/copilot/package.json");
      const copilotDir = path.dirname(copilotPkgPath);
      const { default: copilotPkg } = await import(
        `file://${copilotPkgPath}`,
        { with: { type: "json" } }
      ) as { default: Record<string, unknown> };
      const bin = copilotPkg.bin;
      if (typeof bin === "string") {
        this.resolvedCliPath = path.join(copilotDir, bin);
      } else if (bin && typeof bin === "object") {
        const firstBin = Object.values(bin as Record<string, string>)[0];
        this.resolvedCliPath = path.join(copilotDir, firstBin);
      }
    } catch {
      this.resolvedCliPath = "copilot";
    }

    return this.resolvedCliPath!;
  }
}
