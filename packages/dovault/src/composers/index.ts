import type { SandboxProfile } from "../profile.js";
import type { DeclaredLayers } from "../backends/sandbox-backend.js";
import type { Composer } from "./types.js";
import { procMask } from "./proc-mask.js";
import { etcSynth } from "./etc-synth.js";

// Other composers added in W1-D2 — import lazily so this module compiles standalone:
let seccompBpf: Composer | undefined, landlock: Composer | undefined, nftEgress: Composer | undefined, cgroupCap: Composer | undefined, macProfile: Composer | undefined;
try { ({ seccompBpf } = await import("./seccomp-bpf.js")); } catch { /* not yet written */ }
try { ({ landlock } = await import("./landlock.js")); } catch {}
try { ({ nftEgress } = await import("./nft-egress.js")); } catch {}
try { ({ cgroupCap } = await import("./cgroup-cap.js")); } catch {}
try { ({ macProfile } = await import("./mac-profile.js")); } catch {}

export const allComposers: Composer[] = [procMask, etcSynth, seccompBpf, landlock, nftEgress, cgroupCap, macProfile].filter(Boolean) as Composer[];

export function pickComposers(profile: SandboxProfile, declared: DeclaredLayers): Composer[] {
  const disabled = (process.env.DOABLE_COMPOSERS_DISABLED ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return allComposers.filter(c => !disabled.includes(c.id) && c.applies(profile, declared));
}

export { procMask, etcSynth };
export * from "./types.js";
