/**
 * CopilotEngine Manager
 *
 * Pools CopilotEngine instances keyed by SHA-256 hash of the GitHub token.
 * - No token = default engine (uses gh CLI auth)
 * - Same token = reuses existing engine
 * - Idle engines are stopped after 30 minutes
 * - ALL engines are recycled after 25 minutes (max age) to prevent stale
 *   Copilot API tokens — the SDK exchanges GitHub tokens for short-lived
 *   API tokens internally, and long-lived engines can hold expired ones
 * - Concurrent requests for the same token await a single start promise
 * - Auth/policy errors trigger automatic eviction + retry via withAutoRetry()
 */

import { createHash } from "node:crypto";
import { CopilotEngine } from "./copilot.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes
const MAX_AGE_MS      = 60 * 60 * 1000;  // 60 minutes — extended from 25min; sendAndWait handles auth internally

interface PoolEntry {
  engine: CopilotEngine;
  tokenHash: string;
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
   * Get a CopilotEngine for the given GitHub token.
   * Returns the default engine (gh CLI auth) when no token is provided.
   * Automatically recycles engines that have exceeded MAX_AGE_MS.
   */
  async getEngine(githubToken?: string): Promise<CopilotEngine> {
    const tokenHash = githubToken
      ? createHash("sha256").update(githubToken).digest("hex")
      : "__default__";

    const existing = this.pool.get(tokenHash);
    if (existing) {
      // Wait for startup if still in progress
      if (existing.startPromise) {
        await existing.startPromise;
      }

      // Recycle if past max age — proactively prevents stale tokens
      if (Date.now() - existing.createdAt > MAX_AGE_MS) {
        console.log(`[CopilotManager] Recycling engine past max age (${tokenHash.slice(0, 8)}…)`);
        this.pool.delete(tokenHash);
        existing.engine.stop().catch(() => {});
        // Fall through to create a new one
      } else {
        existing.lastUsed = Date.now();
        return existing.engine;
      }
    }

    return this.createEngine(tokenHash, githubToken);
  }

  /** Mark an engine as having an active request (prevents recycling) */
  trackRequest(githubToken?: string): () => void {
    const tokenHash = githubToken
      ? createHash("sha256").update(githubToken).digest("hex")
      : "__default__";
    const entry = this.pool.get(tokenHash);
    if (entry) {
      entry.activeRequests++;
      entry.lastUsed = Date.now();
    }
    return () => {
      const e = this.pool.get(tokenHash);
      if (e) e.activeRequests = Math.max(0, e.activeRequests - 1);
    };
  }

  /**
   * Run an async operation with automatic retry on auth errors.
   * If the operation fails with an auth/token error, evicts the cached engine
   * and retries once with a fresh connection.
   *
   * Use this for any Copilot SDK call that might fail due to stale tokens:
   *   await manager.withAutoRetry(githubToken, async (engine) => { ... })
   */
  async withAutoRetry<T>(
    githubToken: string | undefined,
    operation: (engine: CopilotEngine) => Promise<T>,
  ): Promise<T> {
    const engine = await this.getEngine(githubToken);
    try {
      return await operation(engine);
    } catch (err) {
      if (isAuthError(err)) {
        console.log(`[CopilotManager] Auth error detected, evicting and retrying...`);
        await this.evictEngine(githubToken);
        const freshEngine = await this.getEngine(githubToken);
        return await operation(freshEngine);
      }
      throw err;
    }
  }

  /**
   * Evict a cached engine so the next getEngine() call creates a fresh one.
   * Call this when a request fails with an auth/permission error — the
   * underlying Copilot API token may have expired while the engine was pooled.
   */
  async evictEngine(githubToken?: string): Promise<void> {
    const tokenHash = githubToken
      ? createHash("sha256").update(githubToken).digest("hex")
      : "__default__";

    const entry = this.pool.get(tokenHash);
    if (entry) {
      console.log(`[CopilotManager] Evicting stale engine (${tokenHash.slice(0, 8)}…)`);
      this.pool.delete(tokenHash);
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

  private async createEngine(tokenHash: string, githubToken?: string): Promise<CopilotEngine> {
    const engine = new CopilotEngine({
      model: process.env.COPILOT_DEFAULT_MODEL,
      cliPath: process.env.COPILOT_CLI_PATH,
      cliUrl: process.env.COPILOT_CLI_URL,
      ...(githubToken ? { githubToken } : {}),
    });

    const now = Date.now();
    const entry: PoolEntry = {
      engine,
      tokenHash,
      githubToken,
      lastUsed: now,
      createdAt: now,
      activeRequests: 0,
      startPromise: null,
    };

    // Dedup: store entry before starting so concurrent calls see it
    this.pool.set(tokenHash, entry);

    // Start with dedup promise
    entry.startPromise = engine.start().catch((err) => {
      console.error(`[CopilotManager] Failed to start engine (${tokenHash.slice(0, 8)}):`, err);
      this.pool.delete(tokenHash);
      throw err;
    });

    try {
      await entry.startPromise;
    } finally {
      entry.startPromise = null;
    }

    console.log(`[CopilotManager] Engine started (${tokenHash.slice(0, 8)}…)`);
    return engine;
  }

  /**
   * Stop and remove idle engines and engines past max age.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [hash, entry] of this.pool) {
      const isIdle = now - entry.lastUsed > IDLE_TIMEOUT_MS;
      const isAged = now - entry.createdAt > MAX_AGE_MS;

      // Never proactively clean up the default engine (no token = gh CLI auth)
      if (hash === "__default__" && !isIdle) continue;

      // Never recycle an engine with active requests — kills in-flight sendAndWait calls
      if (entry.activeRequests > 0) continue;

      if (isIdle || isAged) {
        const reason = isAged ? "max age" : "idle";
        console.log(`[CopilotManager] Stopping engine (${hash.slice(0, 8)}… — ${reason})`);
        entry.engine.stop().catch((err) =>
          console.error(`[CopilotManager] Error stopping engine:`, err)
        );
        this.pool.delete(hash);
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
