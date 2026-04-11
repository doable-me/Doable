let querySeq = 0;
const slowQueryThresholdMs = 500;

const stats = {
  totalQueries: 0,
  totalErrors: 0,
  totalDurationMs: 0,
  slowQueries: 0,
};

export function getQueryStats() {
  return { ...stats };
}

export function resetQueryStats() {
  stats.totalQueries = 0;
  stats.totalErrors = 0;
  stats.totalDurationMs = 0;
  stats.slowQueries = 0;
}

export function traceQuery(queryText: string, durationMs: number, error?: string, rowCount?: number): void {
  stats.totalQueries++;
  stats.totalDurationMs += durationMs;

  const seq = ++querySeq;
  const normalized = queryText.replace(/\s+/g, " ").trim().slice(0, 200);

  if (error) {
    stats.totalErrors++;
    console.error(`[DB:${seq}] ${durationMs}ms ERROR ${normalized} — ${error}`);
    return;
  }

  if (durationMs >= slowQueryThresholdMs) {
    stats.slowQueries++;
    console.warn(`[DB:${seq}] ${durationMs}ms SLOW ${normalized} rows=${rowCount ?? "?"}`);
    return;
  }

  if (process.env.DOABLE_DB_TRACE === "1") {
    console.log(`[DB:${seq}] ${durationMs}ms OK ${normalized} rows=${rowCount ?? "?"}`);
  }
}
