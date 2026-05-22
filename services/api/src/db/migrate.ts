import postgres from "postgres";
import { readdir, readFile, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
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

  // Read migration files from both directories
  // Primary: services/api/src/db/migrations (this dir)
  // Secondary: packages/db/migrations (shared DB package)
  // Primary wins for duplicate filenames
  const primaryDir = join(__dirname, "migrations");
  const secondaryDir = resolve(__dirname, "../../../../packages/db/migrations");

  const fileMap = new Map<string, string>(); // filename → full path

  // Load secondary first so primary overwrites duplicates
  try {
    await access(secondaryDir);
    const secondaryFiles = (await readdir(secondaryDir)).filter((f) =>
      f.endsWith(".sql")
    );
    for (const f of secondaryFiles) fileMap.set(f, join(secondaryDir, f));
  } catch {
    // packages/db/migrations may not exist — that's fine
  }

  const primaryFiles = (await readdir(primaryDir)).filter((f) =>
    f.endsWith(".sql")
  );
  for (const f of primaryFiles) fileMap.set(f, join(primaryDir, f));

  const files = [...fileMap.keys()].sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const content = await readFile(fileMap.get(file)!, "utf-8");
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
        "42501", // insufficient privilege (e.g. GRANT on table owned by another role)
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
          : err?.code === "42501"
          ? "Insufficient privilege (non-fatal)"
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
