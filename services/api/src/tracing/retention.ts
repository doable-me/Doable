// Daily retention sweep. Deletes spans/logs/traces past their TTL.
// Wired into the existing background-job runner pattern in index.ts.

import { sql } from "../db/index.js";

const HOT_DAYS = 7;
const ERROR_DAYS = 30;

export async function runTracingRetention(): Promise<{ logs: number; spans_ok: number; spans_old: number; traces: number }> {
  const r1 = await sql`DELETE FROM trace_logs WHERE ts < now() - ${`${HOT_DAYS} days`}::interval`;
  const r2 = await sql`
    DELETE FROM spans
    WHERE started_at < now() - ${`${HOT_DAYS} days`}::interval
      AND trace_id IN (SELECT trace_id FROM traces WHERE status = 'ok')
  `;
  const r3 = await sql`DELETE FROM spans WHERE started_at < now() - ${`${ERROR_DAYS} days`}::interval`;
  const r4 = await sql`DELETE FROM traces WHERE started_at < now() - ${`${ERROR_DAYS} days`}::interval`;

  return {
    logs: r1.count ?? 0,
    spans_ok: r2.count ?? 0,
    spans_old: r3.count ?? 0,
    traces: r4.count ?? 0,
  };
}

let timer: NodeJS.Timeout | undefined;

export function startTracingRetention(intervalMs = 24 * 60 * 60 * 1000): void {
  if (timer) return;
  timer = setInterval(() => {
    runTracingRetention().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[tracing-retention] sweep failed: ${(err as Error).message}`);
    });
  }, intervalMs);
  // Allow clean shutdown
  if (typeof timer.unref === "function") timer.unref();
}

export function stopTracingRetention(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
