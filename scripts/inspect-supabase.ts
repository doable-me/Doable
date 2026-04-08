import { sql } from "../services/api/src/db/index.js";

async function main(): Promise<void> {
  const rows = await sql`
    SELECT id, workspace_id, user_id, scope, project_id, status,
           metadata->>'connectedVia' as connected_via,
           metadata->>'keyType' as key_type,
           display_name, created_at
    FROM integration_connections
    WHERE integration_id = 'supabase'
  `;
  console.log(`supabase: ${rows.length}`);
  for (const r of rows) console.log(JSON.stringify(r));

  const mgmt = await sql`
    SELECT id, workspace_id, user_id, scope, status
    FROM integration_connections
    WHERE integration_id = 'supabase-mgmt'
  `;
  console.log(`supabase-mgmt: ${mgmt.length}`);
  for (const r of mgmt) console.log(JSON.stringify(r));

  const apps = await sql`
    SELECT id, workspace_id, integration_id, client_id, is_global
    FROM oauth_apps
    WHERE integration_id LIKE 'supabase%'
  `;
  console.log(`oauth_apps: ${apps.length}`);
  for (const r of apps) console.log(JSON.stringify(r));

  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
