import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { cpus } from "node:os";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

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
    const wrapPath = `${workDir}/.sandbox/cgroup-wrap.txt`;
    const memBytes = profile.limits.memBytes;
    const cpuQuotaPercent = profile.limits.cpuQuotaPercent;
    const nproc = cpus().length * 64;
    const cmd = `systemd-run --user --scope -p MemoryMax=${memBytes} -p CPUQuota=${cpuQuotaPercent}% -p TasksMax=${nproc} --`;
    const preflight: PreflightStep[] = [
      {
        id: "cgroup-cap:write-wrap",
        async run() {
          // R13 EACCES wrapper: when dev-uid-allocator chowned <workDir> to
          // the dropped-priv sandbox uid (uid 10001), the API uid can't write
          // into <workDir>/.sandbox/. The wrap file isn't consumed yet
          // (TODO below), so skipping is safe; R14 will move this through
          // sandbox-spawn.
          try {
            await mkdir(dirname(wrapPath), { recursive: true });
            // TODO: orchestrator must read .sandbox/cgroup-wrap.txt and prepend to argv when this composer applies
            await writeFile(wrapPath, cmd, "utf8");
          } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM") {
              console.warn(`[cgroup-cap] EACCES on .sandbox — skipping cgroup wrap (R13 known gap)`);
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
