/**
 * Context builders for framework adapter calls.
 *
 * These helpers exist purely to fill defaults (env, signal) so callers
 * don't have to spell out every optional field. They contain no logic —
 * if you find yourself adding branches here, push them into the caller
 * or the adapter.
 *
 * See devframeworkPRD/02-framework-abstraction.md §4.1 for the canonical
 * context shapes.
 */

import type {
  BuildContext,
  DevContext,
  FrameworkContext,
  ScaffoldContext,
  ServeContext,
} from "./types.js";

// Re-export the context types so callers can import everything from one place.
export type {
  BuildContext,
  DevContext,
  FrameworkContext,
  ScaffoldContext,
  ServeContext,
} from "./types.js";

// ─── Base context fields ─────────────────────────────────

/**
 * Minimal fields a caller must supply to build a framework context. Optional
 * fields (env, signal, userId) get safe defaults when omitted.
 */
export interface BaseContextInput {
  projectId: string;
  projectPath: string;
  basePath: string;
  env?: Record<string, string>;
  userId?: string;
  signal?: AbortSignal;
}

function withDefaults(input: BaseContextInput): FrameworkContext {
  return {
    projectId: input.projectId,
    projectPath: input.projectPath,
    basePath: input.basePath,
    env: input.env ?? {},
    userId: input.userId,
    signal: input.signal,
  };
}

// ─── Builders ────────────────────────────────────────────

export function createScaffoldContext(
  input: BaseContextInput & {
    templateFiles: Record<string, string>;
    projectName?: string;
  },
): ScaffoldContext {
  return {
    ...withDefaults(input),
    templateFiles: input.templateFiles,
    projectName: input.projectName,
  };
}

export function createDevContext(
  input: BaseContextInput & { host: string; port: number },
): DevContext {
  return {
    ...withDefaults(input),
    host: input.host,
    port: input.port,
  };
}

export function createBuildContext(
  input: BaseContextInput & { target: "preview" | "production" },
): BuildContext {
  return {
    ...withDefaults(input),
    target: input.target,
  };
}

export function createServeContext(
  input: BaseContextInput & {
    host: string;
    port: number;
    buildOutputDir: string;
  },
): ServeContext {
  return {
    ...withDefaults(input),
    host: input.host,
    port: input.port,
    buildOutputDir: input.buildOutputDir,
  };
}
