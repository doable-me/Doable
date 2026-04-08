import { sql } from "../services/api/src/db/index.js";

async function main(): Promise<void> {
  // Discover all tables starting with ai_ or containing "copilot"
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name LIKE 'ai_%' OR table_name LIKE '%copilot%' OR table_name LIKE '%provider%')
    ORDER BY table_name
  `;
  console.log("matching tables:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  // Dump one sample row from each
  for (const t of tables) {
    const name = t.table_name as string;
    try {
      const rows = await sql.unsafe(`SELECT * FROM "${name}" LIMIT 3`);
      console.log(`\n[${name}] ${rows.length} rows`);
      for (const r of rows) {
        const keys = Object.keys(r).slice(0, 8);
        const summary: Record<string, unknown> = {};
        for (const k of keys) summary[k] = r[k];
        console.log("  " + JSON.stringify(summary).slice(0, 200));
      }
    } catch (e) {
      console.log(`  query failed: ${(e as Error).message}`);
    }
  }

  await sql.end({ timeout: 2 });
}

main().catch((e) => { console.error(e); process.exit(1); });
