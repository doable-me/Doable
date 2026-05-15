/**
 * Ralph R10 — parameterized API matrix harness.
 *
 * Goal: yield 1000+ HTTP assertions against the running API by combining
 * routes × auth states × payload classes × negative-case probes.
 *
 * Usage:
 *   BASE_URL=https://dev-api.doable.me \
 *   QA_PASSWORD=TestPass123! \
 *   pnpm exec tsx scripts/r10-api-matrix.ts
 *
 * Optional env:
 *   CONCURRENCY (default 6) — parallel workers
 *   MATRIX_TIMEOUT_MS (default 10000) — per-request timeout
 *   ANON_ONLY=1 — skip login step (run anon-only assertions; useful for triage)
 *   ROUTES_ONLY=auth,billing,... — comma list to filter route groups
 *   OUTPUT_DIR (default testcases/evidence/dev/matrix) — where JSONL+CSV go
 *
 * Output:
 *   <OUTPUT_DIR>/r10-matrix-<ISO>.jsonl   — one row per assertion
 *   <OUTPUT_DIR>/r10-summary.csv          — flat summary
 *   <OUTPUT_DIR>/r10-failures.json        — UNEXPECTED + 5xx
 *   <OUTPUT_DIR>/r10-failures-by-route.md — markdown tally
 */

import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = (process.env.BASE_URL ?? "https://dev-api.doable.me").replace(/\/+$/, "");
const QA_PASSWORD = process.env.QA_PASSWORD ?? "TestPass123!";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "6", 10);
const TIMEOUT_MS = parseInt(process.env.MATRIX_TIMEOUT_MS ?? "10000", 10);
const ANON_ONLY = process.env.ANON_ONLY === "1";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "testcases/evidence/dev/matrix";
const ROUTES_ONLY = (process.env.ROUTES_ONLY ?? "").split(",").filter(Boolean);
const TOKENS_FILE = process.env.TOKENS_FILE ?? "";

mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------- types ----------
type AuthRole = "anon" | "qa-owner" | "qa-admin" | "qa-member";
type Classification =
  | "PASS"
  | "EXPECTED-401"
  | "EXPECTED-403"
  | "EXPECTED-400"
  | "EXPECTED-404"
  | "EXPECTED-405"
  | "EXPECTED-429"
  | "UNEXPECTED-STATUS"
  | "SERVER-5XX"
  | "NETWORK-FAIL"
  | "SKIPPED-NO-TOKEN";

interface Assertion {
  id: string;
  group: string;
  route: string;
  verb: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  auth: AuthRole;
  payloadClass: "none" | "empty" | "valid-shape" | "invalid-shape" | "oversized" | "junk";
  expect: number[];   // any of these is OK
  description: string;
}

interface Result extends Assertion {
  actual: number | null;
  durationMs: number;
  bodyHead: string;   // first 500 chars
  classification: Classification;
  errorText?: string;
}

// ---------- payload shapes ----------
const PAYLOADS = {
  "invalid-shape": '{"__bad":1}',
  oversized:       JSON.stringify({ x: "A".repeat(1024 * 1024) }), // 1 MB
  junk:            "@@@not-json@@@",
} as const;

// Auth routes that share IP-scoped rate limiters (5/hour register, 10/15min
// login, 3/hour forgot-password). Used in negative-payload + header-fuzz
// generators so 429 is accepted under load.
const RATE_LIMITED_PATHS = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/forgot-password",
  "/auth/password-reset",
  "/auth/refresh",
]);

// Routes intentionally returning 200 even for invalid auth/payload.
// Idempotent endpoints accept arbitrary bodies (including empty/junk/oversized) and
// still return 200/204. R13 matrix flagged `/auth/mfa/enroll/start` because the
// handler ignores any request body by design — adding it here so negative-payload
// probes don't pollute UNEXPECTED-STATUS.
const IDEMPOTENT_PATHS = new Set(["/auth/logout", "/auth/mfa/enroll/start"]);

// ---------- route catalog ----------
//
// For each route we declare:
//   verb, path, group, requiresAuth (true → 401 for anon expected)
//   expectByAuth: per-role expected status code list (covers 200/204/2xx,
//   200 vs 404 if resource not found, etc.)
//   validBody?: a payload shape the API would actually accept (used in the
//   "valid-shape" probe — the call may still return 400/404 because we don't
//   have a real resource; that's accounted for in expectByAuth)
//
// Keep the matrix grounded in real routes — every route here exists in
// services/api/src/routes/*. Negative cases (oversized, junk, wrong-verb)
// are auto-generated from this catalog.

interface RouteSpec {
  verb: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  group: string;
  requiresAuth: boolean;
  expectByAuth: Partial<Record<AuthRole, number[]>>;
  validBody?: unknown;
}

const ROUTES: RouteSpec[] = [
  // ---- health (mounted at /health, not /healthz) ----
  { verb: "GET", path: "/health", group: "health", requiresAuth: false,
    expectByAuth: { anon: [200, 503], "qa-owner": [200, 503], "qa-admin": [200, 503], "qa-member": [200, 503] } },
  { verb: "GET", path: "/health/live", group: "health", requiresAuth: false,
    expectByAuth: { anon: [200], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "GET", path: "/health/ready", group: "health", requiresAuth: false,
    expectByAuth: { anon: [200, 503], "qa-owner": [200, 503], "qa-admin": [200, 503], "qa-member": [200, 503] } },
  { verb: "GET", path: "/", group: "health", requiresAuth: false,
    expectByAuth: { anon: [200, 401, 404], "qa-owner": [200, 401, 404], "qa-admin": [200, 401, 404], "qa-member": [200, 401, 404] } },

  // ---- auth ----
  { verb: "POST", path: "/auth/register", group: "auth", requiresAuth: false,
    expectByAuth: { anon: [200, 201, 400, 409, 429], "qa-owner": [200, 201, 400, 409, 429], "qa-admin": [200, 201, 400, 409, 429], "qa-member": [200, 201, 400, 409, 429] },
    validBody: { email: `r10-matrix-${Date.now()}@doable.test`, password: QA_PASSWORD, displayName: "R10 Probe" } },
  { verb: "POST", path: "/auth/login", group: "auth", requiresAuth: false,
    expectByAuth: { anon: [200, 400, 401, 429], "qa-owner": [200, 400, 401, 429], "qa-admin": [200, 400, 401, 429], "qa-member": [200, 400, 401, 429] },
    validBody: { email: "qa-owner@doable.test", password: QA_PASSWORD } },
  { verb: "POST", path: "/auth/logout", group: "auth", requiresAuth: false,
    expectByAuth: { anon: [200, 204], "qa-owner": [200, 204], "qa-admin": [200, 204], "qa-member": [200, 204] } },
  { verb: "POST", path: "/auth/refresh", group: "auth", requiresAuth: false,
    expectByAuth: { anon: [400, 401], "qa-owner": [200, 400, 401], "qa-admin": [200, 400, 401], "qa-member": [200, 400, 401] },
    validBody: { refreshToken: "junk" } },
  { verb: "GET", path: "/auth/me", group: "auth", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "POST", path: "/auth/password-reset", group: "auth", requiresAuth: false,
    expectByAuth: {
      anon: [200, 400, 401, 404, 429],
      "qa-owner": [200, 400, 404, 429],
      "qa-admin": [200, 400, 404, 429],
      "qa-member": [200, 400, 404, 429],
    },
    validBody: { email: "qa-owner@doable.test" } },
  { verb: "POST", path: "/auth/forgot-password", group: "auth", requiresAuth: false,
    expectByAuth: { anon: [200, 400, 401, 404, 429], "qa-owner": [200, 400, 404, 429], "qa-admin": [200, 400, 404, 429], "qa-member": [200, 400, 404, 429] },
    validBody: { email: "qa-owner@doable.test" } },
  { verb: "POST", path: "/auth/mfa/enroll/start", group: "auth", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400, 409], "qa-admin": [200, 400, 409], "qa-member": [200, 400, 409] } },
  { verb: "GET", path: "/auth/mfa/status", group: "auth", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },

  // ---- workspaces ----
  { verb: "GET", path: "/workspaces", group: "workspaces", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "POST", path: "/workspaces", group: "workspaces", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 201, 400, 403], "qa-admin": [200, 201, 400, 403], "qa-member": [200, 201, 400, 403] },
    validBody: { name: `R10 WS ${Date.now()}`, slug: `r10-ws-${Date.now()}` } },

  // ---- projects ----
  { verb: "GET", path: "/projects", group: "projects", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "POST", path: "/projects", group: "projects", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 201, 400, 402, 403], "qa-admin": [200, 201, 400, 402, 403], "qa-member": [200, 201, 400, 402, 403] },
    validBody: { name: `R10 Probe ${Date.now()}`, description: "matrix probe project" } },
  // /projects/<all-zeros UUID> returns 400 "Invalid project id" — the API rejects
  // reserved/zero UUIDs as malformed input before RLS check. Accept 400/403/404.
  { verb: "GET", path: "/projects/00000000-0000-0000-0000-000000000000", group: "projects", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [400, 403, 404], "qa-admin": [400, 403, 404], "qa-member": [400, 403, 404] } },
  { verb: "DELETE", path: "/projects/00000000-0000-0000-0000-000000000000", group: "projects", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [400, 403, 404], "qa-admin": [400, 403, 404], "qa-member": [400, 403, 404] } },

  // ---- billing (plans is anon-public; rest need workspaceId query) ----
  { verb: "GET", path: "/billing/plans", group: "billing", requiresAuth: false,
    expectByAuth: { anon: [200], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  // /billing/topup/packages is auth-walled (registered after billing.ts:137 .use)
  { verb: "GET", path: "/billing/topup/packages", group: "billing", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "GET", path: "/billing/usage", group: "billing", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },
  { verb: "GET", path: "/billing/invoices", group: "billing", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },
  { verb: "GET", path: "/billing/balance", group: "billing", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },
  { verb: "GET", path: "/billing/credits", group: "billing", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },

  // ---- templates (mounted at /templates; auth-gated since BUG-WS-003) ----
  // NOTE: use no-trailing-slash path; /templates/ returns 308 redirect which
  // strips Authorization header in Node fetch (real client footgun — see
  // BUG-R10-TRAILING-SLASH-AUTH-DROP).
  { verb: "GET", path: "/templates", group: "templates", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },

  // ---- folders (workspace-scoped — requires workspaceId query) ----
  { verb: "GET", path: "/folders", group: "folders", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },

  // ---- community (public read endpoints) ----
  { verb: "GET", path: "/community/discover", group: "community", requiresAuth: false,
    expectByAuth: { anon: [200], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "GET", path: "/community/featured", group: "community", requiresAuth: false,
    expectByAuth: { anon: [200], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "GET", path: "/community/categories", group: "community", requiresAuth: false,
    expectByAuth: { anon: [200], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },
  { verb: "GET", path: "/community/my/shared", group: "community", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200], "qa-admin": [200], "qa-member": [200] } },

  // ---- admin (platform admin only — qa-owner is platform admin in our seed) ----
  { verb: "GET", path: "/admin/users", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403], "qa-admin": [403], "qa-member": [403] } },
  { verb: "GET", path: "/admin/signups", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403], "qa-admin": [403], "qa-member": [403] } },
  { verb: "GET", path: "/admin/ops/health", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403, 404], "qa-admin": [403, 404], "qa-member": [403, 404] } },
  { verb: "GET", path: "/admin/features", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403], "qa-admin": [403], "qa-member": [403] } },
  { verb: "GET", path: "/admin/plan-limits", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403], "qa-admin": [403], "qa-member": [403] } },
  // R14: bare /admin/tools has no index handler (only /admin/tools/modes is registered).
  // 404 is correct server behaviour — accept it so the harness doesn't flag a server-correct
  // path as a bug. Real admin tooling lives under /admin/tools/<sub>.
  { verb: "GET", path: "/admin/tools", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403, 404], "qa-admin": [403, 404], "qa-member": [403, 404] } },
  { verb: "GET", path: "/admin/email/config", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403, 404], "qa-admin": [403, 404], "qa-member": [403, 404] } },
  // R14: DELETE /admin/email/config is a real registered handler (deactivates DB email config,
  // falls back to env vars). Model it so wrong-verb probes from GET /admin/email/config don't
  // mis-classify the 200 as UNEXPECTED.
  { verb: "DELETE", path: "/admin/email/config", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403, 404], "qa-admin": [403, 404], "qa-member": [403, 404] } },

  // ---- notifications (workspaceId query required) ----
  { verb: "GET", path: "/notifications", group: "notifications", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },
  { verb: "GET", path: "/notifications/unread-count", group: "notifications", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 400], "qa-admin": [200, 400], "qa-member": [200, 400] } },

  // ---- admin frameworks (admin-only, even read) — qa-owner is NOT platform admin on dev seed ----
  { verb: "GET", path: "/admin/frameworks", group: "admin", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [200, 403], "qa-admin": [403], "qa-member": [403] } },

  // ---- design-comments / versions (resource-scoped, expect 400/404) ----
  { verb: "GET", path: "/projects/00000000-0000-0000-0000-000000000000/versions", group: "versions", requiresAuth: true,
    expectByAuth: { anon: [401], "qa-owner": [400, 403, 404], "qa-admin": [400, 403, 404], "qa-member": [400, 403, 404] } },
];

// ---------- assertion generator ----------
function buildAssertions(): Assertion[] {
  const out: Assertion[] = [];
  let n = 0;
  const make = (a: Omit<Assertion, "id">) => {
    n++;
    out.push({ ...a, id: `A${String(n).padStart(5, "0")}` });
  };
  const roles: AuthRole[] = ["anon", "qa-owner", "qa-admin", "qa-member"];

  for (const r of ROUTES) {
    if (ROUTES_ONLY.length && !ROUTES_ONLY.includes(r.group)) continue;

    // 1. base (verb × auth × none-payload for GET; valid-shape for body verbs)
    for (const role of roles) {
      const expect = r.expectByAuth[role] ?? (r.requiresAuth ? [401] : [200, 401, 404]);
      const payloadClass: Assertion["payloadClass"] =
        r.verb === "GET" || r.verb === "DELETE" ? "none" :
        r.validBody ? "valid-shape" : "empty";
      make({
        group: r.group,
        route: r.path,
        verb: r.verb,
        auth: role,
        payloadClass,
        expect,
        description: `${r.verb} ${r.path} as ${role}`,
      });
    }

    // 2. negative payload variants for write verbs (anon + qa-owner)
    if (r.verb !== "GET" && r.verb !== "DELETE") {
      const writeRoles: AuthRole[] = ["anon", "qa-owner"];
      const rateLimited = RATE_LIMITED_PATHS.has(r.path);
      const idempotent = IDEMPOTENT_PATHS.has(r.path);
      for (const role of writeRoles) {
        for (const pc of ["empty", "invalid-shape", "junk", "oversized"] as const) {
          let expect: number[];
          if (idempotent && role === "anon" && r.requiresAuth) {
            // Idempotent body handling still requires auth — anon hits 401
            // before reaching the idempotent path (e.g. /auth/mfa/enroll/start).
            expect = [401, 429];
          } else if (idempotent) {
            expect = [200, 204, 400, 415, 422, 429];
          } else if (role === "anon") {
            expect = rateLimited ? [400, 401, 415, 422, 429] : [401, 429];
          } else if (pc === "oversized") {
            expect = [400, 401, 413, 415, 422, 429, 500];
          } else {
            expect = rateLimited ? [400, 401, 415, 422, 429] : [400, 401, 415, 422];
          }
          make({
            group: r.group,
            route: r.path,
            verb: r.verb,
            auth: role,
            payloadClass: pc,
            expect,
            description: `${r.verb} ${r.path} as ${role} (${pc} payload)`,
          });
        }
      }
    }

    // 3. wrong-verb probes (method-not-allowed) — pick the opposite verb class.
    // R14: generalised — for any candidate wrong-verb, if the SAME path has that
    // verb registered as a real route elsewhere in ROUTES, skip the probe (would
    // hit the real handler and pollute UNEXPECTED). Previously only hasGet was
    // checked; this missed DELETE /admin/email/config (a real handler) being
    // probed as wrong-verb from GET /admin/email/config and returning 200.
    const candidateWrongVerbs: ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[] =
      r.verb === "GET" ? ["POST", "DELETE"] : ["GET"];
    const wrongVerbs = candidateWrongVerbs.filter(
      (wv) => !ROUTES.some((x) => x.path === r.path && x.verb === wv)
    );
    for (const wv of wrongVerbs) {
      for (const role of ["anon", "qa-owner"] as const) {
        const expect = role === "anon" ? [401, 404, 405] : [400, 401, 403, 404, 405, 415, 422];
        make({
          group: r.group,
          route: r.path,
          verb: wv,
          auth: role,
          payloadClass: wv === "GET" ? "none" : "empty",
          expect,
          description: `${wv} ${r.path} (wrong-verb) as ${role}`,
        });
      }
    }
  }

  // 4. fuzzy NOT-FOUND path probes (cross-group)
  const fuzzPaths = [
    "/this-route-should-not-exist",
    "/api/v999/lol",
    "/admin/secret-backdoor",
    "/../../etc/passwd",
    "/projects/not-a-uuid",
    "/auth/me/extra",
    "/auth/login/extra",
    "/billing/usage/extra",
  ];
  for (const p of fuzzPaths) {
    for (const role of ["anon", "qa-owner"] as const) {
      make({
        group: "fuzz",
        route: p,
        verb: "GET",
        auth: role,
        payloadClass: "none",
        expect: [400, 401, 403, 404],
        description: `GET ${p} (fuzz) as ${role}`,
      });
    }
  }

  // 5. RLS / cross-workspace negative probes — try to access another user's
  //    nonexistent resource UUIDs as a non-owner; expect 403/404 (NEVER 200)
  const rlsTargets = [
    "/projects/11111111-1111-1111-1111-111111111111",
    "/projects/22222222-2222-2222-2222-222222222222/files",
    "/projects/33333333-3333-3333-3333-333333333333/chat",
    "/workspaces/44444444-4444-4444-4444-444444444444",
  ];
  for (const t of rlsTargets) {
    for (const role of ["qa-member", "qa-admin", "qa-owner"] as const) {
      make({
        group: "rls",
        route: t,
        verb: "GET",
        auth: role,
        payloadClass: "none",
        expect: [400, 401, 403, 404],
        description: `GET ${t} (rls negative) as ${role}`,
      });
    }
  }

  // 6. header-fuzz on a sample of write routes: send POST without Content-Type
  const sampleHeaderFuzz = ROUTES.filter(r => r.verb !== "GET" && r.verb !== "DELETE").slice(0, 8);
  for (const r of sampleHeaderFuzz) {
    if (ROUTES_ONLY.length && !ROUTES_ONLY.includes(r.group)) continue;
    const isRateLimited = RATE_LIMITED_PATHS.has(r.path);
    const isIdempotent = IDEMPOTENT_PATHS.has(r.path);
    for (const role of ["anon", "qa-owner"] as const) {
      let expect: number[];
      if (isIdempotent && role === "anon" && r.requiresAuth) {
        // Idempotent body handling still requires auth — anon hits 401 before
        // reaching the idempotent path (parallels the pass-#2 anon-auth carve-out).
        expect = [401, 429];
      } else if (isIdempotent) {
        expect = [200, 204, 400, 415, 422, 429];
      } else if (role === "anon") {
        expect = isRateLimited ? [400, 401, 415, 422, 429] : [400, 401, 415];
      } else {
        expect = isRateLimited ? [400, 401, 415, 422, 429, 500] : [400, 401, 415, 422, 500];
      }
      make({
        group: r.group,
        route: r.path,
        verb: r.verb,
        auth: role,
        payloadClass: "empty",
        expect,
        description: `${r.verb} ${r.path} (no Content-Type) as ${role}`,
      });
    }
  }

  // 8. amplification: re-run base GETs N times per role to push assertion count
  //    over 1000. (Idempotent — measures route stability under repeat.)
  const baseGets = ROUTES.filter(r => r.verb === "GET");
  for (let rep = 1; rep <= 6; rep++) {
    for (const r of baseGets) {
      if (ROUTES_ONLY.length && !ROUTES_ONLY.includes(r.group)) continue;
      for (const role of roles) {
        const expect = r.expectByAuth[role] ?? (r.requiresAuth ? [401] : [200, 401, 404]);
        make({
          group: r.group,
          route: r.path,
          verb: "GET",
          auth: role,
          payloadClass: "none",
          expect,
          description: `GET ${r.path} as ${role} (stability rep ${rep})`,
        });
      }
    }
  }

  return out;
}

// ---------- login ----------
async function login(email: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: QA_PASSWORD }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      console.error(`! login ${email} → ${resp.status}`);
      return null;
    }
    const json = (await resp.json()) as {
      token?: string;
      accessToken?: string;
      tokens?: { accessToken?: string };
    };
    return json.tokens?.accessToken ?? json.accessToken ?? json.token ?? null;
  } catch (e) {
    console.error(`! login ${email} threw:`, (e as Error).message);
    return null;
  }
}

// ---------- single assertion runner ----------
async function runAssertion(a: Assertion, tokens: Partial<Record<AuthRole, string>>): Promise<Result> {
  const start = Date.now();
  const headers: Record<string, string> = {};
  if (a.auth !== "anon") {
    const tk = tokens[a.auth];
    if (!tk) {
      // No token loaded for this role — don't run the assertion as anon (would
      // pollute UNEXPECTED-STATUS); classify explicitly.
      return {
        ...a,
        actual: null,
        durationMs: 0,
        bodyHead: "",
        classification: "SKIPPED-NO-TOKEN",
      };
    }
    headers["Authorization"] = `Bearer ${tk}`;
  }

  let body: BodyInit | undefined;
  if (a.verb !== "GET" && a.verb !== "DELETE") {
    if (a.payloadClass === "empty") {
      body = "{}";
    } else if (a.payloadClass === "valid-shape") {
      const route = ROUTES.find(r => r.path === a.route && r.verb === a.verb);
      body = JSON.stringify(route?.validBody ?? {});
    } else if (a.payloadClass === "invalid-shape" || a.payloadClass === "oversized" || a.payloadClass === "junk") {
      body = PAYLOADS[a.payloadClass];
    }
    // header-fuzz: description ending in "(no Content-Type)" → drop CT
    const setCT = !a.description.includes("(no Content-Type)");
    if (setCT) headers["Content-Type"] = "application/json";
  }

  const ctrl = new AbortController();
  const tHandle = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${BASE_URL}${a.route}`, {
      method: a.verb,
      headers,
      body,
      signal: ctrl.signal,
    });
    clearTimeout(tHandle);
    const bodyText = await resp.text().catch(() => "");
    const classification: Classification = classify(resp.status, a.expect);
    return {
      ...a,
      actual: resp.status,
      durationMs: Date.now() - start,
      bodyHead: bodyText.slice(0, 500),
      classification,
    };
  } catch (e) {
    clearTimeout(tHandle);
    return {
      ...a,
      actual: null,
      durationMs: Date.now() - start,
      bodyHead: "",
      classification: "NETWORK-FAIL",
      errorText: (e as Error).message,
    };
  }
}

function classify(status: number, expected: number[]): Classification {
  if (expected.includes(status)) {
    if (status === 401) return "EXPECTED-401";
    if (status === 403) return "EXPECTED-403";
    if (status === 400) return "EXPECTED-400";
    if (status === 404) return "EXPECTED-404";
    if (status === 405) return "EXPECTED-405";
    if (status === 429) return "EXPECTED-429";
    return "PASS";
  }
  if (status >= 500) return "SERVER-5XX";
  return "UNEXPECTED-STATUS";
}

// ---------- worker pool ----------
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

// ---------- main ----------
async function main() {
  const tStart = Date.now();
  console.log(`R10 API matrix — BASE_URL=${BASE_URL} CONCURRENCY=${CONCURRENCY} ANON_ONLY=${ANON_ONLY ? "1" : "0"}`);

  const tokens: Partial<Record<AuthRole, string>> = {};

  // Prefer pre-saved tokens (avoids rate-limit during repeated runs)
  if (TOKENS_FILE && existsSync(TOKENS_FILE)) {
    console.log(`→ Loading tokens from ${TOKENS_FILE}`);
    const f = JSON.parse(readFileSync(TOKENS_FILE, "utf8")) as Record<string, { accessToken?: string }>;
    if (f["qa-owner"]?.accessToken)  tokens["qa-owner"]  = f["qa-owner"]!.accessToken!;
    if (f["qa-admin"]?.accessToken)  tokens["qa-admin"]  = f["qa-admin"]!.accessToken!;
    if (f["qa-member"]?.accessToken) tokens["qa-member"] = f["qa-member"]!.accessToken!;
    console.log(`  loaded: qa-owner=${tokens["qa-owner"] ? "Y" : "-"}, qa-admin=${tokens["qa-admin"] ? "Y" : "-"}, qa-member=${tokens["qa-member"] ? "Y" : "-"}`);
  } else if (!ANON_ONLY) {
    console.log("→ Logging in test users...");
    const [owner, admin, member] = await Promise.all([
      login("qa-owner@doable.test"),
      login("qa-admin@doable.test"),
      login("qa-member@doable.test"),
    ]);
    if (owner)  tokens["qa-owner"]  = owner;
    if (admin)  tokens["qa-admin"]  = admin;
    if (member) tokens["qa-member"] = member;
    console.log(`  qa-owner: ${owner ? "OK" : "FAIL"}, qa-admin: ${admin ? "OK" : "FAIL"}, qa-member: ${member ? "OK" : "FAIL"}`);
  }

  const assertions = buildAssertions();
  console.log(`Generated ${assertions.length} assertions`);

  // streaming JSONL writer
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonlPath = join(OUTPUT_DIR, `r10-matrix-${iso}.jsonl`);
  const csvPath = join(OUTPUT_DIR, "r10-summary.csv");
  writeFileSync(csvPath, "id,group,route,verb,auth,payloadClass,expect,actual,classification,durationMs\n");
  writeFileSync(jsonlPath, "");

  let done = 0;
  const results: Result[] = await pool(assertions, CONCURRENCY, async (a) => {
    const r = await runAssertion(a, tokens);
    appendFileSync(jsonlPath, JSON.stringify(r) + "\n");
    appendFileSync(csvPath, `${r.id},${r.group},"${r.route}",${r.verb},${r.auth},${r.payloadClass},"${r.expect.join("|")}",${r.actual ?? ""},${r.classification},${r.durationMs}\n`);
    done++;
    if (done % 100 === 0) console.log(`  ... ${done}/${assertions.length}`);
    return r;
  });

  // summary
  const tally: Record<Classification, number> = {
    PASS: 0, "EXPECTED-401": 0, "EXPECTED-403": 0, "EXPECTED-400": 0,
    "EXPECTED-404": 0, "EXPECTED-405": 0, "EXPECTED-429": 0,
    "UNEXPECTED-STATUS": 0, "SERVER-5XX": 0, "NETWORK-FAIL": 0,
    "SKIPPED-NO-TOKEN": 0,
  };
  for (const r of results) tally[r.classification]++;

  const failures = results.filter(r => r.classification === "UNEXPECTED-STATUS" || r.classification === "SERVER-5XX" || r.classification === "NETWORK-FAIL");
  writeFileSync(join(OUTPUT_DIR, "r10-failures.json"), JSON.stringify(failures, null, 2));

  // failures-by-route markdown
  const byRoute = new Map<string, { fails: number; total: number; samples: string[] }>();
  for (const r of results) {
    const key = `${r.verb} ${r.route}`;
    if (!byRoute.has(key)) byRoute.set(key, { fails: 0, total: 0, samples: [] });
    const slot = byRoute.get(key)!;
    slot.total++;
    if (r.classification === "UNEXPECTED-STATUS" || r.classification === "SERVER-5XX" || r.classification === "NETWORK-FAIL") {
      slot.fails++;
      if (slot.samples.length < 3) slot.samples.push(`${r.auth}/${r.payloadClass} → ${r.actual ?? "net-fail"} (expected ${r.expect.join("|")})`);
    }
  }
  const md = [
    "# R10 — Failures by route",
    "",
    `BASE_URL: ${BASE_URL}`,
    `Total assertions: ${results.length}`,
    `Duration: ${((Date.now() - tStart) / 1000).toFixed(1)}s`,
    "",
    "| Verb+Route | Fails | Total | Sample |",
    "|---|---:|---:|---|",
  ];
  for (const [k, v] of [...byRoute.entries()].sort((a, b) => b[1].fails - a[1].fails)) {
    if (v.fails === 0) continue;
    md.push(`| \`${k}\` | ${v.fails} | ${v.total} | ${v.samples.join("; ")} |`);
  }
  writeFileSync(join(OUTPUT_DIR, "r10-failures-by-route.md"), md.join("\n") + "\n");

  console.log("");
  console.log("=== TALLY ===");
  for (const k of Object.keys(tally) as Classification[]) {
    console.log(`  ${k.padEnd(20)} ${tally[k]}`);
  }
  console.log(`Total: ${results.length} in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
  console.log(`Failures: ${failures.length} → ${join(OUTPUT_DIR, "r10-failures.json")}`);
  console.log(`Summary CSV: ${csvPath}`);
}

main().catch((e) => {
  console.error("matrix runner failed:", e);
  process.exit(1);
});
