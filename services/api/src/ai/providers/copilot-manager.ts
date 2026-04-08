/**
 * CopilotEngine Manager — Per-Project Concurrency
 *
 * Pools CopilotEngine instances keyed by projectId so each project gets
 * its own CLI subprocess. This allows true parallel AI processing —
 * User A's request on Project X never blocks User B on Project Y.
 *
 * - Each project gets a dedicated CopilotClient + CLI subprocess
 * - The githubToken is used for auth when creating the engine
 * - Idle engines are stopped after 10 minutes (faster cleanup for more engines)
 * - ALL engines are recycled after 60 minutes (max age)
 * - Hard cap of 20 concurrent engines (~50-100MB each, 4GB server)
 * - Concurrent requests for the same project await a single start promise
 * - Auth/policy errors trigger automatic eviction + retry via withAutoRetry()
 */

import { CopilotEngine } from "./copilot.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes — aggressive cleanup for 4GB server
const MAX_AGE_MS      = 60 * 60 * 1000; // 60 minutes
const MAX_ENGINES     = 20;              // Hard cap — ~1-2GB at full capacity

interface PoolEntry {
  engine: CopilotEngine;
  projectId: string;
  githubToken: string | undefined;
  lastUsed: number;
  createdAt: number;
  activeRequests: number;
  startPromise: Promise<void> | null;
}

/** Check if an error message indicates a stale/expired Copilot API token */
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("not authorized") ||
    msg.includes("policy") ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("authentication") ||
    msg.includes("token")
  );
}

export class CopilotEngineManager {
  private pool = new Map<string, PoolEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of idle and aged-out engines
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Get a CopilotEngine for the given project.
   * Each project gets its own dedicated CLI subprocess for true concurrency.
   * The githubToken is used for authentication when creating the engine.
   */
  async getEngine(projectId: string, githubToken?: string): Promise<CopilotEngine> {
    const existing = this.pool.get(projectId);
    if (existing) {
      // Wait for startup if still in progress
      if (existing.startPromise) {
        await existing.startPromise;
      }

      // Recycle if past max age — proactively prevents stale tokens
      if (Date.now() - existing.createdAt > MAX_AGE_MS) {
        console.log(`[CopilotManager] Recycling engine past max age (${projectId.slice(0, 8)}…)`);
        this.pool.delete(projectId);
        existing.engine.stop().catch(() => {});
        // Fall through to create a new one
      } else {
        existing.lastUsed = Date.now();
        return existing.engine;
      }
    }

    // Enforce hard cap — try cleanup first, then reject if still full
    if (this.pool.size >= MAX_ENGINES) {
      this.cleanup();
      if (this.pool.size >= MAX_ENGINES) {
        console.warn(`[CopilotManager] At capacity (${MAX_ENGINES} engines) — rejecting ${projectId.slice(0, 8)}…`);
        throw new Error("Server busy — too many concurrent AI sessions. Please try again in a few minutes.");
      }
    }

    return this.createEngine(projectId, githubToken);
  }

  /** Mark an engine as having an active request (prevents recycling) */
  trackRequest(projectId: string): () => void {
    const entry = this.pool.get(projectId);
    if (entry) {
      entry.activeRequests++;
      entry.lastUsed = Date.now();
    }
    return () => {
      const e = this.pool.get(projectId);
      if (e) e.activeRequests = Math.max(0, e.activeRequests - 1);
    };
  }

  /**
   * Run an async operation with automatic retry on auth errors.
   * If the operation fails with an auth/token error, evicts the cached engine
   * and retries once with a fresh connection.
   */
  async withAutoRetry<T>(
    projectId: string,
    githubToken: string | undefined,
    operation: (engine: CopilotEngine) => Promise<T>,
  ): Promise<T> {
    const engine = await this.getEngine(projectId, githubToken);
    try {
      return await operation(engine);
    } catch (err) {
      if (isAuthError(err)) {
        console.log(`[CopilotManager] Auth error detected for ${projectId.slice(0, 8)}…, evicting and retrying...`);
        await this.evictEngine(projectId);
        const freshEngine = await this.getEngine(projectId, githubToken);
        return await operation(freshEngine);
      }
      throw err;
    }
  }

  /**
   * Return the pool engine for a project WITHOUT creating one if absent.
   * Used by the abort path: we want to target the exact engine instance
   * that owns the in-flight session, not spin up a fresh one just to call
   * abort on an empty sessions map.
   */
  tryGetEngine(projectId: string): CopilotEngine | null {
    return this.pool.get(projectId)?.engine ?? null;
  }

  /**
   * Evict a cached engine so the next getEngine() call creates a fresh one.
   * Call this when a request fails with an auth/permission error.
   */
  async evictEngine(projectId: string): Promise<void> {
    const entry = this.pool.get(projectId);
    if (entry) {
      console.log(`[CopilotManager] Evicting stale engine (${projectId.slice(0, 8)}…)`);
      this.pool.delete(projectId);
      entry.engine.stop().catch(() => {});
    }
  }

  /**
   * Stop all engines and clean up.
   */
  async stopAll(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    const stops = Array.from(this.pool.values()).map((e) =>
      e.engine.stop().catch(() => {})
    );
    await Promise.all(stops);
    this.pool.clear();
    console.log("[CopilotManager] All engines stopped");
  }

  /** Get the current number of pooled engines (for monitoring) */
  get poolSize(): number {
    return this.pool.size;
  }

  /** Snapshot of all pool entries for admin monitoring */
  getPoolSnapshot(): Array<{
    projectId: string;
    sessionCount: number;
    activeRequests: number;
    createdAt: number;
    lastUsed: number;
    idleMs: number;
    ageMs: number;
  }> {
    const now = Date.now();
    return Array.from(this.pool.values()).map((entry) => ({
      projectId: entry.projectId,
      sessionCount: entry.engine.sessionCount,
      activeRequests: entry.activeRequests,
      createdAt: entry.createdAt,
      lastUsed: entry.lastUsed,
      idleMs: now - entry.lastUsed,
      ageMs: now - entry.createdAt,
    }));
  }

  private async createEngine(projectId: string, githubToken?: string): Promise<CopilotEngine> {
    const engine = new CopilotEngine({
      model: process.env.COPILOT_DEFAULT_MODEL,
      cliPath: process.env.COPILOT_CLI_PATH,
      cliUrl: process.env.COPILOT_CLI_URL,
      ...(githubToken ? { githubToken } : {}),
    });

    const now = Date.now();
    const entry: PoolEntry = {
      engine,
      projectId,
      githubToken,
      lastUsed: now,
      createdAt: now,
      activeRequests: 0,
      startPromise: null,
    };

    // Dedup: store entry before starting so concurrent calls see it
    this.pool.set(projectId, entry);

    // Start with dedup promise
    entry.startPromise = engine.start().catch((err) => {
      console.error(`[CopilotManager] Failed to start engine (${projectId.slice(0, 8)}):`, err);
      this.pool.delete(projectId);
      throw err;
    });

    try {
      await entry.startPromise;
    } finally {
      entry.startPromise = null;
    }

    console.log(`[CopilotManager] Engine started (${projectId.slice(0, 8)}…) — pool: ${this.pool.size}/${MAX_ENGINES}`);
    return engine;
  }

  /**
   * Stop and remove idle engines and engines past max age.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.pool) {
      const isIdle = now - entry.lastUsed > IDLE_TIMEOUT_MS;
      const isAged = now - entry.createdAt > MAX_AGE_MS;

      // Never recycle an engine with active requests — kills in-flight calls
      if (entry.activeRequests > 0) continue;

      if (isIdle || isAged) {
        const reason = isAged ? "max age" : "idle";
        console.log(`[CopilotManager] Stopping engine (${key.slice(0, 8)}… — ${reason}) — pool: ${this.pool.size - 1}/${MAX_ENGINES}`);
        entry.engine.stop().catch((err) =>
          console.error(`[CopilotManager] Error stopping engine:`, err)
        );
        this.pool.delete(key);
      }
    }
  }
}

// ─── Singleton ──────────────────────────────────────────

let _manager: CopilotEngineManager | null = null;

/**
 * Get the global CopilotEngineManager instance.
 */
export function getCopilotManager(): CopilotEngineManager {
  if (!_manager) {
    _manager = new CopilotEngineManager();
  }
  return _manager;
}
