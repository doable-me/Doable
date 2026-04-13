/**
 * docore connection pool
 *
 * Manages shared CopilotClient instances for multi-tenant deployment.
 * Instead of spawning one CLI child process per user, the pool lets
 * hundreds of DoCoreEngine instances share a small number of clients.
 *
 * Modes:
 *   1. **External server** (recommended for production):
 *      Run one Copilot CLI server externally, pass `cliUrl` to the pool.
 *      All sessions share one TCP connection. Zero child processes spawned.
 *
 *   2. **Managed pool** (simpler setup):
 *      The pool spawns N CopilotClient instances (each with its own CLI process)
 *      and distributes sessions round-robin across them.
 *
 * Usage:
 *   const pool = new DoCorePool({ cliUrl: "localhost:3000" });
 *   await pool.start();
 *   const engine = await pool.createEngine({ model: "gpt-4o" });
 *   // engine.events, engine.send(), engine.disconnect() work the same
 *   await pool.stop();
 */

import {
  CopilotClient,
  type CopilotClientOptions,
} from "@github/copilot-sdk";

import { DoCoreEngine, type DoCoreEngineOptions } from "./engine.js";

// ============================================================================
// Configuration
// ============================================================================

export interface DoCorePoolOptions {
  /**
   * URL of a shared Copilot CLI server (e.g. "localhost:3000").
   * When set, no child processes are spawned. Best for production VPS.
   */
  cliUrl?: string;

  /**
   * Base client options forwarded to every CopilotClient in the pool.
   * If `cliUrl` is set above, it overrides `clientOptions.cliUrl`.
   */
  clientOptions?: CopilotClientOptions;

  /**
   * Number of CopilotClient instances to keep in the pool.
   * Only used when `cliUrl` is NOT set (managed mode).
   * Each instance spawns one CLI child process.
   * @default 1
   */
  poolSize?: number;

  /**
   * Maximum concurrent sessions across all clients.
   * 0 = unlimited.
   * @default 0
   */
  maxSessions?: number;
}

// ============================================================================
// Pool
// ============================================================================

interface PooledClient {
  client: CopilotClient;
  sessionCount: number;
}

export class DoCorePool {
  private clients: PooledClient[] = [];
  private engines = new Set<DoCoreEngine>();
  private options: DoCorePoolOptions;
  private started = false;
  private roundRobinIndex = 0;

  constructor(options: DoCorePoolOptions = {}) {
    this.options = options;
  }

  /** Number of active engines (sessions) in the pool */
  get activeEngines(): number { return this.engines.size; }

  /** Whether the pool has been started */
  get isRunning(): boolean { return this.started; }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start the pool. Creates and connects all CopilotClient instances.
   * Must be called before createEngine().
   */
  async start(): Promise<void> {
    if (this.started) return;

    const poolSize = this.options.cliUrl ? 1 : (this.options.poolSize ?? 1);

    for (let i = 0; i < poolSize; i++) {
      const clientOpts: CopilotClientOptions = {
        ...this.options.clientOptions,
      };

      if (this.options.cliUrl) {
        clientOpts.cliUrl = this.options.cliUrl;
      }

      const client = new CopilotClient(clientOpts);
      await client.start();
      this.clients.push({ client, sessionCount: 0 });
    }

    this.started = true;
  }

  /**
   * Stop the pool. Disconnects all engines, then stops all clients.
   */
  async stop(): Promise<void> {
    // Disconnect all engines first
    const disconnectPromises = [...this.engines].map(async (engine) => {
      try {
        await engine.disconnectSession();
      } catch {
        // swallow; engine may already be disconnected
      }
    });
    await Promise.all(disconnectPromises);
    this.engines.clear();

    // Stop all clients
    for (const pooled of this.clients) {
      await pooled.client.stop();
    }
    this.clients = [];
    this.started = false;
  }

  // --------------------------------------------------------------------------
  // Engine creation
  // --------------------------------------------------------------------------

  /**
   * Create a new DoCoreEngine backed by a shared pooled client.
   * The engine owns a session, not a client.
   *
   * @param engineOptions Options for the engine (model, streaming, handlers, etc.)
   *   Note: `clientOptions` is ignored here since the pool manages clients.
   */
  async createEngine(engineOptions: Omit<DoCoreEngineOptions, "clientOptions"> = {}): Promise<DoCoreEngine> {
    if (!this.started) {
      throw new Error("Pool not started. Call pool.start() first.");
    }

    if (this.options.maxSessions && this.engines.size >= this.options.maxSessions) {
      throw new Error(`Session limit reached (${this.options.maxSessions}). Disconnect some engines first.`);
    }

    // Pick the client with fewest sessions (round robin as tiebreaker)
    const pooled = this.pickClient();

    const engine = new DoCoreEngine({
      ...engineOptions,
      // Signal to engine: use this shared client, don't create your own
      _sharedClient: pooled.client,
    } as DoCoreEngineOptions);

    pooled.sessionCount++;
    this.engines.add(engine);

    // When engine disconnects, update bookkeeping
    engine.events.on("engine.disconnected", () => {
      pooled.sessionCount = Math.max(0, pooled.sessionCount - 1);
      this.engines.delete(engine);
    });

    return engine;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private pickClient(): PooledClient {
    if (this.clients.length === 0) {
      throw new Error("No clients in pool.");
    }

    // Find client with minimum sessions
    let best = this.clients[0];
    for (const c of this.clients) {
      if (c.sessionCount < best.sessionCount) {
        best = c;
      }
    }

    return best;
  }
}
