import type { Composer } from "./types.js";
import { ComposerError } from "./types.js";
import type { SandboxProfile } from "../profile.js";
import type {
  PreflightStep,
  TeardownStep,
  DeclaredLayers,
} from "../backends/sandbox-backend.js";

export const seccompBpf: Composer = {
  id: "seccomp-bpf",
  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean {
    return !declared.seccomp && profile.syscalls.seccompDeny.length > 0;
  },
  build(profile: SandboxProfile, _workDir: string): {
    preflight: PreflightStep[];
    teardown: TeardownStep[];
  } {
    const preflight: PreflightStep[] = [
      {
        id: "seccomp-bpf:load",
        async run() {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const libseccomp = await import("libseccomp" as string);
            // TODO: compile BPF filter from profile.syscalls and load via libseccomp.load()
            void libseccomp;
            void profile;
          } catch {
            console.warn(
              "[seccomp-bpf] libseccomp not available; skipping syscall filter",
            );
          }
        },
      },
    ];
    const teardown: TeardownStep[] = [];
    return { preflight, teardown };
  },
};

void ComposerError;
