import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "20", 10);

export const sql = postgres(DATABASE_URL, {
  max: poolSize,
  idle_timeout: 20,
  connect_timeout: 10,
  types: {
    // Ensure BigInt columns come back as numbers when safe
    bigint: postgres.BigInt,
  },
  onnotice: () => {
    // Suppress PostgreSQL NOTICE messages in dev
  },
});

/**
 * Run a health check query against the database.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 AS ok`;
    return result[0]?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Gracefully close the database connection pool.
 */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDb();
  process.exit(0);
});
