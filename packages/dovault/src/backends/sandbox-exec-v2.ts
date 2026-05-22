/**
 * sandbox-exec-v2 — macOS sandbox-exec backend implementing SandboxBackend.
 *
 * Pure adapter: imports only types from ../profile.js and ./sandbox-backend.js
 * plus node:fs/promises + node:path. sandbox-exec ships with macOS so we do
 * not shell out to probe availability.
 *
 * Layers: FS (partial, via SBPL subpath rules) + net (separate semantics via
 * SBPL network*). No PID-ns, no seccomp, no cgroups on macOS.
 */

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SandboxProfile } from "../profile.js";
import type {
  BackendAvailability,
  BuildSpawnResult,
  DeclaredLayers,
  PreflightStep,
  SandboxBackend,
  TeardownStep,
} from "./sandbox-backend.js";

function composeSbpl(profile: SandboxProfile): string {
  const roBinds = profile.fs.readOnlyBinds
    .map((b) => `(allow file-read* (subpath "${b.host}"))`)
    .join("\n    ");
  const tmpfs = profile.fs.tmpfs
    .map((t) => `(allow file-write* (subpath "${t.jail}"))`)
    .join("\n    ");
  const net =
    profile.ns.net === "host"
      ? "(allow network*)"
      : profile.ns.net === "none"
        ? "(deny network*)"
        : "(allow network-outbound)";

  return `(version 1)
(deny default)
(allow process-fork process-exec)
(allow file-read-data file-read-metadata
  (subpath "/usr") (subpath "/bin") (subpath "/lib") (subpath "/System")
  (subpath "${profile.fs.rootDir}"))
(allow file-write*
  (subpath "${profile.fs.rootDir}"))
    ${roBinds}
    ${tmpfs}
${net}
`;
}

function buildEnv(profile: SandboxProfile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of profile.env.allowlist) {
    const v = process.env[key];
    if (v !== undefined) out[key] = v;
  }
  for (const [k, v] of Object.entries(profile.env.inject)) {
    out[k] = v;
  }
  return out;
}

export const sandboxExecBackend: SandboxBackend = {
  id: "sandbox-exec",
  priority: 70,

  async available(): Promise<BackendAvailability> {
    if (process.platform === "darwin") {
      return { ok: true };
    }
    return { ok: false, reason: "macOS only" };
  },

  declaredLayers(): DeclaredLayers {
    return {
      fs: "partial",
      pidNs: false,
      netNs: true,
      seccomp: false,
      cgroups: false,
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
    cwd: string,
  ): BuildSpawnResult {
    const sbpl = composeSbpl(profile);
    const sbPath = join(cwd, ".sandbox", "sandbox-exec.sb");

    const preflight: PreflightStep[] = [
      {
        id: "write-sbpl",
        async run(): Promise<void> {
          await mkdir(dirname(sbPath), { recursive: true });
          await writeFile(sbPath, sbpl, "utf8");
        },
      },
    ];

    const teardown: TeardownStep[] = [
      {
        id: "unlink-sbpl",
        async run(): Promise<void> {
          try {
            await unlink(sbPath);
          } catch {
            // Idempotent: file may already be gone.
          }
        },
      },
    ];

    return {
      argv: ["sandbox-exec", "-f", sbPath, command, ...args],
      env: buildEnv(profile),
      preflight,
      teardown,
    };
  },
};
