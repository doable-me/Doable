import { sql } from "../services/api/src/db/index.js";
import { credentialVault } from "../services/api/src/integrations/credential-vault.js";

async function main(): Promise<void> {
  const rows = await sql`
    SELECT id, metadata, display_name, created_at
    FROM integration_connections
    WHERE integration_id = 'supabase'
    ORDER BY created_at DESC
    LIMIT 3
  `;
  for (const row of rows) {
    console.log(`--- ${row.id} (${row.display_name ?? "unnamed"}) ---`);
    console.log("metadata:", JSON.stringify(row.metadata, null, 2));
    const creds = (await credentialVault.decrypt(row.id as string)) as Record<string, unknown> | null;
    if (!creds) {
      console.log("decrypt returned null");
      continue;
    }
    console.log("credential keys:", Object.keys(creds));
    console.log("  has url:          ", !!creds.url);
    console.log("  has apiKey:       ", !!creds.apiKey);
    console.log("  has anonKey:      ", !!creds.anonKey);
    console.log("  has serviceRoleKey:", !!creds.serviceRoleKey);
    console.log();
  }
  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
