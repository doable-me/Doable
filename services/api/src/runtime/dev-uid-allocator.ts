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

import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { getProjectPath } from "../ai/project-files.js";

const UID_BASE = 10000;
const UID_MAX = 65000;
const POOL_SIZE = UID_MAX - UID_BASE; // 55,000 slots

const SANDBOX_SPAWN_PATH = "/opt/doable/bin/sandbox-spawn";

/**
 * Detect whether the API can drop privileges via the sudo wrapper. Two
 * conditions must be met:
 *   1. `/opt/doable/bin/sandbox-spawn` exists (installed by setup-v3 / J).
 *   2. `sudo -n true` succeeds (NOPASSWD sudoers rule is in place).
 * When both are true, the API can chown project trees and spawn
 * UID-dropped vite processes even while running as an unprivileged user.
 *
 * Cached at module-load time. If operators install/uninstall the wrapper
 * after API boot, restart the API.
 */
function detectSudoWrapper(): { available: boolean; reason: string } {
  if (process.platform !== "linux") {
    return { available: false, reason: "non-linux platform" };
  }
  if (!existsSync(SANDBOX_SPAWN_PATH)) {
    return { available: false, reason: `wrapper not installed at ${SANDBOX_SPAWN_PATH}` };
  }
  try {
    // `sudo -nl <wrapper>` returns 0 iff the user can NOPASSWD-sudo the
    // wrapper specifically. `sudo -n true` is wrong because `true` isn't
    // in the doable-sandbox sudoers allowlist.
    const r = spawnSync("sudo", ["-nl", SANDBOX_SPAWN_PATH], {
      stdio: "ignore",
      timeout: 2000,
    });
    if (r.status === 0) {
      return { available: true, reason: `sudo -nl ${SANDBOX_SPAWN_PATH} succeeded` };
    }
    return {
      available: false,
      reason: `sudo -nl ${SANDBOX_SPAWN_PATH} failed (status=${r.status ?? "null"})`,
    };
  } catch (err) {
    return {
      available: false,
      reason: `sudo probe threw: ${(err as Error).message}`,
    };
  }
}

const sudoWrapper = detectSudoWrapper();
const isRoot =
  process.platform === "linux" &&
  typeof process.geteuid === "function" &&
  process.geteuid() === 0;

// One-time startup log describing which mode is active.
if (process.platform === "linux") {
  if (process.env.DOABLE_DEV_UID_DISABLED === "1") {
    console.log("[dev-uid] sandbox UID drop: disabled — DOABLE_DEV_UID_DISABLED=1");
  } else if (isRoot) {
    console.log("[dev-uid] sandbox UID drop: enabled — API running as root (direct chown + setpriv)");
  } else if (sudoWrapper.available) {
    console.log("[dev-uid] sandbox UID drop: enabled via sudo wrapper");
  } else {
    console.log(
      `[dev-uid] sandbox UID drop: disabled — ${sudoWrapper.reason}`,
    );
  }
}

/** Exported for vite-jail and dev-server-start to know whether to use sudo. */
export function isSandboxWrapperAvailable(): boolean {
  return sudoWrapper.available;
}

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
  // Operator opt-out for hosts without setpriv or when per-project UID
  // drop is genuinely not desired.
  if (process.env.DOABLE_DEV_UID_DISABLED === "1") return null;
  // The per-project UID drop only works when the API process can chown
  // the project tree to the new UID and exec setpriv against it. That
  // requires either:
  //   (a) the API runs as root (CAP_CHOWN + can exec setpriv directly), or
  //   (b) sudo is callable AND /opt/doable/bin/sandbox-spawn is installed,
  //       so the API can shell out to `sudo -n chown` + `sudo -n
  //       sandbox-spawn` (the v3 hardened default).
  // If neither path is open, we MUST fail closed — otherwise chown
  // silently fails and the spawned vite process can't read its own
  // project files.
  if (!isRoot && !sudoWrapper.available) {
    return null;
  }
  const existing = inUse.get(projectId);
  if (existing !== undefined) return existing;
  // Hydrate from on-disk owner — survives tsx-watch restarts. The in-memory
  // `inUse` Map resets on every reload, but the project directory keeps its
  // chowned uid. If a previous run handed out uid=N for this project, reclaim
  // N instead of allocating a fresh uid that would mismatch the dir owner
  // and cause EACCES at install/spawn time (BUG-R13 / preview-243).
  try {
    const projectPath = getProjectPath(projectId);
    const st = statSync(projectPath);
    const onDiskUid = st.uid;
    if (onDiskUid > UID_BASE && onDiskUid <= UID_MAX) {
      let claimed = false;
      for (const [, uid] of inUse) {
        if (uid === onDiskUid) {
          claimed = true;
          break;
        }
      }
      if (!claimed) {
        free.delete(onDiskUid);
        inUse.set(projectId, onDiskUid);
        console.log(
          `[dev-uid] reclaimed uid=${onDiskUid} for project=${projectId} from on-disk owner`,
        );
        return onDiskUid;
      }
    }
  } catch {
    // Dir missing or stat failed — fall through to fresh allocation.
  }
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
