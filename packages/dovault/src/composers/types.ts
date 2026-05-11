import type { SandboxProfile } from "../profile.js";
import type { PreflightStep, TeardownStep, DeclaredLayers } from "../backends/sandbox-backend.js";

export interface Composer {
  readonly id: string;
  applies(profile: SandboxProfile, declared: DeclaredLayers): boolean;
  build(profile: SandboxProfile, workDir: string): { preflight: PreflightStep[]; teardown: TeardownStep[] };
}

export class ComposerError extends Error {
  constructor(public composerId: string, message: string) {
    super(`[${composerId}] ${message}`);
    this.name = "ComposerError";
  }
}
