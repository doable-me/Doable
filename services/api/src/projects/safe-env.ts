/**
 * Build a minimal, safe environment for sandboxed child processes.
 *
 * SECURITY: Never spread `process.env` into child processes that run
 * user-supplied code. This module provides an allowlist of safe variables
 * (PATH, HOME, NODE_ENV, etc.) plus any explicitly provided user env vars.
 */

/** Keys from process.env that are safe to inherit (needed for node/npm to work). */
const SAFE_INHERIT_KEYS: readonly string[] = [
  // Required for finding executables
  "PATH",
  "PATHEXT",
  // Required for node/npm to work
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  // System
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "COMSPEC",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  // Node runtime
  "NODE_ENV",
  "NODE_OPTIONS",
  // npm / pnpm config
  "npm_config_registry",
  "npm_config_cache",
];

/**
 * Build a safe env object for a sandboxed child process.
 *
 * @param userEnvVars  - User/project-specific env vars (from vault, integrations, etc.)
 * @param extraSafe    - Additional safe overrides (e.g. FORCE_COLOR, BROWSER)
 */
export function buildSafeEnv(
  userEnvVars?: Record<string, string>,
  extraSafe?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};

  // Copy only allowlisted keys from process.env
  for (const key of SAFE_INHERIT_KEYS) {
    const val = process.env[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }

  // Apply user/project env vars (integration credentials, etc.)
  if (userEnvVars) {
    Object.assign(env, userEnvVars);
  }

  // Apply extra safe overrides (FORCE_COLOR, BROWSER, etc.)
  if (extraSafe) {
    Object.assign(env, extraSafe);
  }

  return env;
}
