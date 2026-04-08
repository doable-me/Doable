import { sql } from "../services/api/src/db/index.js";

async function main(): Promise<void> {
  const projectId = "6a0c83a4-4b78-4b10-b429-1c6e12009aa0";
  const rows = await sql`SELECT * FROM ai_active_streams WHERE project_id = ${projectId}`;
  console.log(`active streams for ${projectId}: ${rows.length}`);
  for (const r of rows) console.log(JSON.stringify(r));
  // Clear any stale stream blocking new chats
  if (process.argv.includes("--clear")) {
    const res = await sql`DELETE FROM ai_active_streams WHERE project_id = ${projectId}`;
    console.log(`deleted ${res.count} stale stream rows`);
  }
  await sql.end({ timeout: 2 });
}
main().catch((e) => { console.error(e); process.exit(1); });
