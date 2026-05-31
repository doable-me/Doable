/**
 * @doable/data — Per-app database + end-user auth client SDK.
 *
 * Lets AI-generated Vite apps query their per-project PGlite database and
 * authenticate their OWN end-users through the secure `/__doable/*` API surface.
 * Zero dependencies.
 *
 * Data usage:
 *   import { db } from "@doable/data";
 *   const r = await db.query<{ id: string }>("SELECT id FROM leads", []);
 *   if (!r.ok) throw new Error(r.error?.message);
 *
 * End-user auth usage (a generated app's OWN customers/users — NOT the Doable
 * platform account). Passwords are hashed + verified server-side; the app never
 * sees a hash and never needs a credentials table. The logged-in user is set
 * automatically as the identity for db.query, so owner-scoped rows
 * (created_by = current_setting('app.user_id')) isolate per end-user:
 *   import { db } from "@doable/data";
 *   await db.auth.signup({ email, password, name });   // logs in + persists (cookie)
 *   await db.auth.login({ email, password });
 *   const me = await db.auth.getUser();                 // null when signed out
 *   await db.auth.logout();
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

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  /** True for an admin end-user (the first to sign up) — may use db.admin.query. */
  isAdmin?: boolean;
}
export interface AuthResult {
  ok: boolean;
  user?: AuthUser | null;
  token?: string;
  error?: string;
  message?: string;
}

/** Max time to wait for a runtime-injected token before giving up (ms). */
const TOKEN_WAIT_MS = 5000;
/** Poll interval while waiting for the token global to be populated (ms). */
const TOKEN_POLL_MS = 50;

/**
 * In-memory app end-user session token (set by db.auth.login/signup). Sent as
 * `x-doable-app-session` on data calls so per-user RLS scopes to the logged-in
 * end-user. The HttpOnly session cookie that /__doable/auth sets is the DURABLE
 * copy: it rides credentialed requests after a page reload even though this
 * module-level variable resets — so "stay logged in" survives a refresh.
 */
let appSessionToken = "";

/**
 * Resolve the connector bearer token: an explicit constructor token, else the
 * global `__DOABLE_DATA_TOKEN` the bridge injects (possibly asynchronously, so a
 * bounded poll avoids racing an on-mount call against token arrival).
 */
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

export class DoableDataClient {
  private opts: DataClientOptions;
  /** End-user authentication for the app's OWN users. */
  readonly auth: DoableAuthClient;

  constructor(opts: DataClientOptions) {
    this.opts = opts;
    this.auth = new DoableAuthClient(opts);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    opts: { row_cap?: number; timeout_ms?: number } = {},
  ): Promise<DataResult<T>> {
    return this.call("/__doable/data/query", { sql, params, ...opts }) as Promise<DataResult<T>>;
  }

  /**
   * Admin (cross-user) READ for owner/admin dashboards. Returns rows across ALL
   * end-users, bypassing per-user RLS — but ONLY when the signed-in user is an
   * admin (db.auth.getUser() → user.isAdmin === true); otherwise the server
   * rejects it. SELECT-only. Use for "all orders", "today's bookings", etc.
   */
  async adminQuery<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    opts: { row_cap?: number; timeout_ms?: number } = {},
  ): Promise<DataResult<T>> {
    return this.call("/__doable/data/query", { sql, params, ...opts }, 3, false, true) as Promise<DataResult<T>>;
  }

  /** Admin namespace: `db.admin.query(sql, params)` (see adminQuery). */
  get admin(): { query: DoableDataClient["adminQuery"] } {
    return { query: this.adminQuery.bind(this) };
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
    admin = false,
  ): Promise<DataResult> {
    const token = await resolveBearer(this.opts.token);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "x-doable-data-api": "1",
    };
    // Thread the logged-in end-user's identity so RLS scopes to them. The header
    // covers same-tab calls; `credentials: "include"` rides the session COOKIE so
    // the identity also survives a page reload (when appSessionToken is reset).
    if (appSessionToken) headers["x-doable-app-session"] = appSessionToken;
    // Request an elevated cross-user read (server honours it only for admins).
    if (admin) headers["x-doable-admin"] = "1";

    const res = await fetch(`${this.opts.baseUrl ?? ""}${path}`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (res.status === 503 && retries > 0) {
      await new Promise<void>((r) => setTimeout(r, (4 - retries) * 250));
      return this.call(path, body, retries - 1, triedTokenRefresh, admin);
    }

    if (
      !triedTokenRefresh &&
      (res.status === 401 || token === "") &&
      this.opts.token === ""
    ) {
      const fresh = await resolveBearer(this.opts.token);
      if (fresh && fresh !== token) {
        return this.call(path, body, retries, true, admin);
      }
    }

    return res.json() as Promise<DataResult>;
  }
}

/**
 * End-user auth client (`db.auth`). Talks to /__doable/auth/* with the connector
 * bearer + credentials so the session cookie is set/sent. signup/login stash the
 * returned token in `appSessionToken` for the header path; the cookie persists it.
 */
export class DoableAuthClient {
  constructor(private opts: DataClientOptions) {}

  private async req(path: string, body?: unknown): Promise<AuthResult> {
    const token = await resolveBearer(this.opts.token);
    const res = await fetch(`${this.opts.baseUrl ?? ""}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    try {
      return (await res.json()) as AuthResult;
    } catch {
      return { ok: false, error: "NETWORK", message: "Auth request failed." };
    }
  }

  /** Create an account (and sign in). Returns { ok, user } or { ok:false, error }. */
  async signup(p: { email: string; password: string; name?: string }): Promise<AuthResult> {
    const r = await this.req("/__doable/auth/signup", p);
    if (r.ok && r.token) appSessionToken = r.token;
    return r;
  }

  /** Sign in an existing user. */
  async login(p: { email: string; password: string }): Promise<AuthResult> {
    const r = await this.req("/__doable/auth/login", p);
    if (r.ok && r.token) appSessionToken = r.token;
    return r;
  }

  /** Sign out (clears the session cookie + in-memory token). */
  async logout(): Promise<void> {
    await this.req("/__doable/auth/logout", {});
    appSessionToken = "";
  }

  /**
   * The currently signed-in end-user. Returns the SAME envelope shape as
   * signup/login ({ ok, user }) for consistency — `user` is null when signed
   * out. Works across reloads via the session cookie.
   */
  async getUser(): Promise<{ ok: boolean; user: AuthUser | null }> {
    const r = await this.req("/__doable/auth/me");
    return { ok: r.ok !== false, user: r.ok && r.user ? r.user : null };
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
