/**
 * @doable/data — Per-app database client SDK.
 *
 * Lets AI-generated Vite apps query their per-project PGlite database
 * through the secure `/__doable/data/*` API surface. Zero dependencies.
 *
 * Usage:
 *   import { db } from "@doable/data";
 *   const r = await db.query<{ id: string }>("SELECT id FROM leads WHERE created_by = $1", [userId]);
 *   if (!r.ok) throw new Error(r.error?.message);
 */

export interface DataResult<T = Record<string, unknown>> {
  ok: boolean;
  rows: T[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
  truncated: boolean;
  elapsed_ms: number;
  error?: { code: string; message: string };
}

export interface DataClientOptions {
  token: string;
  baseUrl?: string;
}

/** Max time to wait for a runtime-injected token before giving up (ms). */
const TOKEN_WAIT_MS = 5000;
/** Poll interval while waiting for the token global to be populated (ms). */
const TOKEN_POLL_MS = 50;

export class DoableDataClient {
  private opts: DataClientOptions;

  constructor(opts: DataClientOptions) {
    this.opts = opts;
  }

  /**
   * Resolve the auth token. Reads the constructor token first, then the global
   * `__DOABLE_DATA_TOKEN` that the connector bridge populates at runtime.
   *
   * The bridge delivers the token asynchronously (postMessage round-trip in the
   * editor iframe, fetch in standalone), so an app's on-mount query can fire
   * before the token lands. When that happens this method waits — bounded to
   * TOKEN_WAIT_MS — for the global to appear instead of sending an empty Bearer.
   *
   * Fast path: when a token is already present (constructor or global), it
   * returns synchronously-resolved with zero added latency. SSR/no-window safe:
   * if there is no global object the loop simply times out and returns "".
   */
  private async resolveToken(): Promise<string> {
    if (this.opts.token) return this.opts.token;

    const readGlobal = (): string =>
      ((globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] as string) || "";

    const immediate = readGlobal();
    if (immediate) return immediate;

    // Token not here yet — bounded poll for the bridge to inject it.
    const deadline = Date.now() + TOKEN_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, TOKEN_POLL_MS));
      const t = readGlobal();
      if (t) return t;
    }
    return "";
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    opts: { row_cap?: number; timeout_ms?: number } = {},
  ): Promise<DataResult<T>> {
    return this.call("/__doable/data/query", { sql, params, ...opts }) as Promise<DataResult<T>>;
  }

  exec(): never {
    throw new Error("[doable.data] db.exec() is server-only — call from MCP, not the app.");
  }

  async schema(): Promise<DataResult> {
    return this.call("/__doable/data/schema", {});
  }

  private async call(
    path: string,
    body: unknown,
    retries = 3,
    triedTokenRefresh = false,
  ): Promise<DataResult> {
    // Resolve token, awaiting a bounded window for the bridge to inject it so an
    // on-mount query doesn't race the (async) token arrival and send an empty
    // Bearer. No-op when a token is already present.
    const token = await this.resolveToken();

    const res = await fetch(`${this.opts.baseUrl ?? ""}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "x-doable-data-api": "1",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 503 && retries > 0) {
      await new Promise<void>((r) => setTimeout(r, (4 - retries) * 250));
      return this.call(path, body, retries - 1, triedTokenRefresh);
    }

    // If we sent an empty token (token arrived after resolveToken gave up) or
    // the server rejected an in-flight/expired token with 401, re-resolve once
    // and retry — by now the bridge has very likely populated the global.
    if (
      !triedTokenRefresh &&
      (res.status === 401 || token === "") &&
      this.opts.token === ""
    ) {
      const fresh = await this.resolveToken();
      if (fresh && fresh !== token) {
        return this.call(path, body, retries, true);
      }
    }

    return res.json() as Promise<DataResult>;
  }
}

export function createDataClient(opts: DataClientOptions): DoableDataClient {
  return new DoableDataClient(opts);
}

/**
 * Default lazily-bound client. Token is read from globalThis.__DOABLE_DATA_TOKEN
 * at each call, so a token injected after import still works.
 */
export const db = new DoableDataClient({
  token: "",
});
