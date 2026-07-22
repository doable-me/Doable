/**
 * App runtime feature flags and limits (FULLSTACK_RUNTIME.md §13).
 */

/** Master switch — off unless explicitly `1` (enable in .env for local/dev). */
export const DOABLE_APP_RUNTIME_ENABLED = process.env.DOABLE_APP_RUNTIME_ENABLED === "1";

export const DOABLE_APP_WF_TIMEOUT_MS = Number(process.env.DOABLE_APP_WF_TIMEOUT_MS ?? 30_000);
export const DOABLE_APP_WF_MEMORY_MB = Number(process.env.DOABLE_APP_WF_MEMORY_MB ?? 128);
export const DOABLE_APP_WF_MAX_CONCURRENCY = Number(process.env.DOABLE_APP_WF_MAX_CONCURRENCY ?? 8);
export const DOABLE_APP_WF_MAX_CALL_DEPTH = Number(process.env.DOABLE_APP_WF_MAX_CALL_DEPTH ?? 3);
export const DOABLE_APP_HOOK_BODY_MAX_BYTES = Number(
  process.env.DOABLE_APP_HOOK_BODY_MAX_BYTES ?? 1_048_576,
);
export const DOABLE_APP_BUS = (process.env.DOABLE_APP_BUS ?? "inprocess") as "inprocess" | "redis";
export const DOABLE_APP_SCHEDULER_TICK_MS = Number(
  process.env.DOABLE_APP_SCHEDULER_TICK_MS ?? 15_000,
);

/** Backend artifact root relative to project path. */
export const BACKEND_DIR = ".doable/backend";
