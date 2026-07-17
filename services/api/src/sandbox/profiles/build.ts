/**
 * build — quiet, lower-network production build jail.
 *
 * Install-like fs layout (rw /.npm-cache + dist/) but tighter network:
 * registry + sentry source upload only. 5 min timeout.
 *
 * See SandboxAgnosticSandboxingPRD/07-jail-profiles.md §build.
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { SpawnContext } from "../orchestrator.js";
import { getProjectPath } from "../../ai/project-files.js";
import type { SystemRules } from "../system-rules.js";
import { MB, GB, NPM_CACHE_DIR } from "./constants.js";

export function buildProfile(ctx: SpawnContext, sys: SystemRules): SandboxProfile {
  return {
    id: "build",
    fs: {
      rootDir: getProjectPath(ctx.projectId),
      readOnlyBinds: [
        { host: "/usr", jail: "/usr" },
        { host: "/bin", jail: "/bin" },
        { host: "/lib", jail: "/lib" },
        { host: "/lib64", jail: "/lib64" },
        { host: "/etc/ssl/certs", jail: "/etc/ssl/certs" },
        { host: NPM_CACHE_DIR, jail: "/.npm-cache" },
      ],
      tmpfs: [
        // BUG-2026-07-15-vite-oom-482b18d6: TanStack Start / React projects
        // with ~50 @radix-ui components + AI-SDK + shadcn produce dist bundles
        // approaching 15 MB per environment (client + server). Vite writes to
        // /tmp/vite during rollup finalize; the previous 500 MB was fine for
        // small SPAs but tight for large graphs. 1 GB is generous headroom
        // without exposing more of the host filesystem.
        { jail: "/tmp", sizeBytes: 1 * GB },
        { jail: "/run", sizeBytes: 10 * MB },
      ],
      procOverlay: {
        cpuinfo: { cores: 2, modelName: "Synthetic CPU", mhz: 1000 },
        // BUG-2026-07-15-vite-oom-482b18d6: bumped meminfo from 1 GB to 6 GB.
        // V8 sizes its default `--max-old-space-size` from the memory the
        // process sees (via /proc/meminfo, since we ProcMountFresh here), so
        // exposing 1 GB fell back to ~512 MB old-space and vite's
        // `transforming` phase self-aborted with "Reached heap limit" for
        // large React projects (~50 Radix components, 673 MB node_modules).
        // 6 GB tells V8 to pick a ~4 GB default AND matches the
        // limits.memBytes below (bumped in lockstep) so the cgroup doesn't
        // OOM-kill Node before V8's own limit fires.
        meminfo: { totalKb: 6 * 1024 * 1024, availableKb: 6 * 1024 * 1024 },
        uptimeSec: 1,
        loadavg: [0, 0, 0],
        mask: [
          "/proc/version", "/proc/partitions", "/proc/modules",
          "/proc/swaps", "/proc/stat", "/proc/diskstats",
          "/proc/mounts", "/proc/mountinfo", "/proc/mountstats",
          "/proc/interrupts", "/proc/cgroups", "/proc/kallsyms",
          "/proc/kcore", "/proc/keys",
        ],
      },
      etcSynth: {
        "/etc/passwd":
          "builder:x:9501:9501:builder:/work:/bin/sh\nroot:x:0:0:root:/root:/bin/sh\n",
        "/etc/group": "builder:x:9501:\nroot:x:0:\n",
        "/etc/hostname": "builder\n",
        "/etc/resolv.conf": "nameserver 127.0.0.1\n",
        "/etc/os-release": "NAME=Doable\nID=doable\n",
      },
      masks: ["/opt/doable", "/home", "/root", "/var/lib/dpkg", "/var/log"],
    },
    ns: {
      pid: true,
      net: "egress-allowlist",
      uts: true,
      ipc: true,
      user: true,
    },
    user: {
      uid: 9501,
      gid: 9501,
      passwd: {
        9501: "builder:x:9501:9501::/work:/bin/sh",
      },
    },
    syscalls: {
      capsKeep: [],
      seccompDefault: "errno",
      seccompDeny: [...sys.syscallFloors],
    },
    limits: {
      // BUG-2026-07-15-vite-oom-482b18d6: raised from 1 GB to 6 GB.
      // Vite/rollup transforming large React graphs (Radix + AI-SDK +
      // shadcn) peaks at ~2-3 GB resident. The cgroup memBytes IS the hard
      // ceiling — before this, Node hit the limit around ~510 MB (V8's
      // dynamic default from the fake /proc/meminfo=1GB) and self-aborted
      // with "Reached heap limit", but a raised NODE_OPTIONS alone would
      // just move the failure to a kernel OOM-kill unless memBytes was
      // raised in lockstep. Kept in sync with procOverlay.meminfo above.
      memBytes: 6 * GB,
      cpuQuotaPercent: 100,
      nproc: 512,
      nofile: 8192,
      cpuTimeSeconds: 300,
    },
    network: {
      defaultAction: "deny",
      allow: sys.profileNetworkAllows("build"),
      deny: [...sys.networkFloors, ...sys.profileNetworkDenies("build")],
    },
    env: {
      // BUG-2026-07-15-vite-oom-482b18d6: NODE_OPTIONS is BOTH on the
      // allowlist (so caller-supplied flags pass through) AND injected
      // with an explicit --max-old-space-size=4096 so V8 always has the
      // ceiling regardless of what builder.ts propagates. Without this,
      // the sandbox --clearenv drops any inherited NODE_OPTIONS and V8
      // falls back to its dynamic default computed from the fake
      // /proc/meminfo — which is why large React builds OOM'd at ~510 MB
      // even after we bumped procOverlay + memBytes above. Injecting here
      // is idempotent (V8 accepts the last --max-old-space-size wins).
      allowlist: ["PATH", "LANG", "HOME", "NODE_ENV", "NODE_OPTIONS"],
      inject: {
        HOME: "/work",
        PWD: "/work",
        USER: "builder",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
    },
    timeoutMs: 300_000,
  };
}
