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

export class DoableDataClient {
  private opts: DataClientOptions;

  constructor(opts: DataClientOptions) {
    this.opts = opts;
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

  private async call(path: string, body: unknown, retries = 3): Promise<DataResult> {
    // Resolve token lazily: if the stored token is empty, read from globalThis at call time
    // so a token injected after import still works.
    const token = this.opts.token || ((globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] as string) || "";

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
      return this.call(path, body, retries - 1);
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
