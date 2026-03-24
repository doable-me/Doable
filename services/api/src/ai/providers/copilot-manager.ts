/**
 * CopilotEngine Manager
 *
 * Pools CopilotEngine instances keyed by SHA-256 hash of the GitHub token.
 * - No token = default engine (uses gh CLI auth)
 * - Same token = reuses existing engine
 * - Idle engines are stopped after 30 minutes
 * - Concurrent requests for the same token await a single start promise
 */

import { createHash } from "node:crypto";
import { CopilotEngine } from "./copilot.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface PoolEntry {
  engine: CopilotEngine;
  tokenHash: string;
  lastUsed: number;
  startPromise: Promise<void> | null;
}

export class CopilotEngineManager {
  private pool = new Map<string, PoolEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of idle engines
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), 60_000);
  }

  /**
   * Get a CopilotEngine for the given GitHub token.
   * Returns the default engine (gh CLI auth) when no token is provided.
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
      existing.lastUsed = Date.now();
      return existing.engine;
    }

    // Create new engine
    const engine = new CopilotEngine({
      model: process.env.COPILOT_DEFAULT_MODEL,
      cliPath: process.env.COPILOT_CLI_PATH,
      cliUrl: process.env.COPILOT_CLI_URL,
      ...(githubToken ? { githubToken } : {}),
    });

    const entry: PoolEntry = {
      engine,
      tokenHash,
      lastUsed: Date.now(),
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
   * Stop and remove idle engines.
   */
  private cleanupIdle(): void {
    const now = Date.now();
    for (const [hash, entry] of this.pool) {
      if (hash === "__default__") continue; // Never clean up default engine
      if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
        console.log(`[CopilotManager] Stopping idle engine (${hash.slice(0, 8)}…)`);
        entry.engine.stop().catch((err) =>
          console.error(`[CopilotManager] Error stopping engine:`, err)
        );
        this.pool.delete(hash);
      }
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
