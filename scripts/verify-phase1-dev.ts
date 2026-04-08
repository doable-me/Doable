/**
 * Dev-server variant of verify-phase1-e2e.ts. Picks real IDs from the
 * database instead of hardcoding local ones so it can run against any
 * environment.
 */
import { sql } from "../services/api/src/db/index.js";
import { resolveVaultEnv } from "../services/api/src/env/vault-bridge.js";
import { buildConnectedIntegrationsContext } from "../services/api/src/integrations/prompt-manifest.js";

function ok(m: string) { console.log(`  PASS  ${m}`); }
function info(m: string) { console.log(`  INFO  ${m}`); }
function bad(m: string) { console.error(`  FAIL  ${m}`); process.exitCode = 1; }

async function main(): Promise<void> {
  console.log("Phase 1 verification — auto-discover IDs from DB\n");

  // Find any Supabase connection + its owner
  const [row] = await sql<Array<{ id: string; workspace_id: string; user_id: string; project_id: string | null; scope: string; display_name: string | null }>>`
    SELECT id, workspace_id, user_id, project_id, scope, display_name
    FROM integration_connections
    WHERE integration_id = 'supabase' AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!row) {
    info("no supabase connections in DB — vault-bridge returns empty manifest, which is correct");
    await sql.end({ timeout: 2 });
    return;
  }

  info(`using Supabase connection ${row.id} (${row.display_name ?? "unnamed"}) scope=${row.scope}`);
  info(`workspace=${row.workspace_id} user=${row.user_id}`);

  // Find any project in the same workspace
  const [proj] = await sql<Array<{ id: string }>>`
    SELECT id FROM projects WHERE workspace_id = ${row.workspace_id} LIMIT 1
  `;
  const projectId = proj?.id ?? "00000000-0000-0000-0000-000000000000";
  info(`using project ${projectId}\n`);

  // Run vault-bridge
  const { env, manifest } = await resolveVaultEnv(row.workspace_id, projectId, row.user_id);
  console.log(`env keys: ${Object.keys(env).sort().join(", ") || "(none)"}`);
  console.log(`manifest entries: ${manifest.length}`);
  for (const m of manifest) {
    console.log(`  - ${m.integrationId}: client=[${m.clientEnvVars.join(", ")}] server=[${m.serverEnvVars.join(", ")}]`);
  }
  console.log();

  const supa = manifest.find((m) => m.integrationId === "supabase");
  if (!supa) {
    bad("supabase entry missing from manifest");
  } else {
    ok("supabase entry present in manifest");
    // VITE_SUPABASE_URL should always appear if creds.url exists
    if (supa.clientEnvVars.includes("VITE_SUPABASE_URL")) ok("VITE_SUPABASE_URL exposed (client)");
    else info("VITE_SUPABASE_URL missing — stored creds may not have a url field");

    if (supa.clientEnvVars.includes("VITE_SUPABASE_ANON_KEY")) {
      ok("VITE_SUPABASE_ANON_KEY exposed — this connection was re-OAuthed after Phase 1F");
    } else {
      info("VITE_SUPABASE_ANON_KEY NOT exposed — legacy connection (pre-Phase-1F) or backfill script not run");
    }
    if (supa.serverEnvVars.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      ok("SUPABASE_SERVICE_ROLE_KEY exposed (server)");
    } else {
      info("SUPABASE_SERVICE_ROLE_KEY NOT exposed — legacy connection or backfill needed");
    }
    // Prefix split check — service_role must never be in client vars
    if (supa.clientEnvVars.some((k) => k.includes("SERVICE_ROLE"))) {
      bad("service_role key leaked into client env — PREFIX SPLIT BROKEN!");
    } else {
      ok("service_role key is NOT in client env (prefix split enforced)");
    }
  }

  // Build prompt block
  const block = await buildConnectedIntegrationsContext(projectId, row.workspace_id, row.user_id);
  console.log();
  console.log(`prompt block length: ${block.length} chars`);
  if (block.length > 0) {
    if (block.includes("<connected-integrations>")) ok("prompt block has the opening tag");
    if (block.match(/eyJ[A-Za-z0-9_-]{10,}/)) bad("JWT-like string leaked into prompt");
    else ok("no JWT-like strings in prompt");
  } else {
    info("empty prompt block — either no connections or the block would be empty after filters");
  }

  // Cross-workspace leak test with a random UUID
  const { manifest: otherWs } = await resolveVaultEnv(
    "99999999-9999-9999-9999-999999999999",
    projectId,
    row.user_id,
  );
  if (!otherWs.find((m) => m.integrationId === "supabase")) {
    ok("Supabase connection does NOT leak to a different workspace");
  } else {
    bad("Supabase connection leaked across workspaces!");
  }

  await sql.end({ timeout: 2 });
  console.log(`\n${process.exitCode ? "FAILED" : "PASSED"}`);
}

main().catch((e) => { console.error("crash:", e); process.exit(1); });
