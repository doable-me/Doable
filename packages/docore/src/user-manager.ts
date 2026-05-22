/**
 * docore user manager
 *
 * Manages per-user Copilot engines with lifecycle control for multi-tenant
 * deployments where each user brings their own GitHub account and needs
 * real filesystem isolation (e.g. building Vite websites).
 *
 * Each user gets their own CopilotClient (own CLI child process) with:
 *   - Their own GitHub token for auth
 *   - An isolated working directory
 *   - LRU eviction when the VPS hits its concurrency cap
 *   - Session resume on reconnect (CLI persists session state to disk)
 *
 * Memory budget example (4GB VPS):
 *   - CLI process ~50-80MB each
 *   - maxConcurrent=30 => ~2.4GB for CLI processes + headroom for OS/app
 *   - Remaining users get evicted (session state persisted) and resume later
 *
 * Usage:
 *   const manager = new DoCoreUserManager({
 *     maxConcurrent: 30,
 *     idleTimeoutMs: 10 * 60 * 1000,  // 10 min
 *     baseDir: "/srv/doable/users",
 *   });
 *
 *   const engine = await manager.acquire("user-123", {
 *     githubToken: "gho_xxx",
 *     model: "gpt-4o",
 *   });
 *   // engine.events, engine.send(), etc.
 *
 *   // Later, or automatically after idle timeout:
 *   await manager.release("user-123");
 *
 *   // On reconnect, session resumes from disk:
 *   const engine2 = await manager.acquire("user-123", { ... });
 */

import * as path from "node:path";
import { DoCoreEngine, type DoCoreEngineOptions } from "./engine.js";
import { createSandboxedPermissionHandler, createPolicySandbox, type SandboxOptions } from "./sandbox.js";
import { ProcessIsolator, type IsolatorOptions } from "./isolator.js";
import type { PolicyStore } from "./policy/store.js";
import type { PermissionHandler, SessionConfig } from "@github/copilot-sdk";
import { Tracer, noopTracer } from "./tracer.js";

// ============================================================================
// Configuration
// ============================================================================

export interface DoCoreUserManagerOptions {
  /**
   * Max concurrent active engines (CLI processes).
   * When exceeded, the least recently used engine is evicted.
   * @default 20
   */
  maxConcurrent?: number;

  /**
   * Idle timeout in ms. Engines with no activity for this long are auto-evicted.
   * 0 = no auto-eviction.
   * @default 600_000 (10 minutes)
   */
  idleTimeoutMs?: number;

  /**
   * Base directory for user project workspaces.
   * Each user gets `{baseDir}/{userId}/` as their working directory.
   */
  baseDir: string;

  /**
   * Default model for new sessions.
   * @default "gpt-4o"
   */
  defaultModel?: string;

  /**
   * Default permission handler for all engines.
   * If not set and sandbox is enabled, uses the sandboxed handler.
   */
  defaultPermissionHandler?: PermissionHandler;

  /**
   * Enable filesystem/command sandboxing.
   * When true (default), each user's engine gets a permission handler that
   * jails file access to their project directory and blocks dangerous commands.
   * @default true
   */
  sandbox?: boolean;

  /**
   * Extra sandbox options (read-only roots, allowed commands, audit callback, etc.)
   * Only used when sandbox is true.
   */
  sandboxOptions?: Omit<SandboxOptions, "allowedRoot">;

  /**
   * Process isolator for OS-level cgroup resource limits.
   * When provided, each user's CLI process is spawned inside a cgroup with
   * memory/CPU/PID limits (via systemd-run on Linux).
   * On non-Linux, falls back to direct spawn with a warning.
   *
   * Create one with: new ProcessIsolator({ memoryMax: "200M", cpuQuota: "50%" })
   */
  isolator?: ProcessIsolator;

  /**
   * PolicyStore for runtime-configurable sandbox rules.
   * When provided, the sandbox reads effective policies per user from the store
   * instead of using the static sandboxOptions. Takes precedence over sandboxOptions.
   */
  policyStore?: PolicyStore;

  /**
   * Audit callback for sandbox permission decisions.
   * Only used when policyStore is provided.
   */
  onSandboxAudit?: (entry: import("./sandbox.js").SandboxAuditEntry) => void;

  /**
   * Callback when an engine is evicted (idle timeout or LRU).
   * Useful for notifying the frontend that the user's session was suspended.
   */
  onEvict?: (userId: string, reason: "idle" | "lru") => void;

  /**
   * Tracer for span-level observability (user.acquire, user.release, user.evict).
   * When provided, also passed to each engine for engine-level tracing.
   */
  tracer?: Tracer;
}

export interface UserAcquireOptions {
  /** The user's GitHub personal access token or OAuth token */
  githubToken: string;
  /** Model override for this user */
  model?: string;
  /** Existing session ID to resume (if the user had a previous session) */
  resumeSessionId?: string;
  /** Permission handler override */
  onPermissionRequest?: PermissionHandler;
  /** User input handler */
  onUserInputRequest?: SessionConfig["onUserInputRequest"];
  /** Elicitation handler */
  onElicitationRequest?: any;
  /** Extra session config */
  sessionConfig?: Partial<SessionConfig>;
}

// ============================================================================
// Internal types
// ============================================================================

interface ManagedUser {
  userId: string;
  engine: DoCoreEngine;
  sessionId: string | undefined;
  lastActivity: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// ============================================================================
// User Manager
// ============================================================================

export class DoCoreUserManager {
  private users = new Map<string, ManagedUser>();
  private options: Required<Pick<DoCoreUserManagerOptions, "maxConcurrent" | "idleTimeoutMs" | "baseDir" | "defaultModel">> & DoCoreUserManagerOptions;
  private tracer: Tracer;

  constructor(options: DoCoreUserManagerOptions) {
    this.options = {
      maxConcurrent: 20,
      idleTimeoutMs: 600_000,
      defaultModel: "gpt-4o",
      ...options,
    };
    this.tracer = options.tracer ?? noopTracer;
  }

  /** Number of currently active engines */
  get activeCount(): number { return this.users.size; }

  /** All currently active user IDs */
  get activeUsers(): string[] { return [...this.users.keys()]; }

  // --------------------------------------------------------------------------
  // Acquire / Release
  // --------------------------------------------------------------------------

  /**
   * Get or create an engine for a user.
   * If the user already has an active engine, returns it (and resets idle timer).
   * If not, creates a new one (evicting LRU if at capacity).
   */
  async acquire(userId: string, options: UserAcquireOptions): Promise<DoCoreEngine> {
    const span = this.tracer.start("user.acquire", {
      userId,
      activeCount: this.users.size,
      maxConcurrent: this.options.maxConcurrent,
      hasResumeSession: !!options.resumeSessionId,
    });

    // Already active? Return existing and reset idle timer.
    const existing = this.users.get(userId);
    if (existing) {
      this.touchUser(existing);
      span.end({ cached: true, sessionId: existing.sessionId });
      return existing.engine;
    }

    try {
      // At capacity? Evict least recently used.
      if (this.users.size >= this.options.maxConcurrent) {
        const evictSpan = span.child("user.evict_lru");
        await this.evictLRU();
        evictSpan.end();
      }

    // Create isolated engine for this user
    const workingDirectory = path.join(this.options.baseDir, userId);

    // Determine permission handler: explicit > policyStore sandbox > legacy sandbox > default
    let permissionHandler = options.onPermissionRequest ?? this.options.defaultPermissionHandler;
    const sandboxEnabled = this.options.sandbox !== false; // default true
    if (!permissionHandler && sandboxEnabled) {
      if (this.options.policyStore) {
        permissionHandler = createPolicySandbox(
          userId,
          workingDirectory,
          this.options.policyStore,
          this.options.onSandboxAudit,
        );
      } else {
        permissionHandler = createSandboxedPermissionHandler(userId, {
          allowedRoot: workingDirectory,
          ...this.options.sandboxOptions,
        });
      }
    }

    // If isolator is provided, spawn CLI in a cgroup and connect via cliUrl
    const isolator = this.options.isolator;
    let clientOptions: DoCoreEngineOptions["clientOptions"];

    if (isolator) {
      const isolated = await isolator.spawn(userId, options.githubToken, workingDirectory);
      // Connect via TCP to the isolated CLI process (no token in clientOptions;
      // the isolator already passed it via env to the CLI process)
      clientOptions = {
        cliUrl: isolated.cliUrl,
      };
    } else {
      // Default: let the SDK spawn its own CLI process (no cgroup limits)
      clientOptions = {
        githubToken: options.githubToken,
      };
    }

    const engineOpts: DoCoreEngineOptions = {
      clientOptions,
      model: options.model ?? this.options.defaultModel,
      workingDirectory,
      streaming: true,
      onPermissionRequest: permissionHandler,
      onUserInputRequest: options.onUserInputRequest,
      onElicitationRequest: options.onElicitationRequest,
      tracer: this.tracer,
      sessionConfig: {
        sessionId: options.resumeSessionId ?? `${userId}-${Date.now()}`,
        ...options.sessionConfig,
      },
    };

    const engine = new DoCoreEngine(engineOpts);
    await engine.connect();

    const managed: ManagedUser = {
      userId,
      engine,
      sessionId: engine.sessionId,
      lastActivity: Date.now(),
      idleTimer: null,
    };

    this.users.set(userId, managed);
    this.startIdleTimer(managed);

    // Track activity from events
    engine.events.onAny(() => {
      const user = this.users.get(userId);
      if (user) this.touchUser(user);
    });

    span.end({ cached: false, sessionId: engine.sessionId });
    return engine;
    } catch (err) {
      span.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Explicitly release a user's engine.
   * The session state is preserved on disk for later resume.
   */
  async release(userId: string): Promise<void> {
    const managed = this.users.get(userId);
    if (!managed) return;

    const span = this.tracer.start("user.release", {
      userId,
      sessionId: managed.sessionId,
    });

    this.clearIdleTimer(managed);
    this.users.delete(userId);

    try {
      await managed.engine.disconnect();
    } catch {
      // swallow; engine may already be disconnected
    }

    // Kill the isolated CLI process if running
    if (this.options.isolator) {
      await this.options.isolator.kill(userId);
    }

    span.end();
  }

  /**
   * Shut down all engines. Call on server shutdown.
   */
  async shutdown(): Promise<void> {
    const releases = [...this.users.keys()].map((id) => this.release(id));
    await Promise.all(releases);
    // Kill any orphaned isolated processes
    if (this.options.isolator) {
      await this.options.isolator.killAll();
    }
  }

  /**
   * Get the engine for a user if they have one active.
   * Returns undefined if the user has been evicted or never acquired.
   */
  get(userId: string): DoCoreEngine | undefined {
    const managed = this.users.get(userId);
    if (managed) {
      this.touchUser(managed);
      return managed.engine;
    }
    return undefined;
  }

  /**
   * Get the session ID for a user (for resume on reconnect).
   */
  getSessionId(userId: string): string | undefined {
    return this.users.get(userId)?.sessionId;
  }

  // --------------------------------------------------------------------------
  // Idle management
  // --------------------------------------------------------------------------

  private touchUser(managed: ManagedUser): void {
    managed.lastActivity = Date.now();
    this.restartIdleTimer(managed);
  }

  private startIdleTimer(managed: ManagedUser): void {
    if (this.options.idleTimeoutMs <= 0) return;
    managed.idleTimer = setTimeout(() => {
      this.evictUser(managed.userId, "idle");
    }, this.options.idleTimeoutMs);
  }

  private restartIdleTimer(managed: ManagedUser): void {
    this.clearIdleTimer(managed);
    this.startIdleTimer(managed);
  }

  private clearIdleTimer(managed: ManagedUser): void {
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer);
      managed.idleTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Eviction
  // --------------------------------------------------------------------------

  private async evictLRU(): Promise<void> {
    let oldest: ManagedUser | null = null;
    for (const managed of this.users.values()) {
      if (!oldest || managed.lastActivity < oldest.lastActivity) {
        oldest = managed;
      }
    }
    if (oldest) {
      await this.evictUser(oldest.userId, "lru");
    }
  }

  private async evictUser(userId: string, reason: "idle" | "lru"): Promise<void> {
    const managed = this.users.get(userId);
    if (!managed) return;

    const span = this.tracer.start("user.evict", { userId, reason });

    this.clearIdleTimer(managed);
    this.users.delete(userId);

    this.options.onEvict?.(userId, reason);

    try {
      await managed.engine.disconnect();
    } catch {
      // swallow
    }

    span.end();
  }
}
