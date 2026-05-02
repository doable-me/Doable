import { existsSync } from "node:fs";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * sandbox-exec (Seatbelt) — macOS default-deny FS profile.
 *
 * Per devframeworkPRD/11-cross-platform-sandbox.md §4.3. Apple's `/usr/bin/sandbox-exec`
 * is officially deprecated since macOS 10.15 but still ships and Apple uses
 * it internally. There is no public replacement on Intel / pre-15 macOS;
 * Apple's `container` CLI is the migration path for macOS 15+ Apple Silicon
 * (see PRD 11 §4.4, opt-in only).
 *
 * Provides:
 *   - SBPL `(deny default)` profile — FS, network, exec all opt-in
 *   - file-read* allowed on system frameworks + the workdir
 *   - file-write* allowed only inside workdir
 *   - network-outbound deny when blockNetwork is set
 *
 * Resource caps are best-effort (no cgroups on macOS):
 *   - launchd-style RLIMIT_RSS / RLIMIT_AS via shell wrapper if needed
 *   - CPU quota cannot be enforced; documented limitation.
 *
 * Priority 50 — well above DirectBackend's 0 so macOS goes from "no
 * isolation" (today) to "real default-deny FS profile". Below the Linux
 * systemd backend (80) and Windows psroot backend (70) by design — those
 * are the production paths; macOS is dev-host territory.
 */
export class SandboxExecBackend implements ResourceBackend {
  readonly name = "sandbox-exec";
  readonly description = "macOS Seatbelt SBPL profile (sandbox-exec)";
  readonly priority = 50;

  available(): boolean {
    if (process.platform !== "darwin") return false;
    return existsSync("/usr/bin/sandbox-exec");
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    const profile = this.buildProfile({ blockNetwork: options.blockNetwork });
    return {
      command: "/usr/bin/sandbox-exec",
      args: ["-p", profile, command, ...args],
    };
  }

  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    const profile = this.buildProfile({
      jail: options.jail,
      blockNetwork: options.blockNetwork,
    });
    return {
      command: "/usr/bin/sandbox-exec",
      args: ["-p", profile, command, ...args],
    };
  }

  private buildProfile(opts: { jail?: string; blockNetwork?: boolean }): string {
    const networkRule = opts.blockNetwork
      ? "(deny network*)"
      : "(allow network-outbound)\n(deny network-inbound)";

    const jailRule = opts.jail
      ? `(allow file-read* file-write* (subpath "${escape(opts.jail)}"))`
      : "";

    return `(version 1)
(deny default)
(allow process-fork)
(allow process-exec*)
(allow signal (target self))
(allow ipc-posix-shm)
(allow mach-lookup)
(allow sysctl-read)
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/System"))
(allow file-read* (subpath "/Library/Frameworks"))
(allow file-read* (subpath "/private/var/db/dyld"))
(allow file-read* (subpath "/dev"))
${jailRule}
${networkRule}
`;
  }
}

/** Escape a path for inclusion inside an SBPL string literal. */
function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
