import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { SandboxProfile } from "../profile.js";
import type { PreflightStep, TeardownStep, DeclaredLayers } from "../backends/sandbox-backend.js";
import type { Composer } from "./types.js";
import { bindMount, unbindMount } from "./mount-helper.js";

/**
 * Build /etc/passwd content from profile.user.passwd, which is
 * Record<number, string> where each string is a full passwd line.
 */
function buildPasswd(passwd: Record<number, string>): string {
  const lines = Object.values(passwd).map((line) => line.trim());
  return lines.join("\n") + "\n";
}

/**
 * Derive /etc/group from passwd lines. Format: `name:x:gid:`
 * Each passwd line is `name:x:uid:gid:gecos:home:shell`.
 */
function buildGroup(passwd: Record<number, string>): string {
  const lines: string[] = [];
  for (const line of Object.values(passwd)) {
    const fields = line.split(":");
    if (fields.length < 4) continue;
    const name = fields[0];
    const gid = fields[3];
    lines.push(`${name}:x:${gid}:`);
  }
  return lines.join("\n") + "\n";
}

export const etcSynth: Composer = {
  id: "etc-synth",

  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean {
    return Object.keys(profile.user.passwd).length > 0 && !declared.etcSynth;
  },

  build(profile: SandboxProfile, workDir: string): { preflight: PreflightStep[]; teardown: TeardownStep[] } {
    const etcDir = path.join(workDir, ".sandbox", "etc");
    // Track jail-side paths we need to bind-mount + later unmount.
    const mounts: Array<{ src: string; dst: string }> = [];

    const preflight: PreflightStep[] = [
      {
        id: "etc-synth:write-synthetic",
        async run() {
          if (process.platform !== "linux") {
            console.log(`[etc-synth] skipped on ${process.platform}`);
            return;
          }

          // R13 EACCES wrapper: if <workDir>/.sandbox/ is owned by the
          // dropped-priv sandbox uid (uid 10001 from dev-uid-allocator) the
          // API uid can't write into it. Fall back gracefully — the synthetic
          // /etc is a hardening layer; the bwrap dev process boots without it.
          // R14 will route this through sandbox-spawn.
          try {
            await mkdir(etcDir, { recursive: true });
            await writeFile(path.join(etcDir, "passwd"), buildPasswd(profile.user.passwd));
            await writeFile(path.join(etcDir, "group"), buildGroup(profile.user.passwd));
            mounts.push({ src: path.join(etcDir, "passwd"), dst: "/etc/passwd" });
            mounts.push({ src: path.join(etcDir, "group"), dst: "/etc/group" });

            // profile.fs.etcSynth is Record<jailPath, content> — write each as-is
            for (const [jailPath, content] of Object.entries(profile.fs.etcSynth)) {
              const fileName = path.basename(jailPath);
              const src = path.join(etcDir, fileName);
              await writeFile(src, content);
              mounts.push({ src, dst: jailPath });
            }
          } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM") {
              console.warn(`[etc-synth] EACCES on .sandbox — skipping synthetic /etc (R13 known gap)`);
              return;
            }
            throw err;
          }

          for (const { src, dst } of mounts) {
            try {
              await bindMount(src, dst, true);
            } catch (err) {
              // Synthetic file still exists as a debug artifact — swallow.
              console.warn(`[etc-synth] bind-mount ${src} -> ${dst} failed:`, err);
            }
          }
        },
      },
    ];

    const teardown: TeardownStep[] = [
      {
        id: "etc-synth:remove-overlay",
        async run() {
          if (process.platform !== "linux") {
            return;
          }
          for (const { dst } of mounts) {
            try {
              await unbindMount(dst);
            } catch (err) {
              console.warn(`[etc-synth] umount ${dst} failed:`, err);
            }
          }
          await rm(etcDir, { recursive: true, force: true });
        },
      },
    ];

    return { preflight, teardown };
  },
};
