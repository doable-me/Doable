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
  // Windows: dovault's per-project isolation primitives (cgroups,
  // bubblewrap, systemd hardening) are Linux-only. On Windows we run
  // raw — the security story on Windows is "your dev box, your rules"
  // anyway; the real hardening lives on the Linux production hosts.
  // Without this, vault.spawn(... full hardening ...) causes long-lived
  // dev-server processes (next-server) to exit cleanly within seconds
  // of becoming ready, leaving the user stuck on "Starting preview…".
  if (process.platform === "win32") return false;
  return getHardeningLevel() !== "off";
}
