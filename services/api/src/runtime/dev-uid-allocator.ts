/**
 * Dev sandbox UID pool — hands out one of 100 pre-created Linux users
 * (doable-dev-1..100, UIDs 10001..10100) to the dev server jail layer.
 *
 * Mirrors the port-allocator pattern: bounded resource, allocated on
 * dev-start, released on dev-stop. The OS users themselves are created
 * once during setup-server.sh (not at runtime — useradd needs root and
 * shouldn't run on the hot path).
 *
 * Pool exhaustion (>100 concurrent dev sessions) returns null and the
 * caller falls back to spawning without setpriv. No-op on non-Linux —
 * setpriv only exists on Linux. Windows/Mac dev keeps current behaviour.
 *
 * Pairs with `services/api/src/projects/vite-jail.ts` (uses the UID via
 * `setpriv --reuid`) and the nft drop rule in setup-server.sh which
 * blocks egress for skuid 10001-10100 except loopback.
 */

const POOL_SIZE = 100;
const UID_BASE = 10000; // doable-dev-N -> UID 10000+N

const inUse = new Map<string, number>(); // projectId -> UID
const free = new Set<number>(
  Array.from({ length: POOL_SIZE }, (_, i) => UID_BASE + i + 1),
);

/**
 * Acquire a UID for the given project. Idempotent — returning the same
 * UID on repeat calls for the same projectId until release. Returns
 * null on non-Linux (caller skips setpriv) or when the pool is empty.
 */
export function acquireDevUid(projectId: string): number | null {
  if (process.platform !== "linux") return null;
  const existing = inUse.get(projectId);
  if (existing !== undefined) return existing;
  const next = free.values().next().value as number | undefined;
  if (next === undefined) return null;
  free.delete(next);
  inUse.set(projectId, next);
  return next;
}

/** Release the UID held by projectId back to the pool. No-op if none. */
export function releaseDevUid(projectId: string): void {
  const uid = inUse.get(projectId);
  if (uid === undefined) return;
  inUse.delete(projectId);
  free.add(uid);
}

export function devUidStats(): {
  poolSize: number;
  inUse: number;
  free: number;
  assignments: Array<{ projectId: string; uid: number }>;
} {
  return {
    poolSize: POOL_SIZE,
    inUse: inUse.size,
    free: free.size,
    assignments: Array.from(inUse.entries()).map(([projectId, uid]) => ({
      projectId,
      uid,
    })),
  };
}
