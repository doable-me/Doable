// ═══════════════════════════════════════════════════════════════════════════
// dovault — Zero-overhead runtime jail for Node.js processes
//
// Three layers, each independent and composable:
//   1. Config Guard:     Lock server-side config files to safe templates
//   2. Process Jail:     Node.js Permission Model (fs, process, worker)
//   3. Resource Limiter: OS-level limits (systemd cgroups / V8 heap)
//
// Zero runtime dependencies. Zero memory overhead. Cross-platform.
// ═══════════════════════════════════════════════════════════════════════════

export { Vault } from "./vault.js";
export {
  ConfigGuard,
  CONFIG_TEMPLATE_SETS,
  DEFAULT_FRAMEWORK_ID,
  type ConfigTemplateSet,
} from "./config-guard.js";
export { ProcessJail } from "./process-jail.js";
export { ResourceLimiter } from "./resource-limiter.js";

// Tracer
export { Tracer, noopTracer, type Span, type TracerSink, type SpanHandle } from "./tracer.js";

export type {
  VaultOptions,
  SpawnOptions,
  ExecOptions,
  ExecResult,
  JailedProcess,
  ResourceLimits,
  AuditEntry,
  ConfigGuardOptions,
  ConfigTemplate,
  JailOptions,
  WrapResult,
} from "./types.js";

export type { ResourceBackend } from "./backends/types.js";

// ── SandboxBackend (Wave 1 contract) ──
export {
  SandboxBackendRegistry,
  BackendUnavailableError,
} from "./backends/sandbox-backend.js";
export type {
  SandboxBackend,
  BackendAvailability,
  DeclaredLayers,
  PreflightStep,
  TeardownStep,
  BuildSpawnResult,
} from "./backends/sandbox-backend.js";

export {
  defaultProfile,
  compileProfileOverrides,
  SandboxProfileSchema,
  ScopeActionSchema,
  ProcOverlaySchema,
} from "./profile.js";
export type {
  SandboxProfile,
  ScopeAction,
  ProcOverlay,
} from "./profile.js";

export {
  getSandboxRegistry,
  __resetSandboxRegistryForTests,
} from "./sandbox-registry.js";

// Re-export backends for custom composition
export { DirectBackend } from "./backends/direct.js";
export { SystemdBackend } from "./backends/systemd.js";
export { BubblewrapBackend } from "./backends/bubblewrap.js";
export { WindowsBackend } from "./backends/windows.js";
export { PsrootBackend } from "./backends/psroot.js";
export { SandboxExecBackend } from "./backends/sandbox-exec.js";
export { AppleContainerBackend } from "./backends/apple-container.js";
export { GvisorBackend } from "./backends/gvisor.js";
export { WindowsHeapBackend } from "./backends/win-heap.js";

// ── Factory ──

import { Vault } from "./vault.js";
import type { VaultOptions } from "./types.js";

/**
 * Create a configured Vault instance.
 *
 * @example
 *   import { createVault } from "dovault";
 *
 *   const vault = createVault({
 *     resourceLimits: { memoryMax: "150M", cpuQuota: "30%", tasksMax: 32 },
 *   });
 *
 *   // Spawn a jailed Vite dev server
 *   const proc = await vault.spawn("vite", ["--port", "3100"], {
 *     cwd: projectPath,
 *     jail: projectPath,
 *   });
 *
 *   // Block AI writes to locked config files
 *   if (vault.isLockedFile("vite.config.ts")) {
 *     // reject write
 *   }
 */
export function createVault(options?: VaultOptions): Vault {
  return new Vault(options);
}
