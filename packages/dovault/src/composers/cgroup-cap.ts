import { mkdir, writeFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { cpus } from "node:os";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

// R14: composer markers used to land under <workDir>/.sandbox/, but after
// dev-uid-allocator chowns <workDir> to the per-project sandbox uid (uid
// 10001+), the API uid (doable) can no longer write there. We now write to
// a sibling state dir owned by the doable user (provisioned at install time
// by deployment/server-setup.sh) and keyed by projectId derived from the
// workDir basename.
const SANDBOX_STATE_DIR =
  process.env.DOABLE_SANDBOX_STATE_DIR ?? "/var/lib/doable/sandbox";

function markerDirFor(workDir: string): string {
  return join(SANDBOX_STATE_DIR, basename(workDir));
}

export const cgroupCap: Composer = {
  id: "cgroup-cap",
  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean {
    return (
      !declared.cgroups &&
      (profile.limits.memBytes > 0 || profile.limits.cpuQuotaPercent > 0)
    );
  },
  build(profile: SandboxProfile, workDir: string): {
    preflight: PreflightStep[];
    teardown: TeardownStep[];
  } {
    const wrapPath = join(markerDirFor(workDir), "cgroup-wrap.txt");
    const memBytes = profile.limits.memBytes;
    const cpuQuotaPercent = profile.limits.cpuQuotaPercent;
    const nproc = cpus().length * 64;
    const cmd = `systemd-run --user --scope -p MemoryMax=${memBytes} -p CPUQuota=${cpuQuotaPercent}% -p TasksMax=${nproc} --`;
    const preflight: PreflightStep[] = [
      {
        id: "cgroup-cap:write-wrap",
        async run() {
          try {
            await mkdir(dirname(wrapPath), { recursive: true });
            // TODO: orchestrator must read <stateDir>/cgroup-wrap.txt and prepend to argv when this composer applies
            await writeFile(wrapPath, cmd, "utf8");
          } catch (err) {
            // R14: marker now lives under DOABLE_SANDBOX_STATE_DIR (doable-owned)
            // so EACCES is no longer expected on the chowned project tree. If
            // the state dir wasn't provisioned (old server, container without
            // the install-time mkdir) skip rather than crash. The wrap file
            // isn't consumed yet (TODO above), so this is safe.
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM" || e?.code === "ENOENT") {
              console.warn(`[cgroup-cap] ${e.code} on ${wrapPath} — skipping cgroup wrap (state dir not provisioned?)`);
              return;
            }
            throw err;
          }
        },
      },
    ];
    const teardown: TeardownStep[] = [
      {
        id: "cgroup-cap:remove-wrap",
        async run() {
          try {
            await unlink(wrapPath);
          } catch {
            /* ignore */
          }
        },
      },
    ];
    return { preflight, teardown };
  },
};

void ComposerError;
