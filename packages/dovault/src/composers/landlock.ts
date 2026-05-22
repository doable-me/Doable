import { readFile } from "node:fs/promises";
import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

export const landlock: Composer = {
  id: "landlock",
  applies(profile: SandboxProfile, _declared: DeclaredLayers): boolean {
    return process.platform === "linux" && profile.fs.masks.length > 0;
  },
  build(profile: SandboxProfile, _workDir: string): {
    preflight: PreflightStep[];
    teardown: TeardownStep[];
  } {
    const preflight: PreflightStep[] = [
      {
        id: "landlock:check-kernel",
        async run() {
          let release = "";
          try {
            release = await readFile("/proc/sys/kernel/osrelease", "utf8");
          } catch {
            console.warn("[landlock] could not read kernel release; skipping");
            return;
          }
          const m = release.match(/^(\d+)\.(\d+)/);
          if (!m) {
            console.warn("[landlock] could not parse kernel release; skipping");
            return;
          }
          const major = Number(m[1]);
          const minor = Number(m[2]);
          if (major < 5 || (major === 5 && minor < 13)) {
            console.warn("[landlock] kernel < 5.13; skipping");
            return;
          }
          // TODO: issue Landlock syscalls via napi binding or wrapper binary
          void profile;
        },
      },
    ];
    const teardown: TeardownStep[] = [];
    return { preflight, teardown };
  },
};

void ComposerError;
