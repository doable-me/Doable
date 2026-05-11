import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const WRAPPER_PATH = "/opt/doable/bin/sandbox-mount";

/**
 * Run a command via child_process.spawn. Resolves on exit 0, rejects on
 * non-zero with the captured stderr text.
 */
function runCmd(cmd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function wrapperAvailable(): Promise<boolean> {
  try {
    await access(WRAPPER_PATH, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function sudoAvailable(): Promise<boolean> {
  try {
    // sudo -n true succeeds only if a passwordless sudo entry exists
    await runCmd("sudo", ["-n", "true"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bind-mount `src` onto `dst`. On Linux, prefers the setuid wrapper
 * installed at /opt/doable/bin/sandbox-mount; falls back to `sudo -n mount`.
 * If neither is available, logs a warning and returns without throwing —
 * composers must degrade gracefully so the synthetic file still exists as
 * a debug artifact.
 *
 * On non-Linux platforms this is a no-op.
 */
export async function bindMount(src: string, dst: string, readonly: boolean): Promise<void> {
  if (process.platform !== "linux") {
    console.log(`[mount-helper] skipped on ${process.platform}`);
    return;
  }

  if (await wrapperAvailable()) {
    const args = ["bind", src, dst];
    if (readonly) args.push("--ro");
    await runCmd(WRAPPER_PATH, args);
    return;
  }

  if (await sudoAvailable()) {
    await runCmd("sudo", ["-n", "mount", "--bind", src, dst]);
    if (readonly) {
      await runCmd("sudo", ["-n", "mount", "-o", "remount,ro,bind", dst]);
    }
    return;
  }

  console.warn(
    `[mount-helper] no privilege escalation available; skipping bind-mount ${src} -> ${dst}`,
  );
}

/**
 * Unmount `dst`. Same fallback chain as bindMount. Silent on non-Linux.
 */
export async function unbindMount(dst: string): Promise<void> {
  if (process.platform !== "linux") {
    console.log(`[mount-helper] skipped on ${process.platform}`);
    return;
  }

  if (await wrapperAvailable()) {
    await runCmd(WRAPPER_PATH, ["umount", dst]);
    return;
  }

  if (await sudoAvailable()) {
    await runCmd("sudo", ["-n", "umount", dst]);
    return;
  }

  console.warn(`[mount-helper] no privilege escalation available; skipping umount ${dst}`);
}
