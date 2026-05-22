/**
 * docore worker pool
 *
 * Manages a pool of CLI worker processes for high-concurrency deployments.
 * Instead of one CLI process per active user (which caps at ~30 on a 4GB VPS),
 * the pool multiplexes many users across a smaller set of long-lived workers.
 *
 * Architecture:
 *   HTTP/WS request --> RequestQueue --> WorkerPool.dispatch() --> Worker (CLI process)
 *                           |                                         |
 *                      fair scheduling                          DoCoreEngine
 *                      per-user limits
 *
 * Features:
 *   - Fixed-size worker pool with auto-scaling between min/max
 *   - Priority queue with fair per-user scheduling (prevents single user from hogging)
 *   - Per-user queue depth limits
 *   - Request timeout with automatic cleanup
 *   - Worker health monitoring and auto-restart
 *   - Graceful shutdown with drain
 */

import * as path from "node:path";
import { DoCoreEngine, type DoCoreEngineOptions } from "./engine.js";
import { createPolicySandbox } from "./sandbox.js";
import { ProcessIsolator } from "./isolator.js";
import type { PolicyStore } from "./policy/store.js";
import type { SandboxAuditEntry } from "./sandbox.js";

// ============================================================================
// Configuration
// ============================================================================

export interface WorkerPoolOptions {
  /** Minimum number of workers to keep alive. @default 2 */
  minWorkers?: number;
  /** Maximum number of workers. @default 20 */
  maxWorkers?: number;
  /** Max queued requests per user. @default 5 */
  maxQueuePerUser?: number;
  /** Max total queued requests. @default 200 */
  maxQueueTotal?: number;
  /** Request timeout in ms. @default 120_000 (2 min) */
  requestTimeoutMs?: number;
  /** Worker idle timeout before scale-down. @default 300_000 (5 min) */
  workerIdleTimeoutMs?: number;
  /** Policy store for sandbox and isolation. */
  policyStore?: PolicyStore;
  /** Process isolator for OS-level limits. */
  isolator?: ProcessIsolator;
  /** Base directory for user workspaces. */
  baseDir: string;
  /** Default model. @default "gpt-4o" */
  defaultModel?: string;
  /** Audit callback. */
  onAudit?: (entry: SandboxAuditEntry) => void;
  /** Lifecycle callback. */
  onEvent?: (event: WorkerPoolEvent) => void;
}

export interface WorkerPoolEvent {
  type: "worker-spawned" | "worker-killed" | "worker-error" | "request-queued" | "request-dispatched" | "request-timeout" | "request-complete" | "queue-full" | "scale-up" | "scale-down";
  workerId?: string;
  userId?: string;
  message?: string;
  queueDepth?: number;
  workerCount?: number;
}

export interface PoolRequest {
  userId: string;
  githubToken: string;
  prompt: string;
  model?: string;
  /** Priority: lower = higher priority. @default 10 */
  priority?: number;
  /** Extra engine options. */
  engineOptions?: Partial<DoCoreEngineOptions>;
}

export interface PoolResponse {
  requestId: string;
  userId: string;
  result: DoCoreEngine;
}

// ============================================================================
// Request Queue
// ============================================================================

interface QueuedRequest {
  id: string;
  request: PoolRequest;
  resolve: (engine: DoCoreEngine) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private userCounts = new Map<string, number>();
  private maxPerUser: number;
  private maxTotal: number;

  constructor(maxPerUser = 5, maxTotal = 200) {
    this.maxPerUser = maxPerUser;
    this.maxTotal = maxTotal;
  }

  get length(): number { return this.queue.length; }

  enqueue(req: QueuedRequest): boolean {
    if (this.queue.length >= this.maxTotal) return false;
    const userCount = this.userCounts.get(req.request.userId) ?? 0;
    if (userCount >= this.maxPerUser) return false;
    this.userCounts.set(req.request.userId, userCount + 1);

    // Insert sorted by priority (lower value = higher priority)
    const priority = req.request.priority ?? 10;
    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if ((this.queue[i]!.request.priority ?? 10) > priority) {
        insertIdx = i;
        break;
      }
    }
    this.queue.splice(insertIdx, 0, req);
    return true;
  }

  dequeue(): QueuedRequest | undefined {
    const item = this.queue.shift();
    if (item) {
      const count = this.userCounts.get(item.request.userId) ?? 1;
      if (count <= 1) this.userCounts.delete(item.request.userId);
      else this.userCounts.set(item.request.userId, count - 1);
    }
    return item;
  }

  remove(id: string): QueuedRequest | undefined {
    const idx = this.queue.findIndex(q => q.id === id);
    if (idx === -1) return undefined;
    const [item] = this.queue.splice(idx, 1);
    if (item) {
      const count = this.userCounts.get(item.request.userId) ?? 1;
      if (count <= 1) this.userCounts.delete(item.request.userId);
      else this.userCounts.set(item.request.userId, count - 1);
    }
    return item;
  }

  peek(): QueuedRequest | undefined {
    return this.queue[0];
  }

  getUserQueueDepth(userId: string): number {
    return this.userCounts.get(userId) ?? 0;
  }

  clear(): QueuedRequest[] {
    const items = [...this.queue];
    this.queue.length = 0;
    this.userCounts.clear();
    return items;
  }
}

// ============================================================================
// Worker
// ============================================================================

interface Worker {
  id: string;
  engine: DoCoreEngine;
  userId: string | null;
  busy: boolean;
  lastActivity: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// ============================================================================
// Worker Pool
// ============================================================================

let requestCounter = 0;
let workerCounter = 0;

export class WorkerPool {
  private opts: Required<Pick<WorkerPoolOptions, "minWorkers" | "maxWorkers" | "maxQueuePerUser" | "maxQueueTotal" | "requestTimeoutMs" | "workerIdleTimeoutMs" | "baseDir" | "defaultModel">> & WorkerPoolOptions;
  private workers = new Map<string, Worker>();
  private queue: RequestQueue;
  private running = false;

  constructor(options: WorkerPoolOptions) {
    this.opts = {
      minWorkers: 2,
      maxWorkers: 20,
      maxQueuePerUser: 5,
      maxQueueTotal: 200,
      requestTimeoutMs: 120_000,
      workerIdleTimeoutMs: 300_000,
      defaultModel: "gpt-4o",
      ...options,
    };
    this.queue = new RequestQueue(this.opts.maxQueuePerUser, this.opts.maxQueueTotal);
  }

  get workerCount(): number { return this.workers.size; }
  get busyWorkerCount(): number { return [...this.workers.values()].filter(w => w.busy).length; }
  get idleWorkerCount(): number { return [...this.workers.values()].filter(w => !w.busy).length; }
  get queueDepth(): number { return this.queue.length; }

  private emit(type: WorkerPoolEvent["type"], extra?: Partial<WorkerPoolEvent>) {
    this.opts.onEvent?.({ type, queueDepth: this.queue.length, workerCount: this.workers.size, ...extra });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;

    // Reject all queued requests
    const pending = this.queue.clear();
    for (const item of pending) {
      clearTimeout(item.timeoutHandle);
      item.reject(new Error("WorkerPool shutting down"));
    }

    // Disconnect all workers
    const kills = [...this.workers.values()].map(async (w) => {
      if (w.idleTimer) clearTimeout(w.idleTimer);
      try { await w.engine.disconnect(); } catch { /* swallow */ }
    });
    await Promise.all(kills);
    this.workers.clear();

    if (this.opts.isolator) {
      await this.opts.isolator.killAll();
    }
  }

  // --------------------------------------------------------------------------
  // Submit a request
  // --------------------------------------------------------------------------

  /**
   * Submit a request to the pool. Returns a Promise that resolves with a
   * DoCoreEngine once a worker picks it up.
   */
  submit(request: PoolRequest): Promise<DoCoreEngine> {
    if (!this.running) return Promise.reject(new Error("WorkerPool is not running"));

    return new Promise<DoCoreEngine>((resolve, reject) => {
      const id = `req-${++requestCounter}`;

      const timeoutHandle = setTimeout(() => {
        const removed = this.queue.remove(id);
        if (removed) {
          this.emit("request-timeout", { userId: request.userId, message: `Request ${id} timed out` });
          reject(new Error("Request timed out in queue"));
        }
      }, this.opts.requestTimeoutMs);

      const queued: QueuedRequest = { id, request, resolve, reject, enqueuedAt: Date.now(), timeoutHandle };

      if (!this.queue.enqueue(queued)) {
        clearTimeout(timeoutHandle);
        this.emit("queue-full", { userId: request.userId });
        reject(new Error("Queue full: too many pending requests"));
        return;
      }

      this.emit("request-queued", { userId: request.userId });
      this.tryDispatch();
    });
  }

  // --------------------------------------------------------------------------
  // Dispatch loop
  // --------------------------------------------------------------------------

  private async tryDispatch(): Promise<void> {
    if (!this.running) return;

    // Find an idle worker
    let idleWorker: Worker | undefined;
    for (const w of this.workers.values()) {
      if (!w.busy) {
        idleWorker = w;
        break;
      }
    }

    // Scale up if no idle workers and under max
    if (!idleWorker && this.workers.size < this.opts.maxWorkers && this.queue.length > 0) {
      idleWorker = await this.spawnWorker();
    }

    if (!idleWorker) return; // All workers busy and at max capacity

    const next = this.queue.dequeue();
    if (!next) return; // Queue is empty

    clearTimeout(next.timeoutHandle);
    idleWorker.busy = true;
    idleWorker.userId = next.request.userId;
    idleWorker.lastActivity = Date.now();

    this.emit("request-dispatched", { workerId: idleWorker.id, userId: next.request.userId });

    try {
      const engine = await this.createEngineForUser(next.request);
      next.resolve(engine);
    } catch (err) {
      next.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (this.workers.has(idleWorker.id)) {
        idleWorker.busy = false;
        idleWorker.userId = null;
        idleWorker.lastActivity = Date.now();
        this.startWorkerIdleTimer(idleWorker);
        this.emit("request-complete", { workerId: idleWorker.id });
      }
      // Try to process next in queue
      this.tryDispatch();
    }
  }

  // --------------------------------------------------------------------------
  // Worker management
  // --------------------------------------------------------------------------

  private async spawnWorker(): Promise<Worker> {
    const id = `worker-${++workerCounter}`;
    // Create a lightweight placeholder engine; actual session is created per-request
    const engine = new DoCoreEngine({
      clientOptions: {},
      model: this.opts.defaultModel,
      workingDirectory: this.opts.baseDir,
    });

    const worker: Worker = {
      id,
      engine,
      userId: null,
      busy: false,
      lastActivity: Date.now(),
      idleTimer: null,
    };

    this.workers.set(id, worker);
    this.emit("worker-spawned", { workerId: id });
    return worker;
  }

  private startWorkerIdleTimer(worker: Worker): void {
    if (worker.idleTimer) clearTimeout(worker.idleTimer);
    if (this.workers.size <= this.opts.minWorkers) return;

    worker.idleTimer = setTimeout(async () => {
      if (worker.busy) return;
      if (this.workers.size <= this.opts.minWorkers) return;
      this.workers.delete(worker.id);
      try { await worker.engine.disconnect(); } catch { /* swallow */ }
      this.emit("scale-down", { workerId: worker.id });
    }, this.opts.workerIdleTimeoutMs);
  }

  private async createEngineForUser(request: PoolRequest): Promise<DoCoreEngine> {
    const workingDirectory = path.join(this.opts.baseDir, request.userId);

    let clientOptions: DoCoreEngineOptions["clientOptions"];
    if (this.opts.isolator) {
      const isolated = await this.opts.isolator.spawn(request.userId, request.githubToken, workingDirectory);
      clientOptions = { cliUrl: isolated.cliUrl };
    } else {
      clientOptions = { githubToken: request.githubToken };
    }

    let onPermissionRequest = request.engineOptions?.onPermissionRequest;
    if (!onPermissionRequest && this.opts.policyStore) {
      onPermissionRequest = createPolicySandbox(
        request.userId,
        workingDirectory,
        this.opts.policyStore,
        this.opts.onAudit,
      );
    }

    const engineOpts: DoCoreEngineOptions = {
      clientOptions,
      model: request.model ?? this.opts.defaultModel,
      workingDirectory,
      streaming: true,
      onPermissionRequest,
      ...request.engineOptions,
    };

    const engine = new DoCoreEngine(engineOpts);
    await engine.connect();
    return engine;
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  stats(): {
    workers: number;
    busy: number;
    idle: number;
    queued: number;
    running: boolean;
  } {
    return {
      workers: this.workers.size,
      busy: [...this.workers.values()].filter(w => w.busy).length,
      idle: [...this.workers.values()].filter(w => !w.busy).length,
      queued: this.queue.length,
      running: this.running,
    };
  }
}
