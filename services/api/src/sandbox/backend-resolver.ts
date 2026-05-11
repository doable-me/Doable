/**
 * Backend resolver.
 *
 * Selection contract (per SandboxAgnosticSandboxingPRD ch 06):
 *   1. DOABLE_SANDBOX_BACKEND env var (operator escape hatch)
 *   2. Workspace override        (TODO — DB lookup not wired yet)
 *   3. Registry auto-resolve     (best available for the host)
 *
 * Hardening contract: when ctx.hardening is "prod" or "staging" the
 * resolver MUST fail-closed if the resolved backend can't actually
 * isolate. Dev and off modes tolerate fallbacks.
 */

import type {
  SandboxBackend,
  SandboxBackendRegistry,
} from "../../../../packages/dovault/src/backends/sandbox-backend.js";
import { BackendUnavailableError } from "../../../../packages/dovault/src/backends/sandbox-backend.js";
import { getSandboxRegistry } from "../../../../packages/dovault/src/sandbox-registry.js";
import type { SpawnContext } from "./orchestrator.js";

// Backends that don't actually isolate the workload — used to detect
// when fail-closed should trip in prod/staging.
const NON_ISOLATING_BACKENDS = new Set(["direct", "noop"]);

export async function resolveBackend(
  ctx: SpawnContext,
  registry: SandboxBackendRegistry = getSandboxRegistry(),
): Promise<SandboxBackend> {
  // 1. Env override — `DOABLE_SANDBOX_BACKEND=psroot` etc.
  const envChoice = process.env.DOABLE_SANDBOX_BACKEND?.trim();
  const preferredId = envChoice && envChoice.length > 0 ? envChoice : undefined;

  // 2. Workspace override
  // TODO: look up `workspace_sandbox_settings.sandbox_backend` for
  // ctx.workspaceId and apply it here. Requires a queries.ts addition
  // and a UI knob in the doable-CLI TUI; deferred to chapter-10 wave.

  // 3. Registry resolves (env preferred → priority desc → first available).
  let backend: SandboxBackend;
  try {
    backend = await registry.resolve(preferredId);
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      // Re-throw with operator context.
      throw new BackendUnavailableError(
        `${err.message} (hardening=${ctx.hardening}, source=${preferredId ? "env" : "auto"})`,
      );
    }
    throw err;
  }

  // Fail-closed for prod/staging when the resolved backend doesn't
  // actually isolate. We must NOT silently fall back to "direct" in
  // these environments — that's the entire reason the orchestrator
  // exists.
  if (
    (ctx.hardening === "prod" || ctx.hardening === "staging") &&
    NON_ISOLATING_BACKENDS.has(backend.id)
  ) {
    throw new BackendUnavailableError(
      `Refusing to run under hardening=${ctx.hardening} with non-isolating backend "${backend.id}".`,
    );
  }

  return backend;
}
