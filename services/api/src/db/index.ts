import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠ DATABASE_URL not set — database queries will fail. Set it in .env to connect to PostgreSQL.");
}

const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "20", 10);

// Per-query debug hook. postgres.js v3 invokes this at query START with the
// formatted SQL text and bound parameters. It does NOT carry end-of-query
// timing, so we cannot close a span from here — that's why per-query OTel
// spans + duration tracking live in `tracedQuery()` (see ./traced.ts), which
// hot-path callers should wrap their queries in. The hook here is kept for
// optional verbose logging (gated on env to avoid log spam in prod).
const dbDebug = (
  _connection: number,
  query: string,
  _parameters: unknown[],
  _paramTypes: unknown[],
): void => {
  if (process.env.DOABLE_DB_DEBUG === "1") {
    const normalized = query.replace(/\s+/g, " ").trim().slice(0, 200);
    console.log(`[DB:debug] ${normalized}`);
  }
};

// Widen the type to `postgres.Sql` (= Sql<{}>) so the client is structurally
// compatible with the `@doable/db` query functions, which all declare their
// parameter as `postgres.Sql`. The `types: { bigint }` runtime option still
// runs — big integers still come back as native `bigint` — we just don't
// advertise that in the exported TYPE, which would otherwise force every
// query callsite through an `as unknown as postgres.Sql` cast.
//
// NOTE FOR FUTURE CALLERS: hot-path DB calls should be wrapped with
// `tracedQuery(name, sqlText, () => sql`…`)` from `./traced.js` so they emit
// OTel `db <name>` spans and feed `traceQuery()` stats. The raw `sql` export
// remains untraced by design — wrapping all 28 query files is Phase C.
export const sql: postgres.Sql = DATABASE_URL
  ? postgres(DATABASE_URL, {
      max: poolSize,
      idle_timeout: 20,
      connect_timeout: 10,
      types: {
        bigint: postgres.BigInt,
      },
      onnotice: () => {},
      debug: dbDebug,
    })
  : (new Proxy((() => {}) as unknown as postgres.Sql, {
      get: (_target, prop) => {
        if (prop === "end") return async () => {};
        return () => {
          throw new Error("Database not configured. Set DATABASE_URL in .env");
        };
      },
      apply: () => {
        throw new Error("Database not configured. Set DATABASE_URL in .env");
      },
    }) as postgres.Sql);

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
