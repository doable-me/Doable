
import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import type { SandboxBackendRegistry } from "../../../../packages/dovault/src/backends/sandbox-backend.js";
import { getSandboxRegistry } from "../../../../packages/dovault/src/sandbox-registry.js";
import { pickComposers } from "../../../../packages/dovault/src/composers/index.js";
import { resolveProfile } from "./profile-resolver.js";
import { resolveBackend } from "./backend-resolver.js";
import { auditSpawn } from "./audit.js";
import { getProjectPath } from "../ai/project-files.js";

// ───────────────────────── public types ─────────────────────────

export interface SpawnContext {
  projectId: string;
  workspaceId: string | null;
  /** Nullable: system/unauthenticated spawns MUST pass null, not "". */
  userId: string | null;
  sessionId: string;
  hardening: "off" | "dev" | "staging" | "prod";
  /** Host-side sandbox uid; profiles use this for bwrap --uid so inside-uid matches the file owner. */
  hostUid?: number;
}

export type ProfileKey = "ai-bash" | "vite-preview" | "install" | "build" | string;

export interface JailedSpawnResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  oomKilled: boolean;
  timedOut: boolean;
  backendId: string;
  profileId: string;
  composers: string[];
}

export interface JailedLongRunningHandle {
  /** Live child process — caller owns its lifecycle. */
  process: ChildProcess;
  pid: number | undefined;
  backendId: string;
  profileId: string;
  composers: string[];
  /** Kill + run teardown steps in reverse. Idempotent. */
  shutdown: () => Promise<void>;
}

// ───────────────────────── shared internals ─────────────────────────

async function preparePlan(
  command: string,
  args: string[],
  ctx: SpawnContext,
  profileKey: ProfileKey,
  registry: SandboxBackendRegistry,
) {
  // 1. resolve profile
  const profile = await resolveProfile(profileKey, ctx);

  // 2. resolve backend
  const backend = await resolveBackend(ctx, registry);

  // 3. pick composers (per profile + backend's declared layers)
  const declared = backend.declaredLayers();
  const composerObjs = pickComposers(profile, declared);
  const composerIds = composerObjs.map((c) => c.id);

  // Fail-closed in prod/staging when no FS jail at all.
  if (
    (ctx.hardening === "prod" || ctx.hardening === "staging") &&
    declared.fs === "none"
  ) {
    throw new Error(
      `Sandbox preflight failed: backend "${backend.id}" provides no filesystem jail (declaredLayers.fs="none"); refusing to spawn under hardening=${ctx.hardening}.`,
    );
  }

  const projectPath = getProjectPath(ctx.projectId);

  // 4. buildSpawn — delegate to backend
  const built = backend.buildSpawn(profile, command, args, projectPath);

  // Compose composer steps onto the backend's steps.
  const composerSteps = composerObjs.map((c) => c.build(profile, projectPath));
  const preflight = [
    ...built.preflight,
    ...composerSteps.flatMap((s) => s.preflight),
  ];
  const teardown = [
    ...composerSteps.flatMap((s) => s.teardown),
    ...built.teardown,
  ];

  return {
    profile,
    backend,
    composerIds,
    argv: built.argv,
    env: built.env,
    preflight,
    teardown,
    projectPath,
  };
}

async function runSteps(
  steps: Array<{ id: string; run: () => Promise<void> }>,
  phase: "preflight" | "teardown",
): Promise<void> {
  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sandbox/${phase}] step "${step.id}" failed: ${msg}`);
      if (phase === "preflight") throw err; // preflight failure is fatal
    }
  }
}

// ───────────────────────── jailedSpawn (one-shot) ─────────────────────────

/**
 * Spawn a command inside the resolved sandbox profile+backend; return after
 * the child exits. For long-running callers (vite preview), use
 * `jailedSpawnLongRunning` instead.
 */
export async function jailedSpawn(
  command: string,
  args: string[],
  ctx: SpawnContext,
  profileKey: ProfileKey,
  registry: SandboxBackendRegistry = getSandboxRegistry(),
): Promise<JailedSpawnResult> {
  const startedAt = Date.now();
  const plan = await preparePlan(command, args, ctx, profileKey, registry);

  // 5. preflight
  await runSteps(plan.preflight, "preflight");

  // 6. spawn + supervise
  let stdout = "";
  let stderr = "";
  let oomKilled = false;
  let timedOut = false;
  const timeoutMs = plan.profile.timeoutMs && plan.profile.timeoutMs > 0
    ? plan.profile.timeoutMs
    : 30_000;

  const result = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    if (plan.argv.length === 0) {
      reject(new Error("Sandbox backend returned empty argv"));
      return;
    }
    const bin = plan.argv[0]!;
    const rest = plan.argv.slice(1);
    const child = cpSpawn(bin, rest, {
      cwd: plan.projectPath,
      env: plan.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* dead */ }
        }, 5_000);
      } catch { /* already dead */ }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 1_048_576) {
        stdout = stdout.slice(0, 1_048_576) + "\n[truncated: stdout exceeded 1 MB]";
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      stderr += s;
      if (/out of memory|memory cgroup out of memory/i.test(s)) oomKilled = true;
      if (stderr.length > 1_048_576) {
        stderr = stderr.slice(0, 1_048_576) + "\n[truncated: stderr exceeded 1 MB]";
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code, signal });
    });
  });

  // 7. teardown (best-effort)
  await runSteps([...plan.teardown].reverse(), "teardown");

  const durationMs = Date.now() - startedAt;

  // 8. audit
  await auditSpawn({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    hardening: ctx.hardening,
    profileId: plan.profile.id,
    backendId: plan.backend.id,
    composers: plan.composerIds,
    command,
    args,
    exitCode: result.exitCode,
    durationMs,
    oomKilled,
    startedAt: new Date(startedAt).toISOString(),
  });

  return {
    exitCode: result.exitCode,
    signal: result.signal,
    stdout,
    stderr,
    durationMs,
    oomKilled,
    timedOut,
    backendId: plan.backend.id,
    profileId: plan.profile.id,
    composers: plan.composerIds,
  };
}

// ───────────────────────── jailedSpawnLongRunning ─────────────────────────

/**
 * Spawn a long-running process (e.g. vite preview). Returns the ChildProcess
 * plus a `shutdown()` that kills the child and runs teardown steps. The
 * caller is responsible for stdout/stderr handling.
 *
 * Profile's `timeoutMs` is IGNORED for long-running; lifetime is owned by
 * the caller.
 */
export async function jailedSpawnLongRunning(
  command: string,
  args: string[],
  ctx: SpawnContext,
  profileKey: ProfileKey,
  registry: SandboxBackendRegistry = getSandboxRegistry(),
): Promise<JailedLongRunningHandle> {
  const startedAt = Date.now();
  const plan = await preparePlan(command, args, ctx, profileKey, registry);

  await runSteps(plan.preflight, "preflight");

  if (plan.argv.length === 0) {
    throw new Error("Sandbox backend returned empty argv");
  }
  const bin = plan.argv[0]!;
  const rest = plan.argv.slice(1);
  if (process.env.DOABLE_SANDBOX_DEBUG === "1") {
    console.log(`[sandbox.debug] spawn cwd=${plan.projectPath} bin=${bin} argv=${JSON.stringify(plan.argv)}`);
  }
  const child = cpSpawn(bin, rest, {
    cwd: plan.projectPath,
    env: plan.env,
    stdio: "pipe",
  });

  // Fire-and-forget audit; rejections log rather than crash the process.
  auditSpawn({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    hardening: ctx.hardening,
    profileId: plan.profile.id,
    backendId: plan.backend.id,
    composers: plan.composerIds,
    command,
    args,
    exitCode: null,
    durationMs: 0,
    oomKilled: false,
    startedAt: new Date(startedAt).toISOString(),
  }).catch((err) => {
    console.warn(
      `[sandbox.audit] auditSpawn failed for project=${ctx.projectId}:`,
      err instanceof Error ? err.message : err,
    );
  });

  let torn = false;
  const shutdown = async (): Promise<void> => {
    if (torn) return;
    torn = true;
    try {
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch { /* dead */ }
            r();
          }, 5_000);
          child.once("close", () => { clearTimeout(t); r(); });
        });
      }
    } finally {
      await runSteps([...plan.teardown].reverse(), "teardown");
    }
  };

  return {
    process: child,
    pid: child.pid,
    backendId: plan.backend.id,
    profileId: plan.profile.id,
    composers: plan.composerIds,
    shutdown,
  };
}
