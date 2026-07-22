/**
 * Minimal 5-field cron next-occurrence helper (no external deps).
 * Supports: minute hour day-of-month month day-of-week
 * Values: number, *, *\/n, lists (1,2,3), ranges (1-5)
 */

function parseField(
  field: string,
  min: number,
  max: number,
): (n: number) => boolean {
  if (field === "*") return () => true;
  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    if (!Number.isFinite(step) || step <= 0) return () => false;
    return (n) => (n - min) % step === 0;
  }
  const allowed = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      for (let i = a!; i <= b!; i++) allowed.add(i);
    } else {
      const v = Number(part);
      if (Number.isFinite(v)) allowed.add(v);
    }
  }
  return (n) => allowed.has(n);
}

export function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = parts;
  const matchMin = parseField(minF!, 0, 59);
  const matchHour = parseField(hourF!, 0, 23);
  const matchDom = parseField(domF!, 1, 31);
  const matchMon = parseField(monF!, 1, 12);
  const matchDow = parseField(dowF!, 0, 6);
  return (
    matchMin(date.getUTCMinutes()) &&
    matchHour(date.getUTCHours()) &&
    matchDom(date.getUTCDate()) &&
    matchMon(date.getUTCMonth() + 1) &&
    matchDow(date.getUTCDay())
  );
}

/** Next UTC Date matching cron (searches up to 366 days, 1-minute steps). */
export function nextCronOccurrence(
  cron: string,
  _timezone = "UTC",
  from: Date = new Date(),
): Date {
  // v1: interpret cron in UTC (timezone recorded for future use)
  const start = new Date(from);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);
  const limit = 366 * 24 * 60;
  const cur = new Date(start);
  for (let i = 0; i < limit; i++) {
    if (cronMatches(cron, cur)) return new Date(cur);
    cur.setUTCMinutes(cur.getUTCMinutes() + 1);
  }
  // Fallback: +1 day
  return new Date(from.getTime() + 86_400_000);
}

export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5;
}
