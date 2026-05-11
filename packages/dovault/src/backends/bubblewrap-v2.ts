/**
 * bubblewrap-v2 — SandboxBackend adapter for bwrap (Linux).
 *
 * Wave 2 replacement for the legacy ResourceBackend-style bubblewrap.ts.
 * Pure adapter: no I/O at module load. The only runtime probe is
 * `available()` which shells out to `which bwrap` + `bwrap --version`.
 *
 * Native isolation declared: FS bind/overlay, PID ns, NET ns, seccomp,
 * capability drop. cgroups + /proc masking + /etc synthesis are left to
 * layer composers (see DeclaredLayers).
 */

import { execSync } from "node:child_process";

import type {
  BackendAvailability,
  BuildSpawnResult,
  DeclaredLayers,
  SandboxBackend,
} from "./sandbox-backend.js";
import type { SandboxProfile } from "../profile.js";

export class BubblewrapBackend implements SandboxBackend {
  readonly id = "bubblewrap";
  readonly priority = 80;

  async available(): Promise<BackendAvailability> {
    if (process.platform !== "linux") {
      return { ok: false, reason: "linux-only backend" };
    }
    try {
      execSync("which bwrap", { stdio: "ignore" });
    } catch {
      return { ok: false, reason: "bwrap binary not found" };
    }
    try {
      execSync("bwrap --version", { stdio: "ignore" });
    } catch {
      return { ok: false, reason: "bwrap binary not found" };
    }
    return { ok: true };
  }

  declaredLayers(): DeclaredLayers {
    return {
      fs: "full",
      pidNs: true,
      netNs: true,
      seccomp: true,
      cgroups: false,
      capsDrop: true,
      procMask: false,
      etcSynth: false,
      landlock: false,
      nftEgress: false,
    };
  }

  buildSpawn(
    profile: SandboxProfile,
    command: string,
    args: string[],
    _cwd: string,
  ): BuildSpawnResult {
    const unshareFlag =
      "--unshare-all" + (profile.ns.net === "host" ? " --share-net" : "");

    const argv: string[] = [
      "bwrap",
      "--die-with-parent",
      unshareFlag,
      "--new-session",
      "--bind",
      profile.fs.rootDir,
      "/work",
      ...profile.fs.readOnlyBinds.flatMap((b) => ["--ro-bind", b.host, b.jail]),
      ...profile.fs.tmpfs.flatMap((t) => ["--tmpfs", t.jail]),
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--chdir",
      "/work",
      "--uid",
      String(profile.user.uid),
      "--gid",
      String(profile.user.gid),
      "--hostname",
      "doable-jail",
      ...profile.syscalls.capsKeep.flatMap((c) => ["--cap-add", c]),
      "--",
      command,
      ...args,
    ];

    const env: Record<string, string> = {
      ...Object.fromEntries(
        profile.env.allowlist
          .map((k) => [k, process.env[k]] as const)
          .filter((e): e is readonly [string, string] => e[1] !== undefined),
      ),
      ...profile.env.inject,
    };

    return {
      argv,
      env,
      preflight: [],
      teardown: [],
    };
  }
}

export const bubblewrapBackend: SandboxBackend = new BubblewrapBackend();
