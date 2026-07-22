/**
 * app-workflow — jail profile for workflow-related shell (mirrors ai-bash limits).
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { SpawnContext } from "../orchestrator.js";
import { getProjectPath } from "../../ai/project-files.js";
import type { SystemRules } from "../system-rules.js";
import { MB, NPM_CACHE_DIR } from "./constants.js";

const MEM_MB = Number(process.env.DOABLE_APP_WF_MEMORY_MB ?? 128);
const TIMEOUT_MS = Number(process.env.DOABLE_APP_WF_TIMEOUT_MS ?? 30_000);

export function appWorkflowProfile(ctx: SpawnContext, sys: SystemRules): SandboxProfile {
  const uid = ctx.hostUid ?? 65534;
  return {
    id: "app-workflow",
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
        { jail: "/tmp", sizeBytes: 50 * MB },
        { jail: "/run", sizeBytes: 10 * MB },
      ],
      procOverlay: {
        cpuinfo: { cores: 1, modelName: "Synthetic CPU", mhz: 1000 },
        meminfo: { totalKb: MEM_MB * 1024, availableKb: (MEM_MB / 2) * 1024 },
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
      memBytes: MEM_MB * MB,
      cpuQuotaPercent: 50,
      nproc: 32,
      nofile: 512,
      cpuTimeSeconds: Math.ceil(TIMEOUT_MS / 1000),
    },
    network: {
      defaultAction: "deny",
      allow: sys.profileNetworkAllows("app-workflow"),
      deny: [...sys.networkFloors, ...sys.profileNetworkDenies("app-workflow")],
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
    timeoutMs: TIMEOUT_MS,
  };
}
