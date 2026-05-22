/**
 * Default singleton `SandboxBackendRegistry` for dovault consumers.
 *
 * The orchestrator and admin diagnostics import `getSandboxRegistry()` rather
 * than constructing a registry themselves; this keeps the set of registered
 * backends in one place and lets tests reset state via the (deliberately
 * underscore-prefixed) `__resetSandboxRegistryForTests` hook.
 */

import { SandboxBackendRegistry } from "./backends/sandbox-backend.js";
import { bubblewrapBackend } from "./backends/bubblewrap-v2.js";
import { sandboxExecBackend } from "./backends/sandbox-exec-v2.js";
import { psrootBackend } from "./backends/psroot-v2.js";
import { systemdBackend } from "./backends/systemd-v2.js";

let _registry: SandboxBackendRegistry | null = null;

export function getSandboxRegistry(): SandboxBackendRegistry {
  if (_registry) return _registry;
  const r = new SandboxBackendRegistry();
  r.register(bubblewrapBackend);
  r.register(sandboxExecBackend);
  r.register(psrootBackend);
  r.register(systemdBackend);
  _registry = r;
  return r;
}

/** Reset for tests only. */
export function __resetSandboxRegistryForTests(): void {
  _registry = null;
}
