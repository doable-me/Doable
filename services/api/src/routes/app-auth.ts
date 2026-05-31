/**
 * Per-app end-user authentication for generated apps (`/__doable/auth/*`).
 *
 * Generated apps frequently need their OWN end-user accounts (a salon's
 * customers, a SaaS's users) — distinct from the Doable platform account that
 * built the app. Before this, the AI had to roll its own password table in the
 * per-app DB, which forced two bad outcomes:
 *   1. The credentials table had to be `public_read` so login could verify a
 *      password BEFORE the user was authenticated → every email + password hash
 *      was world-readable.
 *   2. Sessions could not persist (localStorage/sessionStorage are sandbox-
 *      blocked) so "stay logged in" broke on reload.
 *
 * This primitive fixes both. Credentials live in the platform's MAIN Postgres
 * (table `app_end_users`), never in the per-app DB and never reachable by app
 * code. Hashing/verification (argon2id) happen server-side here, so the app
 * never sees a hash. On success we mint a project-bound session JWT and set it
 * as a cookie on the preview/runtime origin (survives reload) AND return it so
 * the SDK can also send it as `x-doable-app-session`. The data plane
 * (app-data.ts `appUserId`) trusts ONLY this signed, project-bound token to set
 * `app.user_id`, so per-user RLS finally scopes to the app's authenticated
 * end-user — the credentials table stays private.
 *
 * Security invariants:
 *   - projectId comes from resolveAuth (the connector credential), NEVER the body.
 *   - The session token is bound to {projectId, sub} and signed with JWT_SECRET;
 *     it can only ever assert its own end-user, so it is safe to honour in the
 *     RLS identity path (a forged/cross-project token fails verification).
 *   - Password hashes never leave this module.
 */
import { Hono, type Context } from "hono";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { sql } from "../db/index.js";
import { resolveAuth } from "./connector-proxy.js";
import { JWT_SECRET as JWT_SECRET_RAW } from "../lib/secrets.js";

export const appAuthRoutes = new Hono({ strict: false });

const SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = "doable_app_session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ARGON_OPTS = { type: argon2.argon2id } as const;

interface AppSessionClaims {
  sub: string; // app end-user id
  projectId: string;
  email: string;
  name?: string;
  adm?: boolean; // admin: may run elevated (cross-user) reads for dashboards
  kind: "app-session";
}

let tableReady: Promise<void> | null = null;
/** Lazily ensure the platform-side credential table exists (idempotent). */
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await sql/* sql */ `
        CREATE TABLE IF NOT EXISTS app_end_users (
          id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id    uuid NOT NULL,
          email         text NOT NULL,
          name          text,
          password_hash text NOT NULL,
          is_admin      boolean NOT NULL DEFAULT false,
          created_at    timestamptz NOT NULL DEFAULT now(),
          UNIQUE (project_id, email)
        )`;
      // Additive for installs whose table predates the admin column.
      await sql`ALTER TABLE app_end_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`;
    })().catch((e) => {
      tableReady = null; // allow retry on next request
      throw e;
    });
  }
  return tableReady;
}

async function signSession(claims: Omit<AppSessionClaims, "kind">): Promise<string> {
  return new SignJWT({ ...claims, adm: claims.adm === true, kind: "app-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .setSubject(claims.sub)
    .sign(SECRET);
}

/** Verify an app-session token and confirm it belongs to `projectId`. */
export async function verifyAppSession(
  token: string,
  projectId: string,
): Promise<AppSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.kind !== "app-session") return null;
    if (payload.projectId !== projectId) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return payload as unknown as AppSessionClaims;
  } catch {
    return null;
  }
}

function setSessionCookie(c: Context, token: string): void {
  // SameSite=None;Secure so the cookie rides along inside the cross-origin
  // preview iframe and on credentialed data calls; HttpOnly keeps app JS from
  // reading the raw token (the SDK uses the returned token for the header path).
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`,
    { append: true },
  );
}
function clearSessionCookie(c: Context): void {
  c.header(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`,
    { append: true },
  );
}

function readCookie(c: Context, name: string): string | undefined {
  const m = (c.req.header("Cookie") ?? "").match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return m?.[1];
}

/** Read the app-session token from the header (SDK path) or cookie (reload path). */
export function readAppSessionToken(c: Context): string | undefined {
  const h = c.req.header("x-doable-app-session");
  if (h) return h.trim();
  return readCookie(c, COOKIE_NAME);
}

async function projectIdFromAuth(c: Context): Promise<string | Response> {
  const auth = await resolveAuth(c);
  if (auth instanceof Response) return auth;
  return auth.projectId;
}

// ─── POST /__doable/auth/signup ──────────────────────────────────────────────
appAuthRoutes.post("/__doable/auth/signup", async (c) => {
  const pid = await projectIdFromAuth(c);
  if (pid instanceof Response) return pid;
  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { body = {}; }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = body.name != null ? String(body.name).slice(0, 200) : null;
  if (!EMAIL_RE.test(email)) return c.json({ ok: false, error: "INVALID_EMAIL" }, 400);
  if (password.length < 8) return c.json({ ok: false, error: "WEAK_PASSWORD", message: "Password must be at least 8 characters." }, 400);

  await ensureTable();
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM app_end_users WHERE project_id = ${pid} AND email = ${email} LIMIT 1`;
  if (existing.length) return c.json({ ok: false, error: "EMAIL_TAKEN", message: "An account with this email already exists." }, 409);

  // The FIRST user to sign up for a project becomes admin (the business owner who
  // sets the app up) — so an admin dashboard has someone who can read across users.
  // Subsequent users are non-admin. (An app can later flag others via a server key.)
  const countRows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM app_end_users WHERE project_id = ${pid}`;
  const isAdmin = (countRows[0]?.n ?? 0) === 0;

  const password_hash = await argon2.hash(password, ARGON_OPTS);
  const id = randomUUID();
  await sql`
    INSERT INTO app_end_users (id, project_id, email, name, password_hash, is_admin)
    VALUES (${id}, ${pid}, ${email}, ${name}, ${password_hash}, ${isAdmin})`;

  const token = await signSession({ sub: id, projectId: pid, email, name: name ?? undefined, adm: isAdmin });
  setSessionCookie(c, token);
  return c.json({ ok: true, token, user: { id, email, name, isAdmin } });
});

// ─── POST /__doable/auth/login ───────────────────────────────────────────────
appAuthRoutes.post("/__doable/auth/login", async (c) => {
  const pid = await projectIdFromAuth(c);
  if (pid instanceof Response) return pid;
  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { body = {}; }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return c.json({ ok: false, error: "INVALID_CREDENTIALS" }, 400);

  await ensureTable();
  const [row] = await sql<{ id: string; name: string | null; password_hash: string; is_admin: boolean }[]>`
    SELECT id, name, password_hash, is_admin FROM app_end_users
    WHERE project_id = ${pid} AND email = ${email} LIMIT 1`;
  // Always run a verify (even with a dummy hash) to blunt user-enumeration timing.
  const hash = row?.password_hash ?? "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  let ok = false;
  try { ok = await argon2.verify(hash, password); } catch { ok = false; }
  if (!row || !ok) return c.json({ ok: false, error: "INVALID_CREDENTIALS", message: "Incorrect email or password." }, 401);

  const token = await signSession({ sub: row.id, projectId: pid, email, name: row.name ?? undefined, adm: row.is_admin === true });
  setSessionCookie(c, token);
  return c.json({ ok: true, token, user: { id: row.id, email, name: row.name, isAdmin: row.is_admin === true } });
});

// ─── GET /__doable/auth/me ───────────────────────────────────────────────────
appAuthRoutes.get("/__doable/auth/me", async (c) => {
  const pid = await projectIdFromAuth(c);
  if (pid instanceof Response) return pid;
  const token = readAppSessionToken(c);
  if (!token) return c.json({ ok: true, user: null });
  const claims = await verifyAppSession(token, pid);
  if (!claims) return c.json({ ok: true, user: null });
  return c.json({ ok: true, user: { id: claims.sub, email: claims.email, name: claims.name ?? null, isAdmin: claims.adm === true } });
});

// ─── POST /__doable/auth/logout ──────────────────────────────────────────────
appAuthRoutes.post("/__doable/auth/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});
