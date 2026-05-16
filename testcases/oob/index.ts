/**
 * OOB smoke test runner — orchestrates all test suites in dependency order.
 *
 * Usage:
 *   DOABLE_BASE=https://your-install.example.com node --experimental-vm-modules testcases/oob/index.ts
 *   # or via run.sh which sets up env and calls tsx
 *
 * Exit code: 0 = all pass, 1 = any failure
 */

import { runHealthTests }            from "./health.test.js";
import { runSignupBootstrapTests, ownerToken as _ownerToken, OWNER_EMAIL, OWNER_PASSWORD } from "./signup-bootstrap.test.js";
import { runWizardTests }            from "./wizard.test.js";
import { runAiSeedingTests }         from "./ai-seeding.test.js";
import { runAuthTests }              from "./auth.test.js";
import { runWorkspaceProjectTests }  from "./workspace-project.test.js";
import { runWebSocketTests }         from "./websocket.test.js";
import { runAiChatTests }            from "./ai-chat.test.js";
import { getResults, API_BASE, WS_BASE, BASE } from "./_shared.js";

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(" Doable OOB Smoke Tests");
  console.log(`  API:  ${API_BASE}`);
  console.log(`  WEB:  ${BASE}`);
  console.log(`  WS:   ${WS_BASE}`);
  console.log("══════════════════════════════════════════════════════\n");

  // ── Stage 1: Health (independent, always first) ──────────────────────────
  console.log("── Health ─────────────────────────────────────────────");
  await runHealthTests();

  // ── Stage 2: Signup bootstrap (sequential — first user matters) ──────────
  console.log("\n── Signup & Bootstrap ─────────────────────────────────");
  await runSignupBootstrapTests();

  // After bootstrap, re-import the shared token (module-level state)
  const { ownerToken } = await import("./signup-bootstrap.test.js");
  const token = ownerToken;

  if (!token) {
    console.error("\nFATAL: No owner token available after signup — aborting remaining tests");
    printSummary();
    process.exit(1);
  }

  // ── Stage 3: Auth (login/refresh, uses same owner account) ──────────────
  console.log("\n── Auth ───────────────────────────────────────────────");
  const { token: freshToken } = await runAuthTests(OWNER_EMAIL, OWNER_PASSWORD);
  const activeToken = freshToken ?? token;

  // ── Stage 4: Wizard API ──────────────────────────────────────────────────
  console.log("\n── Setup Wizard ───────────────────────────────────────");
  await runWizardTests(activeToken);

  // ── Stage 5: AI env-seeding ──────────────────────────────────────────────
  console.log("\n── AI Env Seeding ─────────────────────────────────────");
  await runAiSeedingTests(activeToken);

  // ── Stage 6: Workspace + Project CRUD ────────────────────────────────────
  console.log("\n── Workspace & Project ────────────────────────────────");
  await runWorkspaceProjectTests(activeToken);

  // Get a workspace ID for chat tests by querying /workspaces
  let wsId: string | null = null;
  try {
    const { apiFetch } = await import("./_shared.js");
    const wsRes = await apiFetch("/api/workspaces", { token: activeToken });
    if (wsRes.status === 200) {
      const wsBody = await wsRes.json() as Record<string, unknown>;
      const list = (wsBody.data ?? wsBody) as Array<Record<string, unknown>>;
      wsId = Array.isArray(list) && list.length > 0 ? list[0].id as string : null;
    }
  } catch { /* ignore */ }

  // ── Stage 7: WebSocket handshake ─────────────────────────────────────────
  console.log("\n── WebSocket ──────────────────────────────────────────");
  await runWebSocketTests(activeToken);

  // ── Stage 8: AI chat ─────────────────────────────────────────────────────
  console.log("\n── AI Chat ────────────────────────────────────────────");
  await runAiChatTests(activeToken, wsId);

  // ── Summary ───────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  const results = getResults();
  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;

  console.log("\n══════════════════════════════════════════════════════");
  console.log(` PASS: ${passed}  FAIL: ${failed}  SKIP: 0`);
  console.log("══════════════════════════════════════════════════════\n");

  if (failed > 0) {
    console.error("Failed tests:");
    results.filter(r => !r.passed).forEach(r => {
      console.error(`  [${r.id}] ${r.name}`);
      console.error(`         ${r.error}`);
    });
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
