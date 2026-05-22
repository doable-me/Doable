/**
 * docore server
 *
 * Top-level wiring that assembles all subsystems into a single ready-to-use
 * server instance. This is the recommended entry point for multi-tenant
 * deployments.
 *
 * Usage:
 *   import { DoCoreServer } from "docore";
 *
 *   const server = await DoCoreServer.create({
 *     baseDir: "/srv/doable/users",
 *     policiesPath: "/srv/doable/policies.json",
 *   });
 *
 *   // Runtime policy changes
 *   server.admin.blockCommand("rm", { userId: "user-123" });
 *   server.admin.setMemoryLimit("100M", { userId: "user-456" });
 *
 *   // Submit work
 *   const engine = await server.pool.submit({
 *     userId: "user-123",
 *     githubToken: "gho_xxx",
 *     prompt: "Create a Vite React app",
 *   });
 *
 *   // Or use the user manager for persistent sessions
 *   const engine2 = await server.users.acquire("user-456", {
 *     githubToken: "gho_yyy",
 *   });
 *
 *   // Shutdown
 *   await server.shutdown();
 */

import { PolicyStore, type PolicyStoreOptions } from "./policy/store.js";
import { PolicyAdmin } from "./policy/admin.js";
import { FilePersistence } from "./policy/persistence.js";
import { ProcessIsolator, type IsolatorOptions } from "./isolator.js";
import { DoCoreUserManager, type DoCoreUserManagerOptions } from "./user-manager.js";
import { WorkerPool, type WorkerPoolOptions } from "./worker-pool.js";
import type { SandboxAuditEntry } from "./sandbox.js";

// ============================================================================
// Server Options
// ============================================================================

export interface DoCoreServerOptions {
  /** Base directory for user workspaces. Each user gets {baseDir}/{userId}/. */
  baseDir: string;

  /** Path to the policies JSON file. If set, enables file-based persistence. */
  policiesPath?: string;

  /** PolicyStore options (overrides policiesPath if persistence is provided). */
  policyStoreOptions?: PolicyStoreOptions;

  /** Isolator options for OS-level process isolation. */
  isolatorOptions?: IsolatorOptions;

  /** User manager options (overrides baseDir, policyStore, isolator). */
  userManagerOptions?: Partial<DoCoreUserManagerOptions>;

  /** Worker pool options (overrides baseDir, policyStore, isolator). */
  workerPoolOptions?: Partial<WorkerPoolOptions>;

  /** Default model. @default "gpt-4o" */
  defaultModel?: string;

  /** Audit callback for all sandbox decisions. */
  onAudit?: (entry: SandboxAuditEntry) => void;

  /** Lifecycle callback. */
  onEvent?: (event: { type: string; message: string }) => void;
}

// ============================================================================
// DoCoreServer
// ============================================================================

export class DoCoreServer {
  /** Central policy store (global + per-user rules). */
  readonly store: PolicyStore;
  /** Convenience API for runtime policy changes. */
  readonly admin: PolicyAdmin;
  /** OS-level process isolator. */
  readonly isolator: ProcessIsolator;
  /** Per-user engine manager with LRU eviction. */
  readonly users: DoCoreUserManager;
  /** Request queue + worker pool for high concurrency. */
  readonly pool: WorkerPool;

  private constructor(
    store: PolicyStore,
    admin: PolicyAdmin,
    isolator: ProcessIsolator,
    users: DoCoreUserManager,
    pool: WorkerPool,
  ) {
    this.store = store;
    this.admin = admin;
    this.isolator = isolator;
    this.users = users;
    this.pool = pool;
  }

  /**
   * Create and initialize a DoCoreServer.
   * Loads persisted policies, detects isolation backend, and starts the pool.
   */
  static async create(options: DoCoreServerOptions): Promise<DoCoreServer> {
    // 1. PolicyStore
    let storeOpts: PolicyStoreOptions = options.policyStoreOptions ?? {};
    if (options.policiesPath && !storeOpts.persistence) {
      storeOpts = { ...storeOpts, persistence: new FilePersistence(options.policiesPath) };
    }
    const store = new PolicyStore(storeOpts);
    await store.load();

    // 2. PolicyAdmin
    const admin = new PolicyAdmin(store);

    // 3. ProcessIsolator
    const isolator = new ProcessIsolator({
      policyStore: store,
      ...options.isolatorOptions,
    });

    // 4. UserManager
    const users = new DoCoreUserManager({
      baseDir: options.baseDir,
      defaultModel: options.defaultModel ?? "gpt-4o",
      policyStore: store,
      isolator,
      onSandboxAudit: options.onAudit,
      ...options.userManagerOptions,
    });

    // 5. WorkerPool
    const pool = new WorkerPool({
      baseDir: options.baseDir,
      defaultModel: options.defaultModel ?? "gpt-4o",
      policyStore: store,
      isolator,
      onAudit: options.onAudit,
      ...options.workerPoolOptions,
    });
    await pool.start();

    options.onEvent?.({ type: "server-ready", message: "DoCoreServer initialized" });

    return new DoCoreServer(store, admin, isolator, users, pool);
  }

  /**
   * Gracefully shut down all subsystems.
   */
  async shutdown(): Promise<void> {
    await this.pool.shutdown();
    await this.users.shutdown();
    await this.isolator.killAll();
    await this.store.save();
  }
}
