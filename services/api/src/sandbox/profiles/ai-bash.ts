/**
 * ai-bash — the tightest jail profile.
 *
 * For the AI bash tool: no host visibility, synthetic /proc, synthetic
 * /etc, egress allowlist for AI providers + npm registry. 60s per-call
 * cap.
 *
 * See SandboxAgnosticSandboxingPRD/07-jail-profiles.md §ai-bash.
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { SpawnContext } from "../orchestrator.js";
import { getProjectPath } from "../../ai/project-files.js";
import type { SystemRules } from "../system-rules.js";
import { MB, NPM_CACHE_DIR } from "./constants.js";

export function aiBashProfile(ctx: SpawnContext, sys: SystemRules): SandboxProfile {
  // R14: prefer host-side sandbox uid (project dir owner) so the AI bash tool
  // can actually edit files. Default 65534 ("nobody") only when no hostUid is
  // available — that path can read but not write the project tree.
  const uid = ctx.hostUid ?? 65534;
  return {
    id: "ai-bash",
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
        { jail: "/tmp", sizeBytes: 100 * MB },
        { jail: "/run", sizeBytes: 10 * MB },
      ],
      procOverlay: {
        cpuinfo: { cores: 1, modelName: "Synthetic CPU", mhz: 1000 },
        meminfo: { totalKb: 512 * 1024, availableKb: 256 * 1024 },
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
          `project:x:${uid}:${uid}:project:/work:/bin/sh\nroot:x:0:0:root:/root:/bin/sh\n`,
        "/etc/group": `project:x:${uid}:\nroot:x:0:\n`,
        "/etc/hostname": "project\n",
        "/etc/resolv.conf": "nameserver 127.0.0.1\n",
        "/etc/os-release": "NAME=Doable\nID=doable\n",
      },
      masks: [
        "/opt/doable", "/home", "/root", "/var/lib/dpkg",
        "/var/log", "/sys/devices", "/sys/class/dmi", "/sys/firmware",
        "/dev/kmsg", "/dev/mem", "/dev/kvm",
      ],
    },
    ns: {
      pid: true,
      net: "egress-allowlist",
      uts: true,
      ipc: true,
      user: true,
    },
    user: {
      uid,
      gid: uid,
      passwd: {
        [uid]: `project:x:${uid}:${uid}:project:/work:/bin/sh`,
      },
    },
    syscalls: {
      capsKeep: [],
      seccompDefault: "errno",
      seccompDeny: [...sys.syscallFloors],
    },
    limits: {
      memBytes: 256 * MB,
      cpuQuotaPercent: 50,
      nproc: 64,
      nofile: 1024,
      cpuTimeSeconds: 60,
    },
    network: {
      defaultAction: "deny",
      allow: sys.profileNetworkAllows("ai-bash"),
      deny: [...sys.networkFloors, ...sys.profileNetworkDenies("ai-bash")],
    },
    env: {
      allowlist: ["PATH", "LANG", "LC_ALL", "HOME", "TERM"],
      inject: {
        HOME: "/work",
        PWD: "/work",
        USER: "project",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
    },
    timeoutMs: 60_000,
  };
}
