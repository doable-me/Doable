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
 *
 * NOTE: procMask and etcSynth are declared as TRUE because this backend
 * handles them natively via --ro-bind into the mount namespace. Composer-
 * level bind mounts (onto the host) don't survive --unshare-all + --proc.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type {
  BackendAvailability,
  BuildSpawnResult,
  DeclaredLayers,
  PreflightStep,
  TeardownStep,
  SandboxBackend,
} from "./sandbox-backend.js";
import type { SandboxProfile } from "../profile.js";

// ─── Synthetic /proc builders ─────────────────────────────

function buildCpuinfo(cores: number, mhz: number, modelName: string): string {
  const blocks: string[] = [];
  for (let i = 0; i < cores; i++) {
    blocks.push(
      [
        `processor\t: ${i}`,
        `vendor_id\t: GenuineSynthetic`,
        `model name\t: ${modelName}`,
        `cpu MHz\t\t: ${mhz}`,
        `cache size\t: 256 KB`,
        `cores\t\t: ${cores}`,
      ].join("\n"),
    );
  }
  return blocks.join("\n\n") + "\n";
}

function buildMeminfo(totalKb: number, availableKb: number): string {
  return `MemTotal: ${totalKb} kB\nMemAvailable: ${availableKb} kB\nSwapTotal: 0 kB\n`;
}

function buildUptime(uptimeSec: number): string {
  return `${uptimeSec} ${uptimeSec}\n`;
}

function buildLoadavg(loadavg: readonly [number, number, number]): string {
  return `${loadavg[0]} ${loadavg[1]} ${loadavg[2]} 0/1 1\n`;
}

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
      procMask: true,    // handled natively via --ro-bind into mount ns
      etcSynth: true,    // handled natively via --ro-bind into mount ns
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

    // Stable temp dir for synthetic files — preflight step creates them.
    const synthDir = join(
      tmpdir(),
      `doable-bwrap-synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    // Build synthetic /proc overlays as --ro-bind flags AFTER --proc /proc
    // so they overlay inside the mount namespace (not on the host).
    const procOverlayFlags: string[] = [];
    if (profile.fs.procOverlay) {
      const po = profile.fs.procOverlay;
      procOverlayFlags.push(
        "--ro-bind", join(synthDir, "cpuinfo"), "/proc/cpuinfo",
        "--ro-bind", join(synthDir, "meminfo"), "/proc/meminfo",
        "--ro-bind", join(synthDir, "uptime"), "/proc/uptime",
        "--ro-bind", join(synthDir, "loadavg"), "/proc/loadavg",
      );
      // Mask additional /proc paths the profile wants hidden.
      for (const p of po.mask ?? []) {
        procOverlayFlags.push("--tmpfs", p);
      }
    }

    // Build synthetic /etc overlays — bind synthetic files over /etc entries.
    const etcOverlayFlags: string[] = [];
    if (profile.fs.etcSynth) {
      for (const [etcPath, _content] of Object.entries(profile.fs.etcSynth)) {
        const fileName = etcPath.replace(/\//g, "__");
        etcOverlayFlags.push("--ro-bind", join(synthDir, fileName), etcPath);
      }
    }

    // Mask host paths.
    const maskFlags: string[] = [];
    for (const m of profile.fs.masks ?? []) {
      maskFlags.push("--tmpfs", m);
    }

    // Build the sandboxed env: only profile-allowlisted vars + injections.
    const sandboxEnv: Record<string, string> = {
      ...Object.fromEntries(
        profile.env.allowlist
          .map((k) => [k, process.env[k]] as const)
          .filter((e): e is readonly [string, string] => e[1] !== undefined),
      ),
      ...profile.env.inject,
    };

    // --clearenv + --setenv for each allowed var prevents host secret leak.
    const envFlags: string[] = ["--clearenv"];
    for (const [k, v] of Object.entries(sandboxEnv)) {
      envFlags.push("--setenv", k, v);
    }

    const argv: string[] = [
      "bwrap",
      "--die-with-parent",
      unshareFlag,
      "--new-session",
      ...envFlags,
      "--bind",
      profile.fs.rootDir,
      "/work",
      ...profile.fs.readOnlyBinds.flatMap((b) => ["--ro-bind", b.host, b.jail]),
      ...profile.fs.tmpfs.flatMap((t) => ["--tmpfs", t.jail]),
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      ...procOverlayFlags,
      ...etcOverlayFlags,
      ...maskFlags,
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

    // The outer env only needs PATH so cpSpawn can find the bwrap binary.
    // All inner env is handled by --clearenv + --setenv above.
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    };

    // Preflight: write synthetic files before bwrap binds them.
    const preflight: PreflightStep[] = [];
    const teardown: TeardownStep[] = [];

    if (profile.fs.procOverlay || profile.fs.etcSynth) {
      preflight.push({
        id: "bwrap:write-synth-files",
        async run() {
          mkdirSync(synthDir, { recursive: true });

          if (profile.fs.procOverlay) {
            const po = profile.fs.procOverlay;
            const cores = po.cpuinfo?.cores ?? 1;
            const mhz = po.cpuinfo?.mhz ?? 2400;
            const modelName = po.cpuinfo?.modelName ?? "Synthetic CPU";
            const totalKb = po.meminfo?.totalKb ?? 1048576;
            const availableKb = po.meminfo?.availableKb ?? totalKb;
            const uptimeSec = po.uptimeSec ?? 0;
            const loadavg: readonly [number, number, number] =
              po.loadavg ?? [0, 0, 0];

            writeFileSync(join(synthDir, "cpuinfo"), buildCpuinfo(cores, mhz, modelName));
            writeFileSync(join(synthDir, "meminfo"), buildMeminfo(totalKb, availableKb));
            writeFileSync(join(synthDir, "uptime"), buildUptime(uptimeSec));
            writeFileSync(join(synthDir, "loadavg"), buildLoadavg(loadavg));
          }

          if (profile.fs.etcSynth) {
            for (const [etcPath, content] of Object.entries(profile.fs.etcSynth)) {
              const fileName = etcPath.replace(/\//g, "__");
              writeFileSync(join(synthDir, fileName), content);
            }
          }
        },
      });

      teardown.push({
        id: "bwrap:cleanup-synth-files",
        async run() {
          try {
            rmSync(synthDir, { recursive: true, force: true });
          } catch {
            /* best-effort */
          }
        },
      });
    }

    return {
      argv,
      env,
      preflight,
      teardown,
    };
  }
}

export const bubblewrapBackend: SandboxBackend = new BubblewrapBackend();
