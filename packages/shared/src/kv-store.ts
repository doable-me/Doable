/**
 * Simple key-value store abstraction.
 * Defaults to in-memory; swap to Redis by setting REDIS_URL in the environment.
 */

// ─── Interface ──────────────────────────────────────────

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Increment a numeric value, returning the new count. Initialises to 0 if missing. */
  incr(key: string, ttlMs?: number): Promise<number>;
  close(): Promise<void>;
}

// ─── In-Memory Implementation ───────────────────────────

interface MemEntry {
  value: unknown;
  expiresAt: number | null;
}

class MemoryStore implements KVStore {
  private data = new Map<string, MemEntry>();
  private timer: ReturnType<typeof setInterval>;

  constructor() {
    this.timer = setInterval(() => this.sweep(), 30_000);
    if (this.timer.unref) this.timer.unref();
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const existing = await this.get<number>(key);
    const next = (existing ?? 0) + 1;
    await this.set(key, next, ttlMs);
    return next;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    this.data.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.data.delete(key);
      }
    }
  }
}

// ─── Redis Implementation ───────────────────────────────

class RedisStore implements KVStore {
  // Lazy-loaded ioredis client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private ready: Promise<void>;

  constructor(url: string) {
    this.ready = this.connect(url);
  }

  private async connect(url: string): Promise<void> {
    // Dynamic import so ioredis is only needed when REDIS_URL is set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("ioredis" as string);
    const Redis = mod.default ?? mod;
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    await new Promise<void>((resolve, reject) => {
      this.client.once("ready", resolve);
      this.client.once("error", reject);
    });
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    await this.ready;
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.ready;
    const serialized = JSON.stringify(value);
    if (ttlMs) {
      await this.client.set(key, serialized, "PX", ttlMs);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    await this.client.del(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    await this.ready;
    const count = await this.client.incr(key);
    if (ttlMs && count === 1) {
      await this.client.pexpire(key, ttlMs);
    }
    return count;
  }

  async close(): Promise<void> {
    await this.ready;
    await this.client.quit();
  }
}

// ─── Singleton Factory ──────────────────────────────────

let instance: KVStore | null = null;

/**
 * Get the shared KV store instance.
 * Uses Redis if `REDIS_URL` is set, otherwise falls back to in-memory.
 */
export function getKVStore(): KVStore {
  if (!instance) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      console.log("[kv] Using Redis store");
      instance = new RedisStore(redisUrl);
    } else {
      console.log("[kv] Using in-memory store (set REDIS_URL for Redis)");
      instance = new MemoryStore();
    }
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetKVStore(): void {
  instance?.close().catch(() => {});
  instance = null;
}
