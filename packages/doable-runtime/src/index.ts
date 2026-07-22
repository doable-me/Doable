/**
 * @doable/runtime — Client SDK for generated apps (named queries, auto CRUD,
 * topics, workflow invoke). Pre-linked into projects like @doable/data.
 *
 *   import { runtime } from "@doable/runtime";
 *   const r = await runtime.queries.run("list_leads", { status: "new" });
 */

export type {
  RuntimeResult,
  QueryMeta,
  QueryMetaParam,
  WorkflowTrigger,
  WorkflowContext,
  AuthUser,
  RoleRecord,
} from "./types.js";

import type { RuntimeResult } from "./types.js";

export interface RuntimeClientOptions {
  token: string;
  baseUrl?: string;
}

const TOKEN_WAIT_MS = 5000;
const TOKEN_POLL_MS = 50;

let appSessionToken = "";

async function resolveBearer(explicit: string): Promise<string> {
  if (explicit) return explicit;
  const readGlobal = (): string =>
    ((globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] as string) || "";
  const immediate = readGlobal();
  if (immediate) return immediate;
  const deadline = Date.now() + TOKEN_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, TOKEN_POLL_MS));
    const t = readGlobal();
    if (t) return t;
  }
  return "";
}

function readSession(): string {
  return (
    appSessionToken ||
    ((globalThis as Record<string, unknown>)["__DOABLE_APP_SESSION"] as string) ||
    ""
  );
}

export class DoableRuntimeClient {
  private opts: RuntimeClientOptions;

  constructor(opts: RuntimeClientOptions = { token: "" }) {
    this.opts = opts;
  }

  readonly queries = {
    run: <T = Record<string, unknown>>(
      name: string,
      params: Record<string, unknown> = {},
    ): Promise<RuntimeResult<T>> =>
      this.call(`/__doable/queries/${encodeURIComponent(name)}`, { params }) as Promise<
        RuntimeResult<T>
      >,

    list: (): Promise<{ ok: boolean; queries: Array<{ name: string; description?: string }> }> =>
      this.callGet("/__doable/queries") as Promise<{
        ok: boolean;
        queries: Array<{ name: string; description?: string }>;
      }>,
  };

  readonly api = {
    list: <T = Record<string, unknown>>(
      table: string,
      opts: { limit?: number; offset?: number; where?: Record<string, unknown> } = {},
    ): Promise<RuntimeResult<T>> => {
      const q = new URLSearchParams();
      if (opts.limit != null) q.set("limit", String(opts.limit));
      if (opts.offset != null) q.set("offset", String(opts.offset));
      if (opts.where) q.set("where", JSON.stringify(opts.where));
      const qs = q.toString();
      return this.callGet(
        `/__doable/api/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ""}`,
      ) as Promise<RuntimeResult<T>>;
    },

    get: <T = Record<string, unknown>>(
      table: string,
      id: string,
    ): Promise<RuntimeResult<T>> =>
      this.callGet(
        `/__doable/api/v1/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
      ) as Promise<RuntimeResult<T>>,

    create: <T = Record<string, unknown>>(
      table: string,
      data: Record<string, unknown>,
    ): Promise<RuntimeResult<T>> =>
      this.call(`/__doable/api/v1/${encodeURIComponent(table)}`, data) as Promise<
        RuntimeResult<T>
      >,

    update: <T = Record<string, unknown>>(
      table: string,
      id: string,
      data: Record<string, unknown>,
    ): Promise<RuntimeResult<T>> =>
      this.call(
        `/__doable/api/v1/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
        data,
        "PATCH",
      ) as Promise<RuntimeResult<T>>,

    delete: (table: string, id: string): Promise<RuntimeResult> =>
      this.call(
        `/__doable/api/v1/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
        {},
        "DELETE",
      ),
  };

  readonly topics = {
    publish: async (name: string, payload: unknown): Promise<{ ok: boolean }> =>
      this.call(`/__doable/topics/${encodeURIComponent(name)}/publish`, { payload }) as Promise<{
        ok: boolean;
      }>,

    /**
     * Subscribe via SSE. Returns an unsubscribe function.
     * Handler receives parsed JSON events from the stream.
     */
    subscribe: (
      name: string,
      handler: (ev: unknown) => void,
    ): (() => void) => {
      const controller = new AbortController();
      void this.subscribeLoop(name, handler, controller.signal);
      return () => controller.abort();
    },
  };

  readonly workflows = {
    invoke: async (
      id: string,
      opts: { payload?: Record<string, unknown>; dryRun?: boolean } = {},
    ): Promise<{ ok: boolean; runId?: string; error?: string }> =>
      this.call(`/__doable/runtime/workflows/${encodeURIComponent(id)}/run`, {
        payload: opts.payload ?? {},
        dryRun: opts.dryRun ?? false,
      }) as Promise<{ ok: boolean; runId?: string; error?: string }>,

    getRun: async (
      runId: string,
    ): Promise<{ ok: boolean; run?: Record<string, unknown> }> =>
      this.callGet(`/__doable/runtime/runs/${encodeURIComponent(runId)}`) as Promise<{
        ok: boolean;
        run?: Record<string, unknown>;
      }>,
  };

  readonly users = {
    list: async (opts: { limit?: number; offset?: number } = {}): Promise<{
      ok: boolean;
      users: Array<Record<string, unknown>>;
    }> => {
      const q = new URLSearchParams();
      if (opts.limit != null) q.set("limit", String(opts.limit));
      if (opts.offset != null) q.set("offset", String(opts.offset));
      const qs = q.toString();
      return this.callGet(`/__doable/auth/users${qs ? `?${qs}` : ""}`) as Promise<{
        ok: boolean;
        users: Array<Record<string, unknown>>;
      }>;
    },
  };

  /** Persist app session token (same pattern as @doable/data). */
  setAppSession(token: string): void {
    appSessionToken = token;
  }

  private async subscribeLoop(
    name: string,
    handler: (ev: unknown) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const base = this.opts.baseUrl ?? "";
    const token = await resolveBearer(this.opts.token);
    try {
      const res = await fetch(
        `${base}/__doable/topics/${encodeURIComponent(name)}/subscribe`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-doable-data-api": "1",
            ...(readSession() ? { "x-doable-app-session": readSession() } : {}),
          },
          signal,
        },
      );
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            handler(JSON.parse(line.slice(5).trim()));
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch {
      /* aborted or network */
    }
  }

  private async call(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" | "DELETE" = "POST",
    retries = 3,
  ): Promise<RuntimeResult> {
    const base = this.opts.baseUrl ?? "";
    const token = await resolveBearer(this.opts.token);
    if (!token) {
      return {
        ok: false,
        rows: [],
        rowCount: 0,
        error: { code: "NO_TOKEN", message: "No __DOABLE_DATA_TOKEN available" },
      };
    }
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-doable-data-api": "1",
          ...(readSession() ? { "x-doable-app-session": readSession() } : {}),
        },
        body: method === "DELETE" && !(body && Object.keys(body as object).length)
          ? undefined
          : JSON.stringify(body ?? {}),
        credentials: "include",
      });
      if ((res.status === 401 || res.status === 503) && retries > 0) {
        await new Promise((r) => setTimeout(r, 200));
        return this.call(path, body, method, retries - 1);
      }
      const json = (await res.json()) as RuntimeResult;
      return json;
    } catch (err) {
      return {
        ok: false,
        rows: [],
        rowCount: 0,
        error: {
          code: "NETWORK",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async callGet(path: string, retries = 3): Promise<unknown> {
    const base = this.opts.baseUrl ?? "";
    const token = await resolveBearer(this.opts.token);
    if (!token) {
      return { ok: false, error: { code: "NO_TOKEN", message: "No token" } };
    }
    try {
      const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-doable-data-api": "1",
          ...(readSession() ? { "x-doable-app-session": readSession() } : {}),
        },
        credentials: "include",
      });
      if ((res.status === 401 || res.status === 503) && retries > 0) {
        await new Promise((r) => setTimeout(r, 200));
        return this.callGet(path, retries - 1);
      }
      return await res.json();
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "NETWORK",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

export function createRuntimeClient(opts?: RuntimeClientOptions): DoableRuntimeClient {
  return new DoableRuntimeClient(opts ?? { token: "" });
}

/** Lazy singleton — token from `__DOABLE_DATA_TOKEN` at call time. */
export const runtime = createRuntimeClient({ token: "" });
