import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  onnotice: () => {},
});

async function migrate() {
  // Create tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Get already applied migrations
  const applied = await sql`SELECT name FROM schema_migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const migrationsDir = join(__dirname, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const content = await readFile(join(migrationsDir, file), "utf-8");
    console.log(`Applying ${file}...`);

    try {
      await sql.begin(async (tx) => {
        const txn = tx as unknown as typeof sql;
        await txn.unsafe(content);
        await txn`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      count++;
    } catch (err: any) {
      // List of PostgreSQL error codes that indicate idempotent operations
      // that should be considered successful if the object already exists
      const idempotentErrorCodes = [
        "42P07", // relation already exists
        "42701", // column already exists
        "42710", // type already exists
        "42723", // function already exists
        "42P16", // index already exists
      ];

      const isIdempotentError = idempotentErrorCodes.includes(err?.code);
      const isExtensionError =
        err?.code === "0A000" &&
        err?.message?.includes("extension") &&
        err?.message?.includes("not available");
      const isPolicyError =
        err?.code === "0A000" && err?.message?.includes("policy");

      if (isExtensionError || isIdempotentError || isPolicyError) {
        const errorType = isExtensionError 
          ? "Extension not available" 
          : isPolicyError
          ? "Policy conflict (likely already applied)"
          : "Object already exists";
        console.warn(
          `⚠️  ${errorType} in ${file} (idempotent, skipping):`
        );
        console.warn(`   ${err.message}`);
        // Mark as applied
        try {
          await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
        } catch (insertErr: any) {
          // If it's already in schema_migrations, that's fine too
          if (insertErr?.code !== "23505") throw insertErr;
        }
        count++;
      } else {
        throw err;
      }
    }
  }

  if (count === 0) {
    console.log("Database is up to date.");
  } else {
    console.log(`Applied ${count} migration(s).`);
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
