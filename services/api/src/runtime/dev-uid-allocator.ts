/**
 * Dev sandbox UID allocator — hands out a Linux UID for setpriv to drop
 * privileges to before exec'ing dev-server / build / publish workloads.
 *
 * Auto-scaling: the kernel doesn't require `useradd` to be called for a
 * UID to be usable in `setpriv --reuid` or `chown`. We allocate from the
 * range 10001..65000 (~55,000 slots) directly. setup-server.sh still
 * pre-creates the first 1000 named users (`doable-dev-1..1000`) for `ps`
 * ergonomics and so admin commands like `id doable-dev-N` work, but the
 * allocator is free to hand out higher numeric UIDs without any prior
 * useradd call. The nft egress firewall in setup-server.sh covers the
 * full 10001..65000 range.
 *
 * Pool exhaustion (55,000 concurrent dev sessions on one host) is
 * implausible — we'd hit memory/CPU limits long before then. If exhausted,
 * the allocator returns null and the caller MUST refuse to spawn rather
 * than silently fall back to running as root. (Previous behaviour: warned
 * and continued. New behaviour: fail closed.)
 *
 * Pairs with `services/api/src/projects/vite-jail.ts` (uses the UID via
 * `setpriv --reuid`) and the nft drop rule in setup-server.sh which
 * blocks egress for skuid 10001-65000 except loopback.
 */

const UID_BASE = 10000;
const UID_MAX = 65000;
const POOL_SIZE = UID_MAX - UID_BASE; // 55,000 slots

// Pre-created named users (setup-server.sh useradd doable-dev-1..PRECREATED_USERS).
// The rest are numeric-only — kernel doesn't care, just a cosmetic difference
// in `ps` output (uid number vs name). Bump if you need more named entries.
const PRECREATED_USERS = 1000;

const inUse = new Map<string, number>();
const free = new Set<number>(
  Array.from({ length: POOL_SIZE }, (_, i) => UID_BASE + i + 1),
);

/**
 * Acquire a sandbox UID for the given project. Idempotent — repeat calls
 * for the same projectId return the same UID until release. Returns null
 * on non-Linux (caller skips setpriv) or — implausibly — when the entire
 * 55,000-slot range is exhausted (caller MUST refuse to spawn rather than
 * run as root).
 */
export function acquireDevUid(projectId: string): number | null {
  if (process.platform !== "linux") return null;
  const existing = inUse.get(projectId);
  if (existing !== undefined) return existing;
  const next = free.values().next().value as number | undefined;
  if (next === undefined) {
    // 55,000 concurrent dev sessions on one host is implausible — the
    // host's memory/CPU would have folded long before this. If we hit it,
    // something is wrong (leaked allocations from a code path that
    // forgot to releaseDevUid?). Caller must fail closed.
    console.error(
      `[dev-uid] FATAL: pool exhausted (${inUse.size} in use). Refusing to allocate.`,
    );
    return null;
  }
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
  preCreatedUsers: number;
  uidBase: number;
  uidMax: number;
  assignments: Array<{ projectId: string; uid: number }>;
} {
  return {
    poolSize: POOL_SIZE,
    inUse: inUse.size,
    free: free.size,
    preCreatedUsers: PRECREATED_USERS,
    uidBase: UID_BASE,
    uidMax: UID_MAX,
    assignments: Array.from(inUse.entries()).map(([projectId, uid]) => ({
      projectId,
      uid,
    })),
  };
}
