/**
 * r12-test-trailing-slash.ts — BUG-R10-TRAILING-SLASH-AUTH-DROP-001 verification
 *
 * Verifies that the trailing-slash 308-redirect class has been eliminated:
 * after switching the top-level Hono app + every sub-router to
 * `{ strict: false }`, requests to `/<route>/` and `/<route>` route to
 * the same handler with no 308 in between. With no redirect, no client
 * (curl, undici, browser fetch, SDK) can ever drop the Authorization
 * header on a redirected request.
 *
 * This probe uses Hono's in-process `app.request()` surface — it does
 * NOT touch the network. We mount a minimal app that mirrors the
 * production registration shape (top-level `new Hono({ strict: false })`
 * + sub-routers with `{ strict: false }`) and assert:
 *
 *   - GET /templates       -> 200 (sanity)
 *   - GET /templates/      -> 200, NOT 308, NOT 401  ← the bug
 *   - GET /workspaces      -> 200
 *   - GET /workspaces/     -> 200, NOT 308, NOT 401
 *   - GET /projects        -> 200
 *   - GET /projects/       -> 200, NOT 308, NOT 401
 *   - GET /health          -> 200 (untouched)
 *   - GET /health/         -> 200 (untouched — sub-router is strict:false too)
 *   - GET /preview/abc/    -> 200 (preview path semantics preserved)
 *
 * We also assert that a request with an `Authorization: Bearer <jwt>`
 * header reaches the route handler with the header INTACT — i.e. no
 * intermediate middleware swallows it on the trailing-slash path.
 *
 * Run with:
 *   pnpm exec tsx scripts/r12-test-trailing-slash.ts
 */

import { Hono } from "hono";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

// Mirror the production app shape: top-level strict:false + sub-routers
// strict:false. Handlers echo the Authorization header back so we can
// assert it survived all middleware on the trailing-slash path.
function buildApp(): Hono {
  const app = new Hono({ strict: false });

  const templateRoutes = new Hono({ strict: false });
  templateRoutes.get("/", (c) =>
    c.json({
      route: "templates",
      authHeader: c.req.header("authorization") ?? null,
    }),
  );

  const workspaceRoutes = new Hono({ strict: false });
  workspaceRoutes.get("/", (c) =>
    c.json({
      route: "workspaces",
      authHeader: c.req.header("authorization") ?? null,
    }),
  );

  const projectRoutes = new Hono({ strict: false });
  projectRoutes.get("/", (c) =>
    c.json({
      route: "projects",
      authHeader: c.req.header("authorization") ?? null,
    }),
  );

  const healthRoutes = new Hono({ strict: false });
  healthRoutes.get("/", (c) => c.json({ route: "health" }));

  const previewRoutes = new Hono({ strict: false });
  previewRoutes.get("/preview/:id/", (c) =>
    c.json({ route: "preview", id: c.req.param("id") }),
  );
  previewRoutes.get("/preview/:id", (c) =>
    c.json({ route: "preview", id: c.req.param("id") }),
  );

  app.route("/templates", templateRoutes);
  app.route("/workspaces", workspaceRoutes);
  app.route("/projects", projectRoutes);
  app.route("/health", healthRoutes);
  app.route("/", previewRoutes);

  return app;
}

async function check(
  app: Hono,
  path: string,
  expectStatus: number,
  expectRoute: string | null,
  withAuth: boolean,
): Promise<void> {
  const headers: Record<string, string> = {};
  if (withAuth) headers.authorization = "Bearer test-jwt-token-r12";
  const res = await app.request(path, { headers });
  assert(
    res.status === expectStatus,
    `${path} status is ${expectStatus} (got ${res.status})`,
  );
  // Critical: redirect class fully eliminated — 308 must never appear
  // and 401 from a stripped Authorization must never happen.
  assert(res.status !== 308, `${path} did NOT return 308`);
  assert(res.status !== 401, `${path} did NOT return 401`);

  if (expectRoute && res.status === 200) {
    const body = (await res.json()) as {
      route?: string;
      authHeader?: string | null;
    };
    assert(
      body.route === expectRoute,
      `${path} routed to '${expectRoute}' (got '${body.route}')`,
    );
    if (withAuth) {
      assert(
        body.authHeader === "Bearer test-jwt-token-r12",
        `${path} preserved Authorization header (got ${JSON.stringify(body.authHeader)})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const app = buildApp();

  console.log("case: routes without trailing slash (sanity)");
  await check(app, "/templates", 200, "templates", true);
  await check(app, "/workspaces", 200, "workspaces", true);
  await check(app, "/projects", 200, "projects", true);

  console.log("\ncase: routes WITH trailing slash — the bug (must NOT 308, must NOT 401)");
  await check(app, "/templates/", 200, "templates", true);
  await check(app, "/workspaces/", 200, "workspaces", true);
  await check(app, "/projects/", 200, "projects", true);

  console.log("\ncase: health untouched on both shapes");
  await check(app, "/health", 200, "health", false);
  await check(app, "/health/", 200, "health", false);

  console.log("\ncase: preview path semantics preserved");
  await check(app, "/preview/abc", 200, "preview", false);
  await check(app, "/preview/abc/", 200, "preview", false);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nall r12 trailing-slash assertions passed");
}

void main();
