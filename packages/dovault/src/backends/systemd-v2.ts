/**
 * systemd-v2 — Wave 2 SandboxBackend adapter for Linux.
 *
 * Uses `systemd-run --user --scope` to spawn the workload inside a transient
 * cgroup v2 scope with kernel-enforced resource limits:
 *   - MemoryMax  (OOM-killed past ceiling)
 *   - CPUQuota   (CPU bandwidth cap)
 *   - TasksMax   (process / thread count cap; blocks fork bombs)
 *   - IPAddressDeny=any (eBPF cgroup egress block, unless ns.net === "host")
 *
 * INTENTIONALLY NARROW LAYERING
 * -----------------------------
 * systemd-run --scope alone gives us cgroup-level enforcement and nothing
 * else: no filesystem jail, no seccomp filter, no pid/net namespace, no
 * capability drop. The composer layer (procMask, etcSynth, seccomp-bpf,
 * landlock) is expected to stack on top. `declaredLayers()` is therefore
 * deliberately honest about what we provide so the orchestrator can decide
 * which composers to attach.
 *
 * For richer native isolation (bind mounts, pid ns, …) prefer the bwrap or
 * psroot backends — they outrank us via the priority field.
 *
 * See SandboxAgnosticSandboxingPRD/06-architecture-sandbox-agnostic.md
 * for the authoritative spec.
 */

import { execSync } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";

import type {
  BackendAvailability,
  BuildSpawnResult,
  DeclaredLayers,
  SandboxBackend,
} from "./sandbox-backend.js";
import type { SandboxProfile } from "../profile.js";

const CGROUP_CONTROLLERS_PATH = "/sys/fs/cgroup/cgroup.controllers";

/**
 * Build the env block the workload will see: start from the profile's
 * allowlist (copied from `process.env`), then layer `inject` on top so
 * orchestrator-supplied values win over inherited ones.
 */
function buildEnv(profile: SandboxProfile): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of profile.env.allowlist) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(profile.env.inject)) {
    env[key] = value;
  }
  return env;
}

export const systemdBackend: SandboxBackend = {
  id: "systemd",
  priority: 60,

  async available(): Promise<BackendAvailability> {
    if (process.platform !== "linux") {
      return { ok: false, reason: "systemd-run is Linux-only" };
    }
    try {
      execSync("which systemd-run", { stdio: "pipe", timeout: 5000 });
    } catch {
      return { ok: false, reason: "systemd-run not found on PATH" };
    }
    try {
      accessSync(CGROUP_CONTROLLERS_PATH, fsConstants.R_OK);
    } catch {
      return {
        ok: false,
        reason: `cgroup v2 delegation unavailable (${CGROUP_CONTROLLERS_PATH} not readable)`,
      };
    }
    return { ok: true };
  },

  declaredLayers(): DeclaredLayers {
    return {
      fs: "none",
      pidNs: false,
      netNs: false,
      seccomp: false,
      cgroups: true,
      capsDrop: false,
      procMask: false,
      etcSynth: false,
      landlock: false,
      nftEgress: false,
    };
  },

  buildSpawn(
    profile: SandboxProfile,
    command: string,
    args: string[],
    _cwd: string,
  ): BuildSpawnResult {
    const argv: string[] = [
      "systemd-run",
      "--user",
      "--scope",
      "-p",
      `MemoryMax=${profile.limits.memBytes}`,
      "-p",
      `CPUQuota=${profile.limits.cpuQuotaPercent}%`,
      "-p",
      `TasksMax=${profile.limits.nproc}`,
    ];

    // cgroup v2 eBPF egress filter — applied unless caller asked for host net.
    if (profile.ns.net !== "host") {
      argv.push("-p", "IPAddressDeny=any");
    }

    argv.push("--", command, ...args);

    return {
      argv,
      env: buildEnv(profile),
      preflight: [],
      teardown: [],
    };
  },
};
