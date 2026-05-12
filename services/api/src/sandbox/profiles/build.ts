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
        { jail: "/tmp", sizeBytes: 500 * MB },
        { jail: "/run", sizeBytes: 10 * MB },
      ],
      procOverlay: {
        cpuinfo: { cores: 2, modelName: "Synthetic CPU", mhz: 1000 },
        meminfo: { totalKb: 1024 * 1024, availableKb: 512 * 1024 },
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
      memBytes: 1 * GB,
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
      allowlist: ["PATH", "LANG", "HOME", "NODE_ENV"],
      inject: {
        HOME: "/work",
        PWD: "/work",
        USER: "builder",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NODE_ENV: "production",
      },
    },
    timeoutMs: 300_000,
  };
}
