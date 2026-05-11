import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

const APPARMOR_PROFILES_PATH = "/sys/kernel/security/apparmor/profiles";
const SELINUX_ENFORCE_PATH = "/sys/fs/selinux/enforce";
const APPARMOR_PROFILE_FILE = "/etc/apparmor.d/doable-ai-bash";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function runApparmorParser(profileFile: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("apparmor_parser", ["-r", profileFile], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({ code: -1, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stderr });
    });
  });
}

export const macProfile: Composer = {
  id: "mac-profile",

  applies(_profile: SandboxProfile, _declared: DeclaredLayers): boolean {
    return process.platform === "linux";
  },

  build(_profile: SandboxProfile, _workDir: string): {
    preflight: PreflightStep[];
    teardown: TeardownStep[];
  } {
    const preflight: PreflightStep[] = [
      {
        id: "mac-profile:detect-and-load",
        async run() {
          const hasApparmor = await pathExists(APPARMOR_PROFILES_PATH);
          const hasSelinux = await pathExists(SELINUX_ENFORCE_PATH);

          if (hasApparmor) {
            // Prefer AppArmor (Doable default on Ubuntu/Debian).
            const profileExists = await pathExists(APPARMOR_PROFILE_FILE);
            if (!profileExists) {
              console.warn(
                `[mac-profile] AppArmor profile ${APPARMOR_PROFILE_FILE} missing — install it via setup-server.sh`,
              );
              return;
            }
            const result = await runApparmorParser(APPARMOR_PROFILE_FILE);
            if (result.code !== 0) {
              console.warn(
                `[mac-profile] apparmor_parser -r ${APPARMOR_PROFILE_FILE} exited ${result.code}: ${result.stderr.trim()}`,
              );
            }
            return;
          }

          if (hasSelinux) {
            // TODO: load Doable SELinux module via `semodule -i doable.pp`
            console.warn(
              `[mac-profile] SELinux detected but not yet wired — skipping (TODO: semodule -i doable.pp)`,
            );
            return;
          }

          // Neither MAC system available.
          const allowNoMac = process.env.DOABLE_ALLOW_NO_MAC === "1";
          const hardening = process.env.DOABLE_HARDENING_LEVEL ?? "";
          const isHardenedEnv = hardening === "staging" || hardening === "prod";
          if (isHardenedEnv && !allowNoMac) {
            throw new ComposerError(
              "mac-profile",
              `no MAC system (AppArmor/SELinux) present in DOABLE_HARDENING_LEVEL=${hardening}; set DOABLE_ALLOW_NO_MAC=1 to override`,
            );
          }
          console.warn(`[mac-profile] no MAC system present; relying on user-mode jail only`);
        },
      },
    ];

    const teardown: TeardownStep[] = [
      // No-op: MAC profile stays loaded between runs (idempotent).
    ];

    return { preflight, teardown };
  },
};
