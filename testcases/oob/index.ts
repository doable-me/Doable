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
import { runProjectsCrudTests }      from "./projects-crud.test.js";
import { runIntegrationsTests }      from "./integrations.test.js";
import { runBillingTests }           from "./billing.test.js";
import { runMcpTests }               from "./mcp.test.js";
import { runAdminTests }             from "./admin.test.js";
import { runSecurityTests }          from "./security.test.js";
import { runGithubTests }            from "./github.test.js";
import { runMarketplaceTests }       from "./marketplace.test.js";
import { runFoldersTests }           from "./folders.test.js";
import { runThumbnailsTests }        from "./thumbnails.test.js";
import { runSearchTests }            from "./search.test.js";
import { runRateLimitTests }         from "./ratelimit.test.js";
import { runOauthNegativeTests }     from "./oauth-negative.test.js";
import { runErrorPathTests }         from "./error-paths.test.js";
import { runPermMatrixTests }        from "./perm-matrix.test.js";
import { runUploadLimitTests }       from "./upload-limits.test.js";
import { runSettingsCrudTests }      from "./settings-crud.test.js";
import { runAuditLogTests }          from "./audit-log.test.js";
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

  // ── Stage 9: Projects CRUD (extended) ────────────────────────────────────
  console.log("\n── Projects CRUD ──────────────────────────────────────");
  await runProjectsCrudTests(activeToken, wsId);

  // ── Stage 10: Integrations ───────────────────────────────────────────────
  console.log("\n── Integrations ───────────────────────────────────────");
  await runIntegrationsTests(activeToken, wsId);

  // ── Stage 11: Billing ────────────────────────────────────────────────────
  console.log("\n── Billing ────────────────────────────────────────────");
  await runBillingTests(activeToken, wsId);

  // ── Stage 12: MCP Connectors ─────────────────────────────────────────────
  console.log("\n── MCP Connectors ─────────────────────────────────────");
  await runMcpTests(activeToken, wsId);

  // ── Stage 13: Admin ──────────────────────────────────────────────────────
  console.log("\n── Admin ──────────────────────────────────────────────");
  await runAdminTests(activeToken);

  // ── Stage 14: Security ───────────────────────────────────────────────────
  console.log("\n── Security ───────────────────────────────────────────");
  await runSecurityTests(activeToken, wsId);

  // ── Stage 15: GitHub ─────────────────────────────────────────────────────
  console.log("\n── GitHub ─────────────────────────────────────────────");
  await runGithubTests(activeToken, wsId);

  // ── Stage 16: Marketplace ────────────────────────────────────────────────
  console.log("\n── Marketplace ────────────────────────────────────────");
  await runMarketplaceTests(activeToken, wsId);

  // ── Stage 17: Folders ────────────────────────────────────────────────────
  console.log("\n── Folders ────────────────────────────────────────────");
  await runFoldersTests(activeToken, wsId);

  // ── Stage 18: Thumbnails ─────────────────────────────────────────────────
  console.log("\n── Thumbnails ─────────────────────────────────────────");
  await runThumbnailsTests(activeToken, wsId);

  // ── Stage 19: Search ─────────────────────────────────────────────────────
  console.log("\n── Search ─────────────────────────────────────────────");
  await runSearchTests(activeToken, wsId);

  // ── Stage 20: OAuth Negative Paths ───────────────────────────────────────
  console.log("\n── OAuth Negative Paths ───────────────────────────────");
  await runOauthNegativeTests(activeToken, wsId);

  // ── Stage 21: Error Paths ────────────────────────────────────────────────
  console.log("\n── Error Paths ────────────────────────────────────────");
  await runErrorPathTests(activeToken, wsId);

  // ── Stage 22: Permission Matrix ──────────────────────────────────────────
  console.log("\n── Permission Matrix ──────────────────────────────────");
  await runPermMatrixTests(activeToken, wsId);

  // ── Stage 23: Upload Limits ──────────────────────────────────────────────
  console.log("\n── Upload Limits ──────────────────────────────────────");
  await runUploadLimitTests(activeToken, wsId);

  // ── Stage 24: Settings CRUD ──────────────────────────────────────────────
  console.log("\n── Settings CRUD ──────────────────────────────────────");
  await runSettingsCrudTests(activeToken, wsId);

  // ── Stage 25: Audit Log ──────────────────────────────────────────────────
  console.log("\n── Audit Log ──────────────────────────────────────────");
  await runAuditLogTests(activeToken, wsId);

  // ── Stage 26: Rate Limits ────────────────────────────────────────────────
  // RATELIMIT MUST RUN LAST: it hammers /api/auth/login 110+ times which
  // trips the IP-based rate limiter. If anything ran AFTER this, those
  // tests would see 429s and fail spuriously.
  console.log("\n── Rate Limits (last — pollutes global IP throttle) ──");
  await runRateLimitTests(activeToken, wsId);

  // ── Summary ───────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  const results = getResults();
  const passed  = results.filter(r => r.passed && !r.error?.startsWith("SKIP:")).length;
  const skipped = results.filter(r => r.passed && r.error?.startsWith("SKIP:")).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;

  console.log("\n══════════════════════════════════════════════════════");
  console.log(` Doable OOB Smoke Tests — ${total} TCs across 26 areas`);
  console.log(` PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`);
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
