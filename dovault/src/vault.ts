import type {
  VaultOptions,
  SpawnOptions,
  JailedProcess,
  AuditEntry,
} from "./types.js";
import { ConfigGuard } from "./config-guard.js";
import { ProcessJail } from "./process-jail.js";
import { ResourceLimiter } from "./resource-limiter.js";

/**
 * dovault — Zero-overhead runtime jail for Node.js processes.
 *
 * Three independent security layers, each composable and optional:
 *
 *   Layer 1: Config Guard
 *     Overwrites server-side config files (vite.config.ts, postcss.config.js,
 *     tailwind.config.ts) with safe templates. Deletes variant files that
 *     could shadow the canonical config. Primary defense — always on.
 *
 *   Layer 2: Process Jail (Node.js Permission Model)
 *     Restricts filesystem access, blocks child_process spawning, allows
 *     native addons and worker threads. Prevents shell execution, file
 *     reads outside the project, and reverse shells. Zero runtime cost.
 *
 *   Layer 3: Resource Limits (OS-level)
 *     Linux: systemd-run cgroups (memory, CPU, tasks, network).
 *     Windows: V8 heap limit (best-effort).
 *     Prevents resource exhaustion and outbound data exfiltration (Linux).
 *
 * Usage:
 *
 *   import { createVault } from "dovault";
 *
 *   const vault = createVault({
 *     resourceLimits: { memoryMax: "150M", cpuQuota: "30%", tasksMax: 32 },
 *   });
 *
 *   const proc = await vault.spawn("vite", ["--port", "3100"], {
 *     cwd: "/projects/abc123",
 *     jail: "/projects/abc123",
 *   });
 *
 * Doable integration:
 *
 *   // In dev-server.ts — replace raw spawn() with vault.spawn()
 *   const child = await vault.spawn(viteBin, args, {
 *     cwd: projectPath,
 *     jail: projectPath,
 *   });
 *
 *   // In write_file tool — reject writes to locked configs
 *   if (vault.isLockedFile(path)) {
 *     return { success: false, error: "Config files are locked for security" };
 *   }
 */
export class Vault {
  private configGuard: ConfigGuard;
  private processJail: ProcessJail;
  private resourceLimiter: ResourceLimiter;
  private options: VaultOptions;

  constructor(options: VaultOptions = {}) {
    this.options = options;

    this.configGuard = new ConfigGuard({
      templates: options.templates,
      extraLockedFiles: options.lockedFiles,
      onAudit: options.onAudit,
    });

    this.processJail = new ProcessJail();

    this.resourceLimiter = new ResourceLimiter(options.backend);
  }

  /** Active resource limiter backend name ("systemd" | "win-heap" | "direct") */
  get backend(): string {
    return this.resourceLimiter.backend.name;
  }

  /** Whether the platform supports full OS-level isolation (systemd on Linux) */
  get hasFullIsolation(): boolean {
    const name = this.resourceLimiter.backend.name;
    return name !== "direct" && name !== "win-heap";
  }

  /**
   * Spawn a jailed process.
   *
   * Execution order:
   *   1. Lock config files (overwrites with safe templates)
   *   2. Resolve command to Node.js script entry point
   *   3. Prepend node with Permission Model flags
   *   4. Wrap with OS resource limits (systemd-run / V8 heap)
   *   5. Spawn the process
   *
   * The result is a command like:
   *   systemd-run --scope -p MemoryMax=150M -p IPAddressDeny=any --
   *     node --experimental-permission --allow-fs-read=/project --allow-fs-write=/project
   *       /project/node_modules/vite/bin/vite.js --port 3100 --host 127.0.0.1
   */
  async spawn(
    command: string,
    args: string[],
    options: SpawnOptions,
  ): Promise<JailedProcess> {
    const {
      cwd,
      jail,
      lockConfigs = true,
      blockChildProcess = true,
      blockOutboundNet = true,
      readOnlyPaths,
      env,
      resourceLimits,
      stdio,
    } = options;

    // ── Layer 1: Config lockdown ──
    if (lockConfigs) {
      const locked = await this.configGuard.lock(cwd);
      if (locked.length > 0) {
        this.audit("config_lock", {
          files: locked,
          projectPath: cwd,
        });
      }
    }

    // ── Layer 2: Node.js Permission Model ──
    let spawnCommand = command;
    let spawnArgs = [...args];

    if (this.options.permissionModel !== false && jail) {
      const allReadOnlyPaths = [
        ...(this.options.readOnlyPaths ?? []),
        ...(readOnlyPaths ?? []),
      ];

      const jailed = this.processJail.buildJailedCommand(
        command,
        args,
        cwd,
        {
          jail,
          readOnlyPaths: allReadOnlyPaths.length > 0 ? allReadOnlyPaths : undefined,
          allowChildProcess: !blockChildProcess,
          allowWorkers: true,
        },
      );

      if (jailed) {
        spawnCommand = jailed.command;
        spawnArgs = jailed.args;
        this.audit("permission_jail", {
          jail,
          blockChildProcess,
          extraReadPaths: allReadOnlyPaths.length,
          resolvedScript: spawnArgs[spawnArgs.length - args.length - 1],
        });
      } else {
        // Could not resolve — spawn without Permission Model
        this.audit("permission_jail", {
          warning: `Could not resolve "${command}" as Node.js script — Permission Model skipped`,
          command,
          cwd,
        });
      }
    }

    // ── Layer 3: OS resource limits ──
    const limits = resourceLimits ?? this.options.resourceLimits;
    const child = this.resourceLimiter.spawn(spawnCommand, spawnArgs, {
      cwd,
      env,
      limits,
      stdio,
      blockNetwork: blockOutboundNet,
    });

    this.audit("spawn", {
      command,
      pid: child.pid,
      backend: this.backend,
      permissionModel: this.options.permissionModel !== false && !!jail,
      jail: jail ?? null,
    });

    return {
      process: child,
      pid: child.pid,
      kill: () => child.kill(),
    };
  }

  /**
   * Lock config files without spawning a process.
   * Useful for pre-locking before AI operations.
   */
  async lockConfigs(projectPath: string): Promise<string[]> {
    return this.configGuard.lock(projectPath);
  }

  /**
   * Check if a file is a locked config file.
   *
   * Call this in your file-write tools to prevent the AI from
   * creating or modifying server-side config files:
   *
   *   if (vault.isLockedFile(path)) {
   *     return { success: false, error: "Config files are locked" };
   *   }
   */
  isLockedFile(filePath: string): boolean {
    return this.configGuard.isLocked(filePath);
  }

  /** All file names that are considered locked */
  get lockedFileNames(): string[] {
    return this.configGuard.lockedFileNames;
  }

  private audit(kind: AuditEntry["kind"], details: Record<string, unknown>) {
    this.options.onAudit?.({
      timestamp: new Date().toISOString(),
      kind,
      details,
    });
  }
}
