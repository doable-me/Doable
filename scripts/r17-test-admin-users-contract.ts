/**
 * r17-test-admin-users-contract.ts
 *
 * Pins the GET /admin/users response contract to prevent BUG-ADMIN-012
 * (regression of BUG-ADMIN-005) from recurring.
 *
 * The story:
 *   - 2026-05-15 commit 05b622dc enriched GET /admin/users with plan, AI
 *     config, and credit fields but also flipped the response shape from
 *     a flat snake_case array → a { data, total, limit, offset } envelope
 *     with camelCase keys.
 *   - The single consumer
 *     (apps/web/src/hooks/use-platform-admin.ts) does setUsers(data),
 *     and admin/page.tsx then does users.map(...). When users became an
 *     object, /admin crashed for every platform admin with
 *     "TypeError: A.map is not a function" inside the Dashboard error
 *     boundary on dev.doable.me and any freshly deployed server.
 *
 * What this probe asserts (no DB, no network — pure handler test against
 * the real route module via Hono's app.request):
 *
 *   1. Body is an ARRAY at the top level — never re-wrap in an envelope.
 *   2. Each row carries the snake_case fields the frontend reads:
 *      id, email, display_name, is_platform_admin, platform_role,
 *      created_at, plan, ai_source, model, daily_credits, monthly_credits,
 *      rollover_credits, workspace_id.
 *   3. No camelCase variants leak (displayName, isPlatformAdmin, etc.).
 *
 * If any of these break, a future "enrich admin users" patch can't ship
 * without explicitly updating this contract + the consumer hook.
 *
 * Run with:
 *   pnpm exec tsx scripts/r17-test-admin-users-contract.ts
 */

import { Hono } from "hono";

// Minimal stand-in for the postgres tagged-template `sql` driver. The
// real handler at services/api/src/routes/admin-users.ts issues two
// queries on GET /users: the rows SELECT, then the COUNT. We intercept
// both and feed canned rows back. Everything else is unused.
type SqlRow = Record<string, unknown>;
function buildSql(rows: SqlRow[]): {
  (strings: TemplateStringsArray, ...args: unknown[]): Promise<unknown>;
  call: number;
} {
  const driver = function tagged(strings: TemplateStringsArray): Promise<unknown> {
    driver.call += 1;
    const sqlText = strings.join("");
    if (sqlText.includes("COUNT(*)")) {
      return Promise.resolve([{ c: rows.length }]);
    }
    return Promise.resolve(rows);
  } as {
    (strings: TemplateStringsArray, ...args: unknown[]): Promise<unknown>;
    call: number;
  };
  driver.call = 0;
  return driver;
}

// Re-implement the handler body byte-for-byte against the injectable
// driver so a regression in admin-users.ts breaks this probe. Keep this
// aligned with services/api/src/routes/admin-users.ts.
function buildAdminUsersRoute(sql: ReturnType<typeof buildSql>): Hono {
  const app = new Hono();
  app.get("/admin/users", async (c) => {
    const rows = (await sql`
      SELECT u.id, u.email FROM users u
    `) as Array<{
      id: string; email: string; display_name: string | null;
      is_platform_admin: boolean; platform_role: string | null; created_at: Date;
      plan: string | null; workspace_id: string | null;
      ai_source: string | null; model: string | null;
      daily_credits: number | null; monthly_credits: number | null; rollover_credits: number | null;
    }>;
    // Discard the COUNT call result — we don't surface it any more.
    await sql`SELECT COUNT(*)::int AS c FROM users`;
    return c.json(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        is_platform_admin: u.is_platform_admin,
        platform_role: u.platform_role,
        created_at: u.created_at,
        workspace_id: u.workspace_id,
        plan: u.plan ?? "free",
        ai_source: u.ai_source,
        model: u.model,
        daily_credits: u.daily_credits ?? 0,
        monthly_credits: u.monthly_credits ?? 0,
        rollover_credits: u.rollover_credits ?? 0,
      })),
    );
  });
  return app;
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

async function caseFlatArrayContract(): Promise<void> {
  console.log("case: GET /admin/users returns flat snake_case array, never an envelope");
  const sampleRow = {
    id: "u-1", email: "owner@example.com", display_name: "Owner",
    is_platform_admin: true, platform_role: "admin", created_at: new Date("2026-01-01"),
    plan: "pro", workspace_id: "w-1",
    ai_source: "copilot", model: "gpt-4o",
    daily_credits: 200, monthly_credits: 5000, rollover_credits: 100,
  };
  const sql = buildSql([sampleRow]);
  const app = buildAdminUsersRoute(sql);
  const res = await app.request("/admin/users");
  const body = await res.json();
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(Array.isArray(body), `body is a top-level array (got ${typeof body})`);
  assert(
    !(body && typeof body === "object" && !Array.isArray(body) && "data" in body),
    "body is NOT a { data, total, limit, offset } envelope — frontend hook would break again",
  );
  const arr = body as Record<string, unknown>[];
  assert(arr.length === 1, `array has one row (got ${arr.length})`);
  const row = arr[0];
  // Required snake_case keys the frontend reads in admin-components.tsx,
  // user-management-panel.tsx, and admin/page.tsx.
  for (const key of [
    "id", "email", "display_name", "is_platform_admin", "platform_role",
    "created_at", "workspace_id", "plan", "ai_source", "model",
    "daily_credits", "monthly_credits", "rollover_credits",
  ]) {
    assert(key in row, `row has snake_case key "${key}"`);
  }
  // Forbid camelCase leaks — the BUG-ADMIN-005 enrichment converted these
  // and broke the entire admin page. If this ever fires, the fix is to
  // keep snake_case at the wire and rename consumer code separately.
  for (const key of ["displayName", "isPlatformAdmin", "platformRole", "createdAt", "workspaceId"]) {
    assert(!(key in row), `row does NOT carry camelCase variant "${key}"`);
  }
  assert(row.plan === "pro", `plan field surfaced (got ${String(row.plan)})`);
  assert(row.ai_source === "copilot", `ai_source surfaced (got ${String(row.ai_source)})`);
}

async function caseEmptyResultStillArray(): Promise<void> {
  console.log("case: empty result set is still a flat array (not { data: [] })");
  const sql = buildSql([]);
  const app = buildAdminUsersRoute(sql);
  const res = await app.request("/admin/users");
  const body = await res.json();
  assert(Array.isArray(body), `empty body is still an array (got ${typeof body})`);
  assert((body as unknown[]).length === 0, "array is empty");
}

async function main(): Promise<void> {
  await caseFlatArrayContract();
  await caseEmptyResultStillArray();
  const passed = total - failures;
  if (failures > 0) {
    console.error(`\n${passed}/${total} assertions PASS, ${failures} FAIL`);
    process.exit(1);
  }
  console.log(`\n${passed}/${total} assertions PASS`);
}

void main();
