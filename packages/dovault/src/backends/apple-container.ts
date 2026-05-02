import { execSync } from "node:child_process";
import { release } from "node:os";

import type { ResourceBackend } from "./types.js";
import type { ResourceLimits, WrapResult } from "../types.js";

/**
 * Apple Container — macOS 15+ Apple Silicon hardware-virtualised sandbox.
 *
 * Per devframeworkPRD/11-cross-platform-sandbox.md §4.4. Wraps the native
 * `container` CLI (Apple Containerization Framework) which provides a
 * Linux VM-backed runtime with Apple-Silicon optimised guest kernel.
 *
 * Opt-in only — Apple's `container` CLI is GA on macOS 15+ Apple Silicon
 * but absent from older releases and Intel Macs. Activated when:
 *   - process.platform === "darwin"
 *   - process.arch === "arm64"
 *   - macOS major >= 15  (darwin kernel major >= 24)
 *   - DOVAULT_PROFILE === "hardened"
 *   - `which container` resolves
 *
 * Priority 45 — opt-in tier. Below sandbox-exec (50, the default macOS
 * isolation), so non-hardened deployments keep their existing flow.
 *
 * Runtime image: defaults to whatever the user pre-pulled. The wrapped
 * command is invoked via `container run --rm ... -- <cmd>` so the
 * existing image's PATH must include the binary; callers using bespoke
 * runtimes should pre-stage the image.
 */
export class AppleContainerBackend implements ResourceBackend {
  readonly name = "apple-container";
  readonly description = "macOS Apple Containerization Framework (container CLI)";
  readonly priority = 45;

  available(): boolean {
    if (process.platform !== "darwin") return false;
    if (process.arch !== "arm64") return false;
    // macOS 15 Sequoia ships darwin kernel 24.x; reject older hosts.
    const kernelMajor = parseInt(release().split(".")[0] ?? "0", 10);
    if (!Number.isFinite(kernelMajor) || kernelMajor < 24) return false;
    if (process.env.DOVAULT_PROFILE !== "hardened") return false;
    try {
      execSync("which container", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  wrapSpawn(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean },
  ): WrapResult {
    return {
      command: "container",
      args: [
        "run",
        "--rm",
        "--memory",
        options.limits.memoryMax ?? "512m",
        "--cpu",
        parseCpuQuotaToCores(options.limits.cpuQuota ?? "50%"),
        "--",
        command,
        ...args,
      ],
    };
  }

  wrapExec(
    command: string,
    args: string[],
    options: { limits: ResourceLimits; blockNetwork?: boolean; jail: string },
  ): WrapResult {
    return {
      command: "container",
      args: [
        "run",
        "--rm",
        "-v",
        `${options.jail}:/work`,
        "--workdir",
        "/work",
        "--memory",
        options.limits.memoryMax ?? "512m",
        "--cpu",
        parseCpuQuotaToCores(options.limits.cpuQuota ?? "50%"),
        "--",
        command,
        ...args,
      ],
    };
  }
}

/**
 * Convert a percentage cpuQuota ("50%") into a fractional core count
 * ("0.5") for `container run --cpu`. Apple's CLI takes a decimal-cores
 * value rather than systemd's percent semantics. Falls back to 0.5
 * cores on any parse failure to keep callers from accidentally getting
 * unbounded CPU.
 */
function parseCpuQuotaToCores(q: string): string {
  const n = parseInt(q.replace(/%$/, ""), 10);
  return Number.isFinite(n) ? String(n / 100) : "0.5";
}
