/**
 * OOB smoke test runner — PARALLEL edition.
 *
 * Bootstrap chain runs SEQUENTIALLY (health → signup-bootstrap → auth → wizard → ai-seeding).
 * All remaining stages fan out across DOABLE_OOB_CONCURRENCY workers (default 6).
 *
 * Usage:
 *   DOABLE_BASE=https://your-install.example.com \
 *   DOABLE_OOB_CONCURRENCY=8 \
 *   tsx testcases/oob/parallel.ts
 *   # or via run.sh with DOABLE_OOB_PARALLEL=1
 *
 * Exit code: 0 = all pass, 1 = any failure
 */

import { runHealthTests }           from "./health.test.js";
import { runSignupBootstrapTests, OWNER_EMAIL, OWNER_PASSWORD } from "./signup-bootstrap.test.js";
import { runAuthTests }             from "./auth.test.js";
import { runWizardTests }           from "./wizard.test.js";
import { runAiSeedingTests }        from "./ai-seeding.test.js";
import { getResults, apiFetch, API_BASE, WS_BASE, BASE, skip, fail } from "./_shared.js";

// ─── Concurrency ─────────────────────────────────────────────────────────────
const CONCURRENCY = Math.max(1, parseInt(process.env.DOABLE_OOB_CONCURRENCY ?? "6", 10));

// ─── Parallel stage registry ─────────────────────────────────────────────────
// Each entry: { name, run(token, wsId|null) => Promise<void> }
// Adding a new stage is one line here — dynamic import guards handle missing modules.

interface Stage {
  name: string;
  run: (token: string, wsId: string | null) => Promise<void>;
}

const parallelStages: Stage[] = [
  {
    name: "workspace-project",
    run: async (token, _wsId) => {
      const { runWorkspaceProjectTests } = await import("./workspace-project.test.js");
      await runWorkspaceProjectTests(token);
    },
  },
  {
    name: "websocket",
    run: async (token, _wsId) => {
      const { runWebSocketTests } = await import("./websocket.test.js");
      await runWebSocketTests(token);
    },
  },
  {
    name: "ai-chat",
    run: async (token, wsId) => {
      const { runAiChatTests } = await import("./ai-chat.test.js");
      await runAiChatTests(token, wsId);
    },
  },
  {
    name: "projects-crud",
    run: async (token, wsId) => {
      const { runProjectsCrudTests } = await import("./projects-crud.test.js");
      await runProjectsCrudTests(token, wsId);
    },
  },
  {
    name: "integrations",
    run: async (token, wsId) => {
      const { runIntegrationsTests } = await import("./integrations.test.js");
      await runIntegrationsTests(token, wsId);
    },
  },
  {
    name: "billing",
    run: async (token, wsId) => {
      const { runBillingTests } = await import("./billing.test.js");
      await runBillingTests(token, wsId);
    },
  },
  {
    name: "mcp",
    run: async (token, wsId) => {
      const { runMcpTests } = await import("./mcp.test.js");
      await runMcpTests(token, wsId);
    },
  },
  {
    name: "admin",
    run: async (token, wsId) => {
      const { runAdminTests } = await import("./admin.test.js");
      await runAdminTests(token);
    },
  },
  {
    name: "security",
    run: async (token, wsId) => {
      const { runSecurityTests } = await import("./security.test.js");
      await runSecurityTests(token, wsId);
    },
  },
  {
    name: "github",
    run: async (token, wsId) => {
      const { runGithubTests } = await import("./github.test.js");
      await runGithubTests(token, wsId);
    },
  },
  {
    name: "marketplace",
    run: async (token, wsId) => {
      const { runMarketplaceTests } = await import("./marketplace.test.js");
      await runMarketplaceTests(token, wsId);
    },
  },
  {
    name: "folders",
    run: async (token, wsId) => {
      const { runFoldersTests } = await import("./folders.test.js");
      await runFoldersTests(token, wsId);
    },
  },
  {
    name: "thumbnails",
    run: async (token, wsId) => {
      const { runThumbnailsTests } = await import("./thumbnails.test.js");
      await runThumbnailsTests(token, wsId);
    },
  },
  // ── R3 stages ────────────────────────────────────────────────────────────
  {
    name: "search",
    run: async (token, wsId) => {
      const { runSearchTests } = await import("./search.test.js");
      await runSearchTests(token, wsId);
    },
  },
  {
    name: "oauth-negative",
    run: async (token, wsId) => {
      const { runOauthNegativeTests } = await import("./oauth-negative.test.js");
      await runOauthNegativeTests(token, wsId);
    },
  },
  {
    name: "error-paths",
    run: async (token, wsId) => {
      const { runErrorPathTests } = await import("./error-paths.test.js");
      await runErrorPathTests(token, wsId);
    },
  },
  {
    name: "perm-matrix",
    run: async (token, wsId) => {
      const { runPermMatrixTests } = await import("./perm-matrix.test.js");
      await runPermMatrixTests(token, wsId);
    },
  },
  {
    name: "upload-limits",
    run: async (token, wsId) => {
      const { runUploadLimitTests } = await import("./upload-limits.test.js");
      await runUploadLimitTests(token, wsId);
    },
  },
  {
    name: "settings-crud",
    run: async (token, wsId) => {
      const { runSettingsCrudTests } = await import("./settings-crud.test.js");
      await runSettingsCrudTests(token, wsId);
    },
  },
  {
    name: "audit-log",
    run: async (token, wsId) => {
      const { runAuditLogTests } = await import("./audit-log.test.js");
      await runAuditLogTests(token, wsId);
    },
  },
];

// ─── Post-fanout sequential stages ───────────────────────────────────────────
// Stages with global side-effects (e.g. tripping the IP-based rate limiter)
// MUST run AFTER the parallel fanout finishes, or they poison every other
// stage with spurious 429s.
const postFanoutSequentialStages: Stage[] = [
  {
    name: "ratelimit",
    run: async (token, wsId) => {
      const { runRateLimitTests } = await import("./ratelimit.test.js");
      await runRateLimitTests(token, wsId);
    },
  },
];

// ─── Semaphore ────────────────────────────────────────────────────────────────
// Simple counting semaphore via a for-await queue over a fixed worker pool.
// No external deps — plain Promise chaining.

async function runWithSemaphore(
  stages: Stage[],
  token: string,
  wsId: string | null,
  concurrency: number,
): Promise<void> {
  // Produce tasks as an async iterable queue consumed by N workers.
  const queue = [...stages];
  let extraFails = 0;

  async function worker(): Promise<void> {
    while (true) {
      const stage = queue.shift();
      if (!stage) return;
      const label = `[parallel:${stage.name}]`;
      try {
        await stage.run(token, wsId);
      } catch (err: unknown) {
        // Module not found → SKIP the whole stage
        const msg = err instanceof Error ? err.message : String(err);
        if (/Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(msg)) {
          skip(`PAR-${stage.name.toUpperCase()}`, `${stage.name} stage`, "module not yet available");
        } else {
          console.error(`\n  ${label} Unhandled exception: ${msg}`);
          fail(`PAR-${stage.name.toUpperCase()}`, `${stage.name} stage (runner error)`, msg);
          extraFails++;
        }
      }
    }
  }

  // Spin up N workers and wait for all to drain the queue
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, stages.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

// ─── Summary (matches index.ts format) ───────────────────────────────────────
function printSummary(stageCount: number): void {
  const results = getResults();
  const passed  = results.filter(r =>  r.passed && !r.error?.startsWith("SKIP:")).length;
  const skipped = results.filter(r =>  r.passed &&  r.error?.startsWith("SKIP:")).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;

  console.log("\n══════════════════════════════════════════════════════");
  console.log(` Doable OOB Smoke Tests — ${total} TCs across ${stageCount} areas`);
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const startMs = Date.now();

  console.log("\n══════════════════════════════════════════════════════");
  console.log(" Doable OOB Smoke Tests — PARALLEL");
  console.log(`  API:         ${API_BASE}`);
  console.log(`  WEB:         ${BASE}`);
  console.log(`  WS:          ${WS_BASE}`);
  console.log(`  Concurrency: ${CONCURRENCY} workers`);
  console.log("══════════════════════════════════════════════════════\n");

  // ── Bootstrap chain (sequential — owner-state mutations) ─────────────────

  console.log("── [1/5] Health ───────────────────────────────────────");
  await runHealthTests();

  console.log("\n── [2/5] Signup & Bootstrap ───────────────────────────");
  await runSignupBootstrapTests();

  const { ownerToken } = await import("./signup-bootstrap.test.js");
  if (!ownerToken) {
    console.error("\nFATAL: No owner token after signup — aborting");
    printSummary(5 + parallelStages.length);
    // printSummary calls process.exit; unreachable but satisfies TS control flow
    return;
  }

  console.log("\n── [3/5] Auth ─────────────────────────────────────────");
  const { token: freshToken } = await runAuthTests(OWNER_EMAIL, OWNER_PASSWORD);
  const activeToken = freshToken ?? ownerToken;

  console.log("\n── [4/5] Setup Wizard ─────────────────────────────────");
  await runWizardTests(activeToken);

  console.log("\n── [5/5] AI Env Seeding ───────────────────────────────");
  await runAiSeedingTests(activeToken);

  // ── Resolve workspace ID for stages that need it ──────────────────────────
  let wsId: string | null = null;
  try {
    const wsRes = await apiFetch("/api/workspaces", { token: activeToken });
    if (wsRes.status === 200) {
      const wsBody = await wsRes.json() as Record<string, unknown>;
      const list = (wsBody.data ?? wsBody) as Array<Record<string, unknown>>;
      wsId = Array.isArray(list) && list.length > 0 ? (list[0].id as string) : null;
    }
  } catch { /* non-fatal — stages that need wsId will skip gracefully */ }

  // ── Parallel fan-out ──────────────────────────────────────────────────────
  const stageCount = 5 /* bootstrap */ + parallelStages.length + postFanoutSequentialStages.length;
  console.log(`\n── Parallel fan-out (${parallelStages.length} stages, ${CONCURRENCY} workers) ──────────────────\n`);

  await runWithSemaphore(parallelStages, activeToken, wsId, CONCURRENCY);

  // ── Post-fanout sequential (stages with global side-effects e.g. rate limiter) ─
  if (postFanoutSequentialStages.length > 0) {
    console.log(`\n── Post-fanout sequential (${postFanoutSequentialStages.length} stages — global side-effects) ──\n`);
    for (const stage of postFanoutSequentialStages) {
      try {
        await stage.run(activeToken, wsId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  [post:${stage.name}] Unhandled exception: ${msg}`);
        fail(`PAR-${stage.name.toUpperCase()}`, `${stage.name} stage (runner error)`, msg);
      }
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n  Wall clock: ${elapsed}s`);

  printSummary(stageCount);
}

main().catch((err) => {
  console.error("Unhandled error in parallel runner:", err);
  process.exit(1);
});
