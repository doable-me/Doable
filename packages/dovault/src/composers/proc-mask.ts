import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { SandboxProfile } from "../profile.js";
import type { PreflightStep, TeardownStep, DeclaredLayers } from "../backends/sandbox-backend.js";
import type { Composer } from "./types.js";
import { bindMount, unbindMount } from "./mount-helper.js";

const PROC_FILES = ["cpuinfo", "meminfo", "uptime", "loadavg"] as const;

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

export const procMask: Composer = {
  id: "proc-mask",

  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean {
    return !declared.procMask && profile.fs.procOverlay != null;
  },

  build(profile: SandboxProfile, workDir: string): { preflight: PreflightStep[]; teardown: TeardownStep[] } {
    const overlayDir = path.join(workDir, ".sandbox", "proc-overlay");

    const preflight: PreflightStep[] = [
      {
        id: "proc-mask:write-synthetic",
        async run() {
          if (process.platform !== "linux") {
            console.log(`[proc-mask] skipped on ${process.platform}`);
            return;
          }

          const overlay = profile.fs.procOverlay;
          if (!overlay) return;

          // Wrapper: dovault composers write into <workDir>/.sandbox/ as the
          // API uid, but dev-uid-allocator chowns the project tree to a
          // per-project sandbox uid (R12 + R13 ordering). If the parent
          // .sandbox dir was chowned away, fall back gracefully — the synthetic
          // /proc overlay is a hardening layer; the bwrap dev process boots
          // without it. R14 will route these writes through sandbox-spawn.
          try {

          const cores = overlay.cpuinfo?.cores ?? 1;
          const mhz = overlay.cpuinfo?.mhz ?? 2400;
          const modelName = overlay.cpuinfo?.modelName ?? "Synthetic CPU";
          const totalKb = overlay.meminfo?.totalKb ?? 1048576;
          const availableKb = overlay.meminfo?.availableKb ?? totalKb;
          const uptimeSec = overlay.uptimeSec ?? 0;
          const loadavg: readonly [number, number, number] =
            overlay.loadavg ?? [0, 0, 0];

          await mkdir(overlayDir, { recursive: true });
          await writeFile(path.join(overlayDir, "cpuinfo"), buildCpuinfo(cores, mhz, modelName));
          await writeFile(path.join(overlayDir, "meminfo"), buildMeminfo(totalKb, availableKb));
          await writeFile(path.join(overlayDir, "uptime"), buildUptime(uptimeSec));
          await writeFile(path.join(overlayDir, "loadavg"), buildLoadavg(loadavg));

          for (const name of PROC_FILES) {
            const src = path.join(overlayDir, name);
            const dst = `/proc/${name}`;
            try {
              await bindMount(src, dst, true);
            } catch (err) {
              // Synthetic file still exists as a debug artifact — swallow.
              console.warn(`[proc-mask] bind-mount ${src} -> ${dst} failed:`, err);
            }
          }
          } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e?.code === "EACCES" || e?.code === "EPERM") {
              console.warn(`[proc-mask] EACCES on .sandbox — skipping /proc overlay (R13 known gap)`);
              return;
            }
            throw err;
          }
        },
      },
    ];

    const teardown: TeardownStep[] = [
      {
        id: "proc-mask:remove-overlay",
        async run() {
          if (process.platform !== "linux") {
            return;
          }
          for (const name of PROC_FILES) {
            try {
              await unbindMount(`/proc/${name}`);
            } catch (err) {
              console.warn(`[proc-mask] umount /proc/${name} failed:`, err);
            }
          }
          await rm(overlayDir, { recursive: true, force: true });
        },
      },
    ];

    return { preflight, teardown };
  },
};
