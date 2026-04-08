/**
 * Read-only smoke test for Phase 1 of integration↔AI chat bridge.
 *
 * Run from project root:
 *   tsx --env-file=.env scripts/smoke-test-phase1.ts
 *
 * What it checks (no DB writes, no side effects):
 *   1. registry has envKeyMap on supabase / github / postgres / stripe
 *   2. resolveVaultEnv import resolves and the function is callable
 *   3. resolveProjectEnvVars (legacy 2-arg call) still works
 *   4. resolveProjectEnvVars (new 4-arg call) returns reasonable shape
 *   5. buildConnectedIntegrationsContext returns a string (empty if no connections)
 *
 * Picks the first project + workspace + user it finds in the DB. If the DB is
 * empty, exits cleanly with a notice. NEVER prints credential values.
 */

import { sql } from "../services/api/src/db/index.js";
import { getIntegration } from "../services/api/src/integrations/registry/index.js";
import { resolveVaultEnv } from "../services/api/src/env/vault-bridge.js";
import {
  resolveProjectEnvVars,
  resolveProjectEnvWithManifest,
} from "../services/api/src/env/resolve.js";
import { buildConnectedIntegrationsContext } from "../services/api/src/integrations/prompt-manifest.js";

function pass(msg: string): void {
  console.log(`  PASS  ${msg}`);
}
function fail(msg: string): void {
  console.error(`  FAIL  ${msg}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log("Phase 1 smoke test\n");

  // ── 1. Registry envKeyMap contract ──
  console.log("1. Registry envKeyMap contract");
  for (const id of ["supabase", "github", "postgres", "stripe"]) {
    const def = getIntegration(id);
    if (!def) {
      fail(`${id}: not found in registry`);
      continue;
    }
    if (!def.envKeyMap) {
      fail(`${id}: missing envKeyMap`);
      continue;
    }
    const clientCount = Object.keys(def.envKeyMap.client ?? {}).length;
    const serverCount = Object.keys(def.envKeyMap.server ?? {}).length;
    pass(`${id}: client=${clientCount}, server=${serverCount}, hint="${def.envKeyMap.runtimeHint ?? "—"}"`);

    // Cross-check prefix rules at *definition* time
    for (const [k, v] of Object.entries(def.envKeyMap.client ?? {})) {
      if (!v.startsWith("VITE_")) fail(`${id}.client.${k} → ${v} must start with VITE_`);
    }
    for (const [k, v] of Object.entries(def.envKeyMap.server ?? {})) {
      if (v.startsWith("VITE_")) fail(`${id}.server.${k} → ${v} must NOT start with VITE_`);
    }
  }

  // ── 2. Pick a sample project to exercise the live path ──
  console.log("\n2. Sample project lookup");
  // Pick any project + a member of its workspace as the user.
  const rows = await sql<Array<{ id: string; workspace_id: string; user_id: string }>>`
    SELECT p.id, p.workspace_id, wm.user_id
    FROM projects p
    JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
    LIMIT 1
  `;
  if (rows.length === 0) {
    console.log("  SKIP  no projects in DB — Phase 1 live-path checks skipped\n");
    await sql.end({ timeout: 5 });
    console.log(process.exitCode ? "FAILED" : "PASSED");
    return;
  }
  const project = rows[0]!;
  pass(`using project ${project.id} (workspace ${project.workspace_id}, user ${project.user_id})`);

  // ── 3. resolveVaultEnv ──
  console.log("\n3. resolveVaultEnv");
  try {
    const result = await resolveVaultEnv(
      project.workspace_id,
      project.id,
      project.user_id,
    );
    pass(`returned env (${Object.keys(result.env).length} keys), manifest (${result.manifest.length} integrations)`);
    // Verify we never get a value back outside `env`
    for (const m of result.manifest) {
      const seen = JSON.stringify(m);
      if (seen.match(/eyJ[A-Za-z0-9_-]+/)) {
        fail(`manifest entry for ${m.integrationId} contains a JWT-like string`);
      }
    }
    if (result.manifest.length > 0) {
      console.log("  manifest summary (NAMES ONLY):");
      for (const m of result.manifest) {
        console.log(`    - ${m.integrationId}: client=[${m.clientEnvVars.join(", ")}] server=[${m.serverEnvVars.join(", ")}]`);
      }
    }
  } catch (err) {
    fail(`resolveVaultEnv threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. resolveProjectEnvVars legacy + new calls ──
  console.log("\n4. resolveProjectEnvVars");
  try {
    const legacy = await resolveProjectEnvVars(project.id, "development");
    pass(`legacy 2-arg call → ${Object.keys(legacy).length} keys`);
  } catch (err) {
    fail(`legacy call threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const merged = await resolveProjectEnvVars(
      project.id,
      "development",
      project.workspace_id,
      project.user_id,
    );
    pass(`new 4-arg call → ${Object.keys(merged).length} keys`);
  } catch (err) {
    fail(`new call threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const { env, manifest } = await resolveProjectEnvWithManifest(
      project.id,
      "development",
      project.workspace_id,
      project.user_id,
    );
    pass(`with-manifest call → ${Object.keys(env).length} env keys, ${manifest.length} manifest entries`);
  } catch (err) {
    fail(`with-manifest call threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 5. buildConnectedIntegrationsContext ──
  console.log("\n5. buildConnectedIntegrationsContext");
  try {
    const block = await buildConnectedIntegrationsContext(
      project.id,
      project.workspace_id,
      project.user_id,
    );
    if (block.length === 0) {
      pass("returned empty block (no connections — that's fine)");
    } else {
      pass(`returned block (${block.length} chars)`);
      // Quick sanity: contains the wrapper tags and rules section
      const sane =
        block.includes("<connected-integrations>") &&
        block.includes("</connected-integrations>") &&
        block.includes("Rules:");
      if (!sane) fail("block missing expected structural markers");
      // Make sure no obvious credential leak
      if (block.match(/eyJ[A-Za-z0-9_-]{10,}/)) {
        fail("block appears to contain a JWT — credential leaked into prompt!");
      } else {
        pass("no JWT-like strings detected in block");
      }
    }
  } catch (err) {
    fail(`buildConnectedIntegrationsContext threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  await sql.end({ timeout: 5 });
  console.log(`\n${process.exitCode ? "FAILED" : "PASSED"}`);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
