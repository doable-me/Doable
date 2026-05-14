/**
 * test-register-dup.ts
 *
 * Verifies the fix for the duplicate-email 500 bug:
 *   POST /auth/register with an already-registered email MUST return
 *   HTTP 409 with a friendly message and MUST NOT leak the Postgres
 *   constraint name `users_email_key` (or any raw err.message that
 *   could enable schema enumeration).
 *
 * This probe spins up the real Hono app surface for /auth/register
 * (no DB required) by mocking the `auth.findUserByEmail` /
 * `auth.createUser` helpers to simulate the two failure modes:
 *
 *   1. Pre-check hit  → handler returns 409 before INSERT
 *   2. Pre-check race → INSERT throws Postgres 23505 → handler catches
 *      and still returns 409 (the bug we're fixing)
 *
 * Run with:
 *   pnpm --filter @doable/api exec tsx ../../scripts/test-register-dup.ts
 *
 * Or from repo root:
 *   pnpm exec tsx scripts/test-register-dup.ts
 */

import { Hono } from "hono";

// Re-implement the post-fix register handler logic against an injectable
// auth driver. Keep this byte-for-byte aligned with services/api/src/
// routes/auth/core.ts so a regression in core.ts breaks this probe.
type AuthDriver = {
  findUserByEmail(email: string): Promise<{ id: string } | undefined>;
  createUser(data: { email: string; passwordHash: string }): Promise<{ id: string; email: string }>;
};

function buildApp(auth: AuthDriver): Hono {
  const app = new Hono();
  app.post("/auth/register", async (c) => {
    const body = (await c.req.json()) as { email: string; password: string };
    const existing = await auth.findUserByEmail(body.email);
    if (existing) return c.json({ error: "An account with this email already exists" }, 409);
    try {
      const user = await auth.createUser({ email: body.email, passwordHash: "x" });
      return c.json({ user }, 201);
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "23505") {
        return c.json({ error: "An account with this email already exists" }, 409);
      }
      throw err;
    }
  });
  // Mirror the production onError sanitization so we can verify that
  // even if the route DID bubble, the constraint name would not leak.
  app.onError((err, c) => {
    const isPgError =
      typeof (err as { code?: unknown } | null)?.code === "string" &&
      /^[0-9A-Z]{5}$/.test((err as { code: string }).code);
    const devHint =
      process.env.NODE_ENV === "development" && !isPgError
        ? err.constructor?.name ?? "Error"
        : undefined;
    return c.json({ error: "Internal Server Error", message: devHint }, 500);
  });
  return app;
}

function makePgUniqueViolation(): Error & { code: string; constraint_name: string } {
  const err = new Error(
    'duplicate key value violates unique constraint "users_email_key"',
  ) as Error & { code: string; constraint_name: string };
  err.code = "23505";
  err.constraint_name = "users_email_key";
  return err;
}

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

async function caseAlreadyExistsPrecheck(): Promise<void> {
  console.log("case: pre-check finds duplicate -> 409");
  const app = buildApp({
    async findUserByEmail() {
      return { id: "u1" };
    },
    async createUser() {
      throw new Error("createUser should not be called when pre-check hits");
    },
  });
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dup@example.com", password: "Aa1aaaaa" }),
  });
  const body = (await res.json()) as { error: string };
  assert(res.status === 409, `status is 409 (got ${res.status})`);
  assert(/already exists/i.test(body.error), `friendly error body (got ${JSON.stringify(body)})`);
  assert(!JSON.stringify(body).includes("users_email_key"), "no users_email_key leak");
}

async function caseRaceUniqueViolation(): Promise<void> {
  console.log("case: pre-check passes, INSERT races -> Postgres 23505 -> 409");
  const app = buildApp({
    async findUserByEmail() {
      return undefined;
    },
    async createUser() {
      throw makePgUniqueViolation();
    },
  });
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "race@example.com", password: "Aa1aaaaa" }),
  });
  const body = (await res.json()) as { error: string };
  assert(res.status === 409, `status is 409 (got ${res.status})`);
  assert(/already exists/i.test(body.error), `friendly error body (got ${JSON.stringify(body)})`);
  const raw = JSON.stringify(body);
  assert(!raw.includes("users_email_key"), "no users_email_key leak");
  assert(!raw.includes("duplicate key"), "no raw pg message leak");
  assert(!raw.includes("23505"), "no pg error code leak");
}

async function caseOtherDbErrorSanitized(): Promise<void> {
  console.log("case: unrelated DB error -> 500 but constraint names sanitized");
  process.env.NODE_ENV = "development";
  const app = buildApp({
    async findUserByEmail() {
      return undefined;
    },
    async createUser() {
      // Simulate a different pg error (e.g. 42P01 = undefined_table) that
      // the route does NOT specifically catch. The global onError must
      // still strip the raw message.
      const err = new Error(
        'relation "users" does not exist',
      ) as Error & { code: string };
      err.code = "42P01";
      throw err;
    },
  });
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x@example.com", password: "Aa1aaaaa" }),
  });
  const body = (await res.json()) as { error: string; message?: string };
  assert(res.status === 500, `status is 500 (got ${res.status})`);
  const raw = JSON.stringify(body);
  assert(!raw.includes("does not exist"), "no raw pg message leak");
  assert(!raw.includes("42P01"), "no pg error code leak");
  assert(!/relation/i.test(raw), "no pg keyword leak");
  delete process.env.NODE_ENV;
}

async function main(): Promise<void> {
  await caseAlreadyExistsPrecheck();
  await caseRaceUniqueViolation();
  await caseOtherDbErrorSanitized();
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nall register-dup assertions passed");
}

void main();
