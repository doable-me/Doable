// Tiny postgres client for the WS service. Used only by the OTel
// pg-exporter (and any future internal queries). Kept separate from
// services/api/src/db so the WS package can be built independently
// without cross-package source imports.

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "[ws] DATABASE_URL not set — tracing exporter will fail to write spans. Set it in .env.",
  );
}

export const sql: postgres.Sql = DATABASE_URL
  ? postgres(DATABASE_URL, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      types: { bigint: postgres.BigInt },
      onnotice: () => {},
    })
  : (new Proxy((() => {}) as unknown as postgres.Sql, {
      get: (_t, prop) => {
        if (prop === "end") return async () => {};
        return () => {
          throw new Error("Database not configured. Set DATABASE_URL in .env");
        };
      },
      apply: () => {
        throw new Error("Database not configured. Set DATABASE_URL in .env");
      },
    }) as postgres.Sql);

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
