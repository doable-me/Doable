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
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

// Per-project sandbox-uid pool (see dev-uid-allocator). Anything in this
// range needs the setuid helper because the calling API process runs as the
// unprivileged `doable` user and bwrap can't elevate to a foreign uid by
// itself — sandbox-spawn does the setpriv flip with root and exec's bwrap.
const SANDBOX_UID_POOL_MIN = 10001;
const SANDBOX_SPAWN_PATH = "/opt/doable/bin/sandbox-spawn";

/**
 * Detect whether the `sudo + sandbox-spawn` uid-flip path is actually usable
 * on this host. BOTH must hold:
 *   1. `/opt/doable/bin/sandbox-spawn` exists (installed by setup-server.sh /
 *      the secure docker image), AND
 *   2. a `sudo` binary is resolvable on PATH.
 *
 * BUG-OOB-DOCKER-SUDO: the DEFAULT docker compose (deployment/docker/
 * docker-compose.yml → `api` target) installs `bwrap` but NOT `sudo` and NOT
 * the sandbox-spawn wrapper — only the secure image (Dockerfile.secure +
 * setup-server.sh) provisions those. The AI bash tool resolves the ai-bash
 * profile with uid 65534 ("nobody", since dev-uid-allocator returns null when
 * no wrapper is present), which is >= SANDBOX_UID_POOL_MIN, so the old
 * unconditional `euid != 0 && uid >= POOL_MIN` test prepended
 * `sudo -n /opt/doable/bin/sandbox-spawn …` and Node threw
 * `spawn sudo ENOENT` → every `npm run build` inside the jail failed →
 * the AI could never verify/auto-fix generated apps. Gate the sudo path the
 * same way services/api/src/runtime/dev-uid-allocator.ts (detectSudoWrapper)
 * and projects/vite-jail.ts (isSandboxWrapperAvailable) already do, so we
 * degrade to a direct, unprivileged `bwrap` spawn (which the container's
 * unprivileged `node` user can do via user namespaces — the reason bwrap is
 * in the default api image) instead of spawning a non-existent sudo.
 *
 * Cached at module load. Restart the API if the wrapper is installed/removed
 * after boot — matches dev-uid-allocator's caching contract.
 */
function detectSandboxSpawnWrapper(): boolean {
  if (process.platform !== "linux") return false;
  if (!existsSync(SANDBOX_SPAWN_PATH)) return false;
  try {
    // `command -v sudo` is the portable PATH probe; execSync throws (non-zero
    // exit) when sudo is absent, which is exactly the default-docker case.
    execSync("command -v sudo", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const SANDBOX_SPAWN_WRAPPER_AVAILABLE = detectSandboxSpawnWrapper();

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
    // Network namespace handling:
    //   - "none": fully isolated (no network at all)
    //   - "host": share host network entirely
    //   - "egress-allowlist": share host network so the API can reach the
    //     dev server's listener, with egress restrictions enforced
    //     externally by host-level nftables rules per sandbox UID (see
    //     setup-server.sh nft chain for UID range 10001-65000).
    // A fully isolated netns would make 127.0.0.1:<port> unreachable from
    // the API process, breaking the preview proxy. Each flag is a separate
    // argv element (bwrap does not parse space-joined options).
    const shareNet = profile.ns.net === "host" || profile.ns.net === "egress-allowlist";
    const unshareFlags: string[] = shareNet
      ? ["--unshare-all", "--share-net"]
      : ["--unshare-all"];

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
      // Mask additional /proc paths the profile wants hidden. These are
      // FILES under /proc (e.g. /proc/version, /proc/kallsyms), so we mask
      // by ro-binding /dev/null on top — `--tmpfs` fails with "Not a
      // directory" because tmpfs requires a directory mount point.
      //
      // procfs refuses file creation, so bwrap can only bind ONTO an
      // already-existing /proc entry. Some profile entries reference
      // per-PID paths (e.g. /proc/mountinfo is actually /proc/<pid>/mountinfo
      // and absent at the top level) — skip them if missing on the host
      // rather than aborting the whole spawn.
      for (const p of po.mask ?? []) {
        if (existsSync(p)) {
          procOverlayFlags.push("--ro-bind", "/dev/null", p);
        }
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

    const bwrapArgv: string[] = [
      "bwrap",
      "--die-with-parent",
      ...unshareFlags,
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

    // When the API runs unprivileged (euid != 0) but the profile asks for a
    // per-project sandbox uid (>= SANDBOX_UID_POOL_MIN), bwrap alone can't
    // make the uid flip — only a privileged setuid helper can. Mirror the
    // pattern from services/api/src/projects/vite-jail.ts: prepend
    // `sudo -n /opt/doable/bin/sandbox-spawn <uid> <projectId>` so the helper
    // does setpriv + exec's our bwrap argv. Project id is the basename of
    // rootDir (sandbox-spawn validates it against ${PROJECTS_PREFIX}/<uuid>).
    const profileUid = profile.user?.uid;
    const euid = typeof process.geteuid === "function" ? process.geteuid() : 0;
    // BUG-OOB-DOCKER-SUDO: only take the sudo+sandbox-spawn path when that
    // wrapper is ACTUALLY installed (see detectSandboxSpawnWrapper). On the
    // default docker image sudo/the wrapper are absent, so we fall through to
    // a direct unprivileged `bwrap` spawn rather than `spawn sudo ENOENT`.
    const needsSandboxSpawn =
      euid !== 0 &&
      typeof profileUid === "number" &&
      profileUid >= SANDBOX_UID_POOL_MIN &&
      SANDBOX_SPAWN_WRAPPER_AVAILABLE;

    // sandbox-spawn validates CMD against an exact-match allowlist; the
    // unwrapped path uses bare "bwrap" (cpSpawn resolves via PATH) but the
    // helper requires the absolute /usr/bin/bwrap form.
    const argv: string[] = needsSandboxSpawn
      ? [
          "sudo",
          "-n",
          SANDBOX_SPAWN_PATH,
          String(profileUid),
          basename(profile.fs.rootDir),
          "/usr/bin/bwrap",
          ...bwrapArgv.slice(1),
        ]
      : bwrapArgv;

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
