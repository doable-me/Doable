/**
 * install — pnpm/npm install jail.
 *
 * Narrowest network allow-list: package registries only (no AI providers,
 * no CDN). 10 min timeout. Even if a malicious postinstall slips past
 * `--ignore-scripts`, it can't phone home.
 *
 * See SandboxAgnosticSandboxingPRD/07-jail-profiles.md §install.
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { SpawnContext } from "../orchestrator.js";
import { getProjectPath } from "../../ai/project-files.js";
import type { SystemRules } from "../system-rules.js";
import { MB, GB, NPM_CACHE_DIR } from "./constants.js";

export function installProfile(ctx: SpawnContext, sys: SystemRules): SandboxProfile {
  return {
    id: "install",
    fs: {
      rootDir: getProjectPath(ctx.projectId),
      readOnlyBinds: [
        { host: "/usr", jail: "/usr" },
        { host: "/bin", jail: "/bin" },
        { host: "/lib", jail: "/lib" },
        { host: "/lib64", jail: "/lib64" },
        { host: "/etc/ssl/certs", jail: "/etc/ssl/certs" },
        // NPM cache is rw for install — see notes in PRD ch07 §install.
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
          "installer:x:9500:9500:installer:/work:/bin/sh\nroot:x:0:0:root:/root:/bin/sh\n",
        "/etc/group": "installer:x:9500:\nroot:x:0:\n",
        "/etc/hostname": "installer\n",
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
      uid: 9500,
      gid: 9500,
      passwd: {
        9500: "installer:x:9500:9500::/work:/bin/sh",
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
      cpuTimeSeconds: 600,
    },
    network: {
      defaultAction: "deny",
      allow: sys.profileNetworkAllows("install"),
      deny: [...sys.networkFloors, ...sys.profileNetworkDenies("install")],
    },
    env: {
      allowlist: ["PATH", "LANG", "HOME"],
      inject: {
        HOME: "/work",
        PWD: "/work",
        USER: "installer",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
    },
    timeoutMs: 600_000,
  };
}
