/**
 * vite-preview — long-running, file-watch heavy, network-permissive.
 *
 * For the vite dev server: needs inotify, localhost bind, outbound for
 * HMR + AI gateway + ESM CDNs. No cpuTimeSeconds cap; supervised by
 * api/dev-server.ts.
 *
 * See SandboxAgnosticSandboxingPRD/07-jail-profiles.md §vite-preview.
 */

import type { SandboxProfile } from "../../../../../packages/dovault/src/profile.js";
import type { SpawnContext } from "../orchestrator.js";
import { getProjectPath } from "../../ai/project-files.js";
import type { SystemRules } from "../system-rules.js";
import { MB, NPM_CACHE_DIR } from "./constants.js";

function perProjectUid(projectId: string): number {
  // Fallback per-project uid (9000-9999) used ONLY when SpawnContext doesn't
  // carry a hostUid (local dev, tests). Production paths always pass
  // ctx.hostUid from dev-uid-allocator so the inside-NS uid matches the
  // host file owner — see SpawnContext.hostUid docs in orchestrator.ts.
  const first = projectId.length > 0 ? projectId.charCodeAt(0) : 0;
  return 9000 + (first % 1000);
}

export function vitePreviewProfile(ctx: SpawnContext, sys: SystemRules): SandboxProfile {
  // Prefer the host-side sandbox uid (matches project dir owner) so writes
  // inside the bwrap user namespace don't EACCES. Fallback to derived uid
  // for code paths that haven't been updated to thread hostUid.
  const uid = ctx.hostUid ?? perProjectUid(ctx.projectId);

  return {
    id: "vite-preview",
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
          `preview:x:${uid}:${uid}:preview:/work:/bin/sh\nroot:x:0:0:root:/root:/bin/sh\n`,
        "/etc/group": `preview:x:${uid}:\nroot:x:0:\n`,
        "/etc/hostname": "preview\n",
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
      uid,
      gid: uid,
      passwd: {
        [uid]: `preview:x:${uid}:${uid}:preview:/work:/bin/sh`,
      },
    },
    syscalls: {
      capsKeep: [],
      seccompDefault: "errno",
      seccompDeny: [...sys.syscallFloors],
    },
    limits: {
      memBytes: 512 * MB,
      cpuQuotaPercent: 75,
      nproc: 256,
      nofile: 4096,
      cpuTimeSeconds: 0,
    },
    network: {
      defaultAction: "deny",
      allow: sys.profileNetworkAllows("vite-preview"),
      deny: [...sys.networkFloors, ...sys.profileNetworkDenies("vite-preview")],
    },
    env: {
      allowlist: ["PATH", "LANG", "LC_ALL", "HOME", "TERM", "NODE_ENV"],
      inject: {
        HOME: "/work",
        PWD: "/work",
        USER: "preview",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        NODE_ENV: "development",
      },
    },
    timeoutMs: 0,
  };
}
