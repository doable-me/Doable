import { realpathSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { JailOptions } from "./types.js";

/**
 * Node.js Permission Model (--experimental-permission)
 *
 * Builds command-line flags that restrict what a Node.js process can do
 * at the kernel level. Zero overhead — permission checks are built into
 * Node.js core, not polled or proxied.
 *
 * What it blocks:
 *   - Filesystem reads outside the jail directory
 *   - Filesystem writes outside the jail directory
 *   - child_process (no shell execution, no reverse shells)
 *
 * What it allows:
 *   - Native addons (needed for esbuild/SWC)
 *   - Worker threads (needed for parallel transforms)
 *   - Network (not restricted by Permission Model — use systemd for that)
 *
 * IMPORTANT: --experimental-permission cannot be set via NODE_OPTIONS.
 * It MUST be passed as a CLI flag to the node binary. This class resolves
 * the target command to its .js entry point and prepends `node <flags>`.
 */
export class ProcessJail {
  /**
   * Build a jailed command invocation.
   *
   * Resolves the command to a Node.js script, then wraps it:
   *   Before: vite --port 3100
   *   After:  node --experimental-permission --allow-fs-read=... vite.js --port 3100
   *
   * Returns null if the command can't be resolved as a Node.js script.
   * In that case, the caller should spawn without the Permission Model.
   */
  buildJailedCommand(
    command: string,
    args: string[],
    cwd: string,
    options: JailOptions,
  ): { command: string; args: string[] } | null {
    const scriptPath = this.resolveScript(command, cwd);
    if (!scriptPath) return null;

    const flags = this.buildFlags(options);

    return {
      command: process.execPath, // Current node binary
      args: [...flags, scriptPath, ...args],
    };
  }

  /**
   * Resolve a command to its Node.js script entry point.
   *
   * Handles:
   *   - Direct .js/.mjs/.ts paths
   *   - node_modules/.bin/ symlinks (Linux)
   *   - node_modules/.bin/*.cmd wrappers (Windows)
   *   - package.json bin field resolution
   */
  resolveScript(command: string, cwd: string): string | null {
    // Already a JS/TS file path
    if (/\.(m?[jt]s|cjs)$/.test(command)) {
      const abs = resolve(cwd, command);
      return existsSync(abs) ? abs : null;
    }

    // Try node_modules/.bin/ resolution
    const binDir = join(cwd, "node_modules", ".bin");

    if (process.platform === "win32") {
      return this.resolveWindowsBin(command, binDir, cwd);
    } else {
      return this.resolveUnixBin(command, binDir, cwd);
    }
  }

  private resolveWindowsBin(
    command: string,
    binDir: string,
    cwd: string,
  ): string | null {
    // Windows: parse the .cmd wrapper to find the actual .js entry point
    const cmdPath = join(binDir, command + ".cmd");
    if (existsSync(cmdPath)) {
      try {
        const content = readFileSync(cmdPath, "utf-8");
        // Typical .cmd content includes: "%_prog%" "%dp0%\..\vite\bin\vite.js" %*
        const match = content.match(/"([^"]*\.(?:js|mjs|cjs))"/);
        if (match) {
          // The path is relative to the .cmd file's directory
          const scriptPath = resolve(binDir, match[1]!);
          if (existsSync(scriptPath)) return scriptPath;
        }
      } catch { /* parse failure — fall through */ }
    }

    // Fallback: check package.json bin field
    return this.resolveFromPackageJson(command, cwd);
  }

  private resolveUnixBin(
    command: string,
    binDir: string,
    cwd: string,
  ): string | null {
    // Unix: node_modules/.bin/vite is typically a symlink to ../vite/bin/vite.js
    const binPath = join(binDir, command);
    if (existsSync(binPath)) {
      try {
        const realPath = realpathSync(binPath);
        // Verify it's a file we can pass to node
        if (existsSync(realPath)) return realPath;
      } catch { /* broken symlink */ }
    }

    // Fallback: check package.json bin field
    return this.resolveFromPackageJson(command, cwd);
  }

  private resolveFromPackageJson(
    command: string,
    cwd: string,
  ): string | null {
    try {
      const pkgPath = join(cwd, "node_modules", command, "package.json");
      if (!existsSync(pkgPath)) return null;

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const bin =
        typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[command];
      if (!bin) return null;

      const scriptPath = resolve(cwd, "node_modules", command, bin);
      return existsSync(scriptPath) ? scriptPath : null;
    } catch {
      return null;
    }
  }

  private buildFlags(options: JailOptions): string[] {
    const flags: string[] = ["--experimental-permission"];
    const jailPath = resolve(options.jail);
    const tempPath = tmpdir();

    // ── Filesystem read access ──
    // Project directory (source files, node_modules, configs)
    flags.push(`--allow-fs-read=${jailPath}`);

    // Temp directory (V8 code cache, various runtime needs)
    flags.push(`--allow-fs-read=${tempPath}`);

    // Node.js installation directory (for resolving built-in modules loader)
    const nodeDir = dirname(process.execPath);
    flags.push(`--allow-fs-read=${nodeDir}`);

    // Extra read-only paths from options
    if (options.readOnlyPaths) {
      for (const p of options.readOnlyPaths) {
        flags.push(`--allow-fs-read=${resolve(p)}`);
      }
    }

    // ── Filesystem write access ──
    // Only the project directory and temp
    flags.push(`--allow-fs-write=${jailPath}`);
    flags.push(`--allow-fs-write=${tempPath}`);

    // ── Native addons ──
    // Required for esbuild, SWC, and other native transforms.
    // Addons are still subject to fs/process restrictions.
    flags.push("--allow-addons");

    // ── Worker threads ──
    // Used by Vite plugins for parallel transforms (esbuild, SWC).
    if (options.allowWorkers !== false) {
      flags.push("--allow-worker");
    }

    // ── Child process ──
    // NOT allowed by default. This is the primary security gate:
    // blocks shell execution, reverse shells, command injection.
    if (options.allowChildProcess) {
      flags.push("--allow-child-process");
    }

    return flags;
  }
}
