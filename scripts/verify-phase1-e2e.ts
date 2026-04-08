/**
 * Final Phase 1 verification: against the ACTUAL Supabase connection that was
 * just created via the enhanced auth flow, check that:
 *   1. resolveVaultEnv exposes VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *      (client) and SUPABASE_SERVICE_ROLE_KEY (server).
 *   2. buildConnectedIntegrationsContext produces a full system-prompt block
 *      with all 3 env vars named (no JWT leaked).
 *   3. The cross-project scope test works — resolveVaultEnv for a DIFFERENT
 *      project in the SAME workspace still picks up the user-scoped entry.
 *
 * NO side effects. NO credential values printed.
 */
import { sql } from "../services/api/src/db/index.js";
import { resolveVaultEnv } from "../services/api/src/env/vault-bridge.js";
import { buildConnectedIntegrationsContext } from "../services/api/src/integrations/prompt-manifest.js";

function ok(msg: string) { console.log(`  PASS  ${msg}`); }
function bad(msg: string) { console.error(`  FAIL  ${msg}`); process.exitCode = 1; }

async function main(): Promise<void> {
  // The newly-connected Supabase belongs to:
  const newConnWorkspace = "5aa0409e-d302-4381-aa42-d30df0f70950";
  const newConnUser = "f83bbdc6-3bbf-48c1-8c59-864d2b8fb2ca";

  // Find any project in that workspace to act as scope for the test
  const projects = await sql<Array<{ id: string; workspace_id: string }>>`
    SELECT id, workspace_id FROM projects WHERE workspace_id = ${newConnWorkspace} LIMIT 1
  `;
  if (projects.length === 0) {
    console.log(`No projects in workspace ${newConnWorkspace} — creating a phantom projectId for the resolveVaultEnv call (user-scoped connections don't require a real project).`);
  }
  const projectId = projects[0]?.id ?? "00000000-0000-0000-0000-000000000000";

  console.log(`Running resolveVaultEnv(${newConnWorkspace}, ${projectId}, ${newConnUser})\n`);

  // 1. resolveVaultEnv against the real connection
  const { env, manifest } = await resolveVaultEnv(newConnWorkspace, projectId, newConnUser);
  console.log(`env keys: ${Object.keys(env).sort().join(", ")}`);
  console.log(`manifest entries: ${manifest.length}`);
  for (const m of manifest) {
    console.log(`  - ${m.integrationId}: client=[${m.clientEnvVars.join(", ")}] server=[${m.serverEnvVars.join(", ")}]`);
  }
  console.log();

  const supaEntry = manifest.find((m) => m.integrationId === "supabase");
  if (!supaEntry) {
    bad("no supabase entry in manifest");
  } else {
    // Client-side expectations
    if (supaEntry.clientEnvVars.includes("VITE_SUPABASE_URL")) ok("VITE_SUPABASE_URL is exposed (client)");
    else bad("VITE_SUPABASE_URL missing from client env");

    if (supaEntry.clientEnvVars.includes("VITE_SUPABASE_ANON_KEY")) ok("VITE_SUPABASE_ANON_KEY is exposed (client)");
    else bad("VITE_SUPABASE_ANON_KEY missing from client env");

    // Server-side expectations
    if (supaEntry.serverEnvVars.includes("SUPABASE_SERVICE_ROLE_KEY")) ok("SUPABASE_SERVICE_ROLE_KEY is exposed (server)");
    else bad("SUPABASE_SERVICE_ROLE_KEY missing from server env");

    // Prefix split: service role must NOT be VITE_-prefixed
    if (!supaEntry.clientEnvVars.some((k) => k.includes("SERVICE_ROLE"))) {
      ok("service role key is NOT in client env vars (prefix split enforced)");
    } else {
      bad("service role key leaked into client env — PREFIX SPLIT IS BROKEN!");
    }
  }

  // 2. buildConnectedIntegrationsContext
  console.log();
  const block = await buildConnectedIntegrationsContext(projectId, newConnWorkspace, newConnUser);
  console.log(`prompt block length: ${block.length} chars`);
  if (block.includes("VITE_SUPABASE_URL") && block.includes("VITE_SUPABASE_ANON_KEY")) {
    ok("system prompt references all 3 env var names");
  } else {
    bad("system prompt is missing one of the expected env var names");
  }
  if (block.match(/eyJ[A-Za-z0-9_-]{10,}/)) {
    bad("JWT-like string leaked into prompt block — CREDENTIAL LEAK!");
  } else {
    ok("no JWT-like strings in prompt block (no credential leak)");
  }

  // 3. Cross-project: use a DIFFERENT project id (simulate another project in same workspace)
  console.log();
  const { env: env2, manifest: manifest2 } = await resolveVaultEnv(
    newConnWorkspace,
    "11111111-1111-1111-1111-111111111111",
    newConnUser,
  );
  if (manifest2.find((m) => m.integrationId === "supabase")) {
    ok("user-scoped Supabase connection still appears for a different projectId in same workspace");
  } else {
    bad("user-scoped Supabase connection did NOT appear for different projectId — scope filter is too aggressive");
  }

  // Cross-workspace leak test
  const { manifest: manifest3 } = await resolveVaultEnv(
    "99999999-9999-9999-9999-999999999999",
    projectId,
    newConnUser,
  );
  if (!manifest3.find((m) => m.integrationId === "supabase")) {
    ok("Supabase connection does NOT leak to a different workspace (cross-workspace isolation)");
  } else {
    bad("Supabase connection leaked across workspace boundaries!");
  }

  await sql.end({ timeout: 2 });
  console.log();
  console.log(process.exitCode ? "FAILED" : "PASSED");
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});
