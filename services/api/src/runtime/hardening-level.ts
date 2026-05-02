/**
 * Single source of truth for DOABLE_HARDENING — read this in every jail
 * site (build, dev-server, runtime) so a `relaxed` or `off` setting in
 * dev/test disables jailing uniformly across all 3 layers.
 *
 * Levels:
 *   full     — vault.spawn with FS jail + cgroup + child-process limits
 *              (production default)
 *   relaxed  — vault.spawn with cgroup limits but no FS jail; legitimate
 *              dev workflows (debugger, profiler, ptrace) work
 *   off      — raw spawn, no jail at all (debug only)
 */
export type HardeningLevel = "full" | "relaxed" | "off";

export function getHardeningLevel(): HardeningLevel {
  const raw = (process.env.DOABLE_HARDENING ?? "full").toLowerCase();
  if (raw === "off" || raw === "relaxed" || raw === "full") return raw;
  return "full"; // unknown values fall back to safe default
}

/** Convenience: should the caller wrap its spawn with vault.spawn? */
export function shouldJail(): boolean {
  return getHardeningLevel() !== "off";
}
