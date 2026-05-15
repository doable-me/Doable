#!/usr/bin/env tsx
// scripts/r13-test-logout-contract.ts
//
// Pins the BUG-R10-AUTH-LOGOUT-ANON-200-001 contract: POST /auth/logout is
// idempotent and returns 200 in all three states (anon, with valid refresh
// token, with bogus refresh token). The 200-for-anon behaviour is intentional
// (see services/api/src/routes/auth/core.ts:170-176) — this test guards
// against accidental regressions that would re-introduce a 401 and break
// SDK cleanup paths.
//
// Architect P2 follow-up from PR #35 verification (R13).
//
// Usage:
//   BASE_URL=https://dev-api.doable.me pnpm exec tsx scripts/r13-test-logout-contract.ts

const BASE_URL = process.env.BASE_URL ?? "https://dev-api.doable.me";

interface ProbeResult {
  name: string;
  status: number;
  body: unknown;
  passed: boolean;
  reason?: string;
}

async function probe(name: string, init: RequestInit): Promise<ProbeResult> {
  const res = await fetch(`${BASE_URL}/auth/logout`, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  const passed = res.status === 200;
  return {
    name,
    status: res.status,
    body,
    passed,
    reason: passed ? undefined : `expected 200, got ${res.status}`,
  };
}

async function main(): Promise<void> {
  console.log(`[r13-logout-contract] Target: ${BASE_URL}/auth/logout`);
  console.log(
    "[r13-logout-contract] Pinning BUG-R10-AUTH-LOGOUT-ANON-200-001 — anon + bogus + missing-body all return 200"
  );

  const results: ProbeResult[] = [];

  // 1. POST /auth/logout with no body and no Authorization → 200 (anon idempotent)
  results.push(
    await probe("anon no body", {
      method: "POST",
    })
  );

  // 2. POST /auth/logout with empty body and no Authorization → 200
  results.push(
    await probe("anon empty body", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );

  // 3. POST /auth/logout with a syntactically-valid-but-bogus refreshToken → 200
  //    (the handler's try/catch swallows the unknown-token branch)
  results.push(
    await probe("anon bogus refreshToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken: "this.is.not.a.valid.refresh.token.but.logout.should.still.200",
      }),
    })
  );

  // 4. POST /auth/logout with garbage JSON → 200 (the .catch(() => ({})) path)
  results.push(
    await probe("garbage body", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{this is not json}",
    })
  );

  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    const tag = r.passed ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${r.name} → HTTP ${r.status}`);
    if (!r.passed) console.log(`         reason: ${r.reason}`);
  }

  console.log("");
  if (failed.length === 0) {
    console.log(`[r13-logout-contract] PASS — ${results.length}/${results.length} assertions held`);
    console.log(
      "[r13-logout-contract] Logout contract pinned: 200 on anon + bogus + missing-body — SDK cleanup paths safe"
    );
    process.exit(0);
  } else {
    console.error(
      `[r13-logout-contract] FAIL — ${failed.length}/${results.length} regressions detected`
    );
    console.error(
      "[r13-logout-contract] Contract broken — see services/api/src/routes/auth/core.ts:170-176"
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[r13-logout-contract] crashed:", err);
  process.exit(2);
});
