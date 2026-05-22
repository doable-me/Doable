/**
 * Build-event vocabulary per devframeworkPRD/03-build-event-protocol.md §2.
 *
 * Wire envelope (chat-SSE convention):
 *   data: {"type": "<event-type>", "data": { ... }, "seq": N, "ts": <unix-ms>}\n\n
 *
 * Two ways callers consume:
 *   - The chat SSE pipe carries inline events during an active turn.
 *   - GET /projects/:id/build/stream tails the per-project ring buffer
 *     even outside an AI turn (the canonical "Build Logs" surface).
 */

export type PhaseId =
  | "installing"
  | "prebuild"
  | "compile"
  | "routes"
  | "optimize"
  | "bundle"
  | "done"
  | (string & {});

export interface BuildEventBase {
  /** monotonic per-project sequence; ascending across all build events */
  seq: number;
  /** unix ms */
  ts: number;
  /** which "build session" — a build run, a dev-server run, an HMR cycle */
  buildId: string;
}

export interface BuildPhaseStarted extends BuildEventBase {
  type: "build_phase_started";
  data: {
    phase: PhaseId;
    predictedMs?: number;
    label?: string;
  };
}

export interface BuildPhaseCompleted extends BuildEventBase {
  type: "build_phase_completed";
  data: { phase: PhaseId; durationMs: number; ok: boolean };
}

/** RAW — the format-agnostic backbone. Always emitted. */
export interface BuildLog extends BuildEventBase {
  type: "build_log";
  data: {
    stream: "stdout" | "stderr";
    /** lines may be batched (per PRD 03 §6) */
    lines: string[];
    /** monotonic line number within (buildId, stream) */
    firstLineNo: number;
  };
}

export interface BuildRoute extends BuildEventBase {
  type: "build_route";
  data: {
    route: string;
    status: "compiling" | "ready" | "failed";
    durationMs?: number;
  };
}

export interface BuildError extends BuildEventBase {
  type: "build_error";
  data: {
    file?: string;
    line?: number;
    column?: number;
    message: string;
    snippet?: string;
    framework?: string;
    /** hash for de-dupe in the UI; NOT a security boundary */
    fingerprint?: string;
  };
}

export interface BuildWarning extends BuildEventBase {
  type: "build_warning";
  data: BuildError["data"];
}

export interface BuildProgress extends BuildEventBase {
  type: "build_progress";
  data: {
    percent?: number;
    current?: number;
    total?: number;
    label?: string;
  };
}

export interface BuildArtifact extends BuildEventBase {
  type: "build_artifact";
  data: { path: string; sizeBytes: number; gzipBytes?: number };
}

export interface BuildSummary extends BuildEventBase {
  type: "build_summary";
  data: {
    durationMs: number;
    success: boolean;
    routes?: number;
    artifacts?: number;
    error?: { message: string };
  };
}

export interface BuildEta extends BuildEventBase {
  type: "build_eta";
  data: {
    estimatedRemainingMs: number;
    basis: "history" | "heuristic";
  };
}

export interface KeepAlive extends BuildEventBase {
  type: "keep_alive";
  data?: undefined;
}

export type BuildEvent =
  | BuildPhaseStarted
  | BuildPhaseCompleted
  | BuildLog
  | BuildRoute
  | BuildError
  | BuildWarning
  | BuildProgress
  | BuildArtifact
  | BuildSummary
  | BuildEta
  | KeepAlive;

/** Anything the publisher emits BEFORE the seq/ts/buildId are assigned. */
export type BuildEventInput = Omit<BuildEvent, "seq" | "ts" | "buildId">;
