/**
 * Resolve the Python interpreter binary name available on this host.
 *
 * Modern Linux distros (Ubuntu 22.04+, Debian 12+) ship `python3` only —
 * no `python` symlink unless the `python-is-python3` package is installed.
 * macOS has `python3` in /usr/bin/python3 since the Catalina deprecation
 * of Python 2. Windows usually has `python` (via the Store launcher) and
 * sometimes `py`.
 *
 * Strategy: probe `python3 --version` once at module load, fall back to
 * `python` if it isn't found. The Doable setup-server.sh installs
 * `python3-venv` + `python3-pip` but not `python-is-python3`, so the
 * default discovery here matches what production hosts actually have.
 */

import { spawnSync } from "node:child_process";

let cached: string | null = null;

export function pythonBin(): string {
  if (cached) return cached;

  // Order: python3 → python → py (Windows). First one that exits 0 wins.
  for (const candidate of ["python3", "python", "py"]) {
    const r = spawnSync(candidate, ["--version"], {
      stdio: "ignore",
      shell: true,
      timeout: 3000,
    });
    if (r.status === 0) {
      cached = candidate;
      return candidate;
    }
  }

  // Nothing found — caller will get the same exit-127 error as before, but
  // at least it'll be from a deliberate "python3" attempt rather than the
  // hardcoded "python" mystery.
  cached = "python3";
  return cached;
}
