#!/usr/bin/env node
/**
 * Domain-agnostic post-deploy /admin smoke test.
 *
 * Doable is open-source — anyone can clone the repo, point setup-server.sh
 * at their own domain (acme.com, foo.io, anything), and run their own
 * instance. This smoke test verifies that the /admin surface actually
 * works end-to-end on whatever domain the operator deployed to — without
 * embedding any reference to doable.me anywhere in the code path.
 *
 * What it does:
 *   1. POST $API_BASE/auth/login with the admin email + password.
 *   2. GET $API_BASE/admin/users with the returned access token.
 *   3. Assert the response is a top-level array (BUG-ADMIN-012 regression).
 *   4. Assert each row uses snake_case keys — never camelCase.
 *
 * What it does NOT do:
 *   - Hardcode any domain. The operator supplies API_BASE.
 *   - Hardcode any credential. The operator supplies them via env.
 *   - Seed a user. The operator must have signed up the admin first.
 *
 * Usage:
 *   API_BASE=https://acme-api.example.com \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD='super-secret' \
 *   pnpm smoke:admin
 *
 * Local (default values mirror setup-server.sh local bind):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm smoke:admin
 *
 * Exit codes:
 *   0  — every assertion passed; /admin is healthy
 *   1  — at least one assertion failed; /admin is at risk
 *   2  — usage error (missing creds, unreachable host)
 */

const apiBase = (process.env.API_BASE ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error(
    "smoke-admin: ADMIN_EMAIL and ADMIN_PASSWORD are required.\n" +
      "Example:\n" +
      "  API_BASE=https://acme-api.example.com \\\n" +
      "  ADMIN_EMAIL=admin@example.com \\\n" +
      "  ADMIN_PASSWORD='...' \\\n" +
      "  pnpm smoke:admin",
  );
  process.exit(2);
}

let failures = 0;
let total = 0;
function assert(cond, msg) {
  total += 1;
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

async function main() {
  console.log(`smoke-admin: target ${apiBase} as ${email}`);

  let loginRes;
  try {
    loginRes = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    console.error(`smoke-admin: cannot reach ${apiBase}: ${err?.message ?? err}`);
    process.exit(2);
  }

  assert(loginRes.ok, `POST /auth/login → 2xx (got ${loginRes.status})`);
  const loginBody = await loginRes.json().catch(() => null);
  const token = loginBody?.tokens?.accessToken;
  const isAdmin = loginBody?.user?.isPlatformAdmin === true;
  assert(typeof token === "string" && token.length > 20, "login returned access token");
  assert(isAdmin, "login user is platform admin (isPlatformAdmin: true)");

  if (!token || !isAdmin) {
    console.error(
      "\nsmoke-admin: cannot proceed without a platform-admin token. " +
        "Sign up the admin via the web UI first, then re-run.",
    );
    console.error(`\n${total - failures}/${total} assertions PASS, ${failures} FAIL`);
    process.exit(1);
  }

  const usersRes = await fetch(`${apiBase}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(usersRes.ok, `GET /admin/users → 2xx (got ${usersRes.status})`);
  const body = await usersRes.json().catch(() => null);

  // BUG-ADMIN-012 (regression of BUG-ADMIN-005): the body MUST be a flat
  // array. Wrapping it in { data, total, limit, offset } crashed every
  // platform admin's /admin page with "TypeError: A.map is not a function".
  assert(Array.isArray(body), "body is a top-level array (not an envelope)");
  assert(
    !(body && typeof body === "object" && !Array.isArray(body) && "data" in body),
    "body is NOT a { data: [...] } envelope",
  );

  if (Array.isArray(body) && body.length > 0) {
    const row = body[0];
    // Snake_case is the cross-cutting convention every admin consumer
    // expects (AdminUser type, admin-components.tsx, user-management-panel.tsx).
    for (const key of [
      "id",
      "email",
      "display_name",
      "is_platform_admin",
      "platform_role",
    ]) {
      assert(key in row, `row[0] has snake_case key "${key}"`);
    }
    // Forbid camelCase leaks — a future enrichment patch must not flip back.
    for (const key of ["displayName", "isPlatformAdmin", "platformRole"]) {
      assert(!(key in row), `row[0] does NOT carry camelCase variant "${key}"`);
    }
  } else {
    console.log(
      "  note: /admin/users returned an empty array — snake_case checks skipped. " +
        "Create a second account to exercise the full row shape.",
    );
  }

  const passed = total - failures;
  if (failures > 0) {
    console.error(`\n${passed}/${total} assertions PASS, ${failures} FAIL`);
    process.exit(1);
  }
  console.log(`\n${passed}/${total} assertions PASS — /admin is healthy on ${apiBase}`);
}

main().catch((err) => {
  console.error(`smoke-admin: unexpected error: ${err?.stack ?? err}`);
  process.exit(2);
});
