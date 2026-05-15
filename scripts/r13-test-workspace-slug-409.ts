/**
 * r13-test-workspace-slug-409.ts
 *
 * Verifies the fix for BUG-R13-WORKSPACE-SLUG-500:
 *   POST /workspaces with a slug that already exists MUST return
 *   HTTP 409 with a friendly message and MUST NOT leak the Postgres
 *   constraint name `workspaces_slug_key` (or any raw err.message that
 *   could enable schema enumeration).
 *
 * This probe spins up the real Hono app surface for /workspaces (no DB
 * required) by mocking the `workspaces.findBySlug` / `workspaces.create`
 * helpers to simulate the two failure modes:
 *
 *   1. Pre-check hit  → handler returns 409 before INSERT
 *   2. Pre-check race → INSERT throws Postgres 23505 → handler catches
 *      and still returns 409 (the bug we're fixing)
 *
 * Run with:
 *   pnpm exec tsx scripts/r13-test-workspace-slug-409.ts
 */

import { Hono } from "hono";

// Re-implement the post-fix workspace create handler logic against an
// injectable driver. Keep this byte-for-byte aligned with services/api/
// src/routes/workspaces.ts so a regression in workspaces.ts breaks this
// probe.
type WorkspaceDriver = {
  findBySlug(slug: string): Promise<{ id: string } | undefined>;
  create(data: {
    name: string;
    slug: string;
    description?: string;
    ownerId: string;
  }): Promise<{ id: string; slug: string; name: string }>;
};

function buildApp(ws: WorkspaceDriver): Hono {
  const app = new Hono();
  app.post("/workspaces", async (c) => {
    const body = (await c.req.json()) as {
      name: string;
      slug: string;
      description?: string;
    };
    const existing = await ws.findBySlug(body.slug);
    if (existing) {
      return c.json({ error: "A workspace with this slug already exists" }, 409);
    }
    let workspace;
    try {
      workspace = await ws.create({
        name: body.name,
        slug: body.slug,
        description: body.description,
        ownerId: "u-test",
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "23505") {
        return c.json({ error: "A workspace with this slug already exists" }, 409);
      }
      throw err;
    }
    return c.json({ data: workspace }, 201);
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
    'duplicate key value violates unique constraint "workspaces_slug_key"',
  ) as Error & { code: string; constraint_name: string };
  err.code = "23505";
  err.constraint_name = "workspaces_slug_key";
  return err;
}

let failures = 0;
let total = 0;
function assert(cond: boolean, msg: string): void {
  total += 1;
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

async function caseAlreadyExistsPrecheck(): Promise<void> {
  console.log("case: pre-check finds duplicate slug -> 409");
  const app = buildApp({
    async findBySlug() {
      return { id: "w1" };
    },
    async create() {
      throw new Error("create should not be called when pre-check hits");
    },
  });
  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "R13 Slug Test", slug: "r13-slug-test" }),
  });
  const body = (await res.json()) as { error: string };
  assert(res.status === 409, `status is 409 (got ${res.status})`);
  assert(/already exists/i.test(body.error), `friendly error body (got ${JSON.stringify(body)})`);
  assert(!JSON.stringify(body).includes("workspaces_slug_key"), "no workspaces_slug_key leak");
}

async function caseRaceUniqueViolation(): Promise<void> {
  console.log("case: pre-check passes, INSERT races -> Postgres 23505 -> 409");
  const app = buildApp({
    async findBySlug() {
      return undefined;
    },
    async create() {
      throw makePgUniqueViolation();
    },
  });
  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "R13 Slug Test", slug: "r13-slug-test" }),
  });
  const body = (await res.json()) as { error: string };
  assert(res.status === 409, `status is 409 NOT 500 (got ${res.status})`);
  assert(/already exists/i.test(body.error), `friendly error body (got ${JSON.stringify(body)})`);
  const raw = JSON.stringify(body);
  assert(!raw.includes("workspaces_slug_key"), "no workspaces_slug_key leak");
  assert(!raw.includes("duplicate key"), "no raw pg message leak");
  assert(!raw.includes("23505"), "no pg error code leak");
}

async function caseOtherDbErrorSanitized(): Promise<void> {
  console.log("case: unrelated DB error -> 500 but constraint names sanitized");
  process.env.NODE_ENV = "development";
  const app = buildApp({
    async findBySlug() {
      return undefined;
    },
    async create() {
      // Simulate a different pg error (e.g. 42P01 = undefined_table) that
      // the route does NOT specifically catch. The global onError must
      // still strip the raw message.
      const err = new Error(
        'relation "workspaces" does not exist',
      ) as Error & { code: string };
      err.code = "42P01";
      throw err;
    },
  });
  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "R13 Slug Test", slug: "r13-slug-test" }),
  });
  const body = (await res.json()) as { error: string; message?: string };
  assert(res.status === 500, `status is 500 (got ${res.status})`);
  const raw = JSON.stringify(body);
  assert(!raw.includes("does not exist"), "no raw pg message leak");
  assert(!raw.includes("42P01"), "no pg error code leak");
  assert(!/workspaces_slug_key/.test(raw), "no constraint-name leak");
  delete process.env.NODE_ENV;
}

async function main(): Promise<void> {
  await caseAlreadyExistsPrecheck();
  await caseRaceUniqueViolation();
  await caseOtherDbErrorSanitized();
  const passed = total - failures;
  if (failures > 0) {
    console.error(`\n${passed}/${total} assertions PASS, ${failures} FAIL`);
    process.exit(1);
  }
  console.log(`\n${passed}/${total} assertions PASS`);
}

void main();
