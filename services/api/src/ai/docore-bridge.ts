/**
 * docore bridge — singleton wiring docore's user manager + policy store
 * into Doable's xray / trace / WS broadcast pipeline.
 *
 * This is the integration point between docore (AI sandbox + policy) and
 * the rest of Doable. Consumers import `userManager`, `policyStore`, and
 * `wireEngineEvents` and call `initDocore()` / `shutdownDocore()` during
 * server lifecycle.
 */

import * as path from "node:path";
import {
  DoCoreUserManager,
  PolicyStore,
  MemoryPersistence,
  createPolicySandbox,
  Tracer as DoCoreTracer,
  type DoCoreEngine,
  type SandboxAuditEntry,
} from "docore";

import { xray } from "../integrations/xray.js";
import { broadcastToRoom } from "./yjs-bridge.js";

// ─── Tracer wired to xray span recording ──────────────────

const docoreTracer = new DoCoreTracer((span) => {
  xray.recordSpan({
    source: "docore",
    id: span.id,
    name: span.name,
    parentId: span.parentId,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    durationMs: span.durationMs,
    status: span.status,
    error: span.error,
    attributes: span.attributes,
  });
});

// ─── Policy store (runtime-configurable sandbox rules) ────

const policyPersistence = new MemoryPersistence();
export const policyStore = new PolicyStore({ persistence: policyPersistence });

// Enable custom tools globally — Doable's custom SDK tools (read_file,
// list_files, create_plan, ask_clarification, etc.) must not be blocked
// by the sandbox's default deny-all policy for custom tools.
policyStore.setGlobal("sandbox.customTools.enabled", true);

// ─── User manager ─────────────────────────────────────────

const DATA_DIR =
  process.env.DOABLE_DATA_DIR ??
  path.resolve(process.cwd(), ".doable-data");

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_ENGINES ?? "30", 10);
const IDLE_TIMEOUT_MS = parseInt(
  process.env.DOCORE_IDLE_TIMEOUT_MS ?? String(10 * 60 * 1000),
  10,
);

export const userManager = new DoCoreUserManager({
  baseDir: DATA_DIR,
  maxConcurrent: MAX_CONCURRENT,
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  sandbox: true,
  policyStore,
  tracer: docoreTracer,
  onSandboxAudit: (entry: SandboxAuditEntry) => {
    xray.recordSandboxDecision({
      timestamp: Date.now(),
      userId: (entry as any).userId,
      kind: (entry as any).kind ?? "unknown",
      decision: (entry as any).decision ?? "unknown",
      reason: (entry as any).reason,
      details: entry,
    });
  },
  onEvict: (userId: string, reason: "idle" | "lru") => {
    console.log(`[docore] engine evicted: user=${userId} reason=${reason}`);
  },
});

// ─── Event wiring per engine acquire ──────────────────────

/**
 * Wire a DoCoreEngine's EventBus into Doable's trace / WS broadcast pipeline.
 * Call once per engine acquire. Returns an unwire function to call on
 * disconnect.
 */
export function wireEngineEvents(
  engine: DoCoreEngine,
  projectId: string,
  userId: string,
): () => void {
  const unsubscribe = engine.events.onAny((event: any) => {
    // Broadcast to WS room for live XRAY panel. Per-turn trace recording
    // happens inside the chat.ts session loop where the trace collector
    // is in scope — keeping this bridge side-effect-light.
    broadcastToRoom(projectId, {
      type: "ai:docore",
      userId,
      event,
    }).catch(() => {});
  });

  return typeof unsubscribe === "function" ? unsubscribe : () => {};
}

// ─── Permission handler factory ───────────────────────────

/**
 * Create a sandbox permission handler for a CopilotEngine session.
 * Uses docore's policy store + XRAY audit sink. Returns a PermissionHandler
 * compatible with the SDK's onPermissionRequest.
 */
export function createPermissionHandler(
  userId: string,
  workingDirectory: string,
): import("@github/copilot-sdk").PermissionHandler {
  return createPolicySandbox(userId, workingDirectory, policyStore, (entry) => {
    xray.recordSandboxDecision({
      timestamp: Date.now(),
      userId: entry.userId,
      kind: entry.kind ?? "unknown",
      decision: entry.decision ?? "unknown",
      reason: entry.reason,
      details: entry,
    });
  }, docoreTracer);
}

// ─── Lifecycle ────────────────────────────────────────────

let started = false;

/** Initialize docore. Call once at server startup, before accepting requests. */
export async function initDocore(): Promise<void> {
  if (started) return;
  started = true;
  // DoCoreUserManager has no explicit start() — engines are created lazily
  // on first acquire(). Log the configuration so operators can verify.
  console.log(
    `[docore] initialized: baseDir=${DATA_DIR} maxConcurrent=${MAX_CONCURRENT} idleTimeoutMs=${IDLE_TIMEOUT_MS}`,
  );
}

/** Shut down all engines and release resources. Call on SIGTERM/SIGINT. */
export async function shutdownDocore(): Promise<void> {
  if (!started) return;
  started = false;
  try {
    await userManager.shutdown();
    console.log("[docore] shutdown complete");
  } catch (err) {
    console.error("[docore] shutdown failed:", err);
  }
}
