import {isRejectedFileWrite} from "../../ai/file-tool-validation.js";
import { toolSucceeded } from "../../ai/tool-outcome.js";
export { toolSucceeded } from "../../ai/tool-outcome.js";
import { createHash, randomUUID } from "node:crypto";
import type { ChatStreamState } from "./types.js";

export type RunOutcome =
  | "completed"
  | "stalled"
  | "error"
  | "aborted"
  | "waiting";
export type TaskReport = {
  intent: "read_only" | "change";
  status: "in_progress" | "completed" | "waiting_for_input";
};
export interface ToolObservation {
  name: string;
  arguments?: Record<string, unknown>;
  callId?: string;
  cycle: number;
  status: "running" | "completed" | "failed" | "unknown";
  resultHash?: string;
  rejectedWithoutEffects?: boolean;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function parseTaskReport(
  value: Record<string, unknown>,
): TaskReport | null {
  if (
    !["read_only", "change"].includes(String(value.intent)) ||
    !["in_progress", "completed", "waiting_for_input"].includes(
      String(value.status),
    )
  )
    return null;
  return {
    intent: value.intent as TaskReport["intent"],
    status: value.status as TaskReport["status"],
  };
}
/** SDK IDs are authoritative; hook mirrors without IDs merge only into a pending invocation. */
export function startTool(
  state: ChatStreamState,
  name: string,
  args?: unknown,
  callId?: string,
): ToolObservation {
  const records = (state.assistantToolCalls ??= []) as ToolObservation[];
  const argumentsValue =
    args && typeof args === "object"
      ? (args as Record<string, unknown>)
      : undefined;
  let record = callId ? records.find((r) => r.callId === callId) : undefined;
  record ??= records.find(
    (r) =>
      r.status === "running" &&
      r.cycle === (state.recoveryCycle ?? 0) &&
      r.name === name &&
      canonical(r.arguments) === canonical(argumentsValue) &&
      (!callId || !r.callId || r.callId.startsWith("hook-")),
  );
  if (!record) {
    record = {
      name,
      arguments: argumentsValue,
      callId: callId ?? `hook-${randomUUID()}`,
      cycle: state.recoveryCycle ?? 0,
      status: "running",
    };
    records.push(record);
  } else if (callId) record.callId = callId;
  state.hadToolCalls = true;
  if (
    name !== "report_task_status" &&
    state.taskReport?.status === "completed"
  ) {
    state.taskReport = { ...state.taskReport, status: "in_progress" };
  }
  return record;
}
export function finishTool(
  state: ChatStreamState,
  name: string,
  args: unknown,
  result: unknown,
  success?: boolean,
  callId?: string,
) {
  const records = (state.assistantToolCalls ??= []) as ToolObservation[];
  let record = callId ? records.find((r) => r.callId === callId) : undefined;
  record ??= records.find(
    (r) =>
      r.status === "running" &&
      r.name === name &&
      (args == null || canonical(r.arguments) === canonical(args)),
  );
  // End events without an ID/args may mirror the hook result. Do not invent another invocation.
  record ??= [...records]
    .reverse()
    .find((r) => r.name === name && r.cycle === (state.recoveryCycle ?? 0));
  record ??= startTool(state, name, args, callId);
  // A later incomplete mirror cannot erase an observed failure. A real retry has a new call ID.
  record.status =
    record.status === "failed" || !toolSucceeded(result, success)
      ? "failed"
      : "completed";
  if (record.status === "failed" && isRejectedFileWrite(name, result))
    record.rejectedWithoutEffects = true;
  record.resultHash = createHash("sha256")
    .update(canonical(result))
    .digest("hex");
  if (name === "report_task_status" && record.status === "completed") {
    const report = parseTaskReport(record.arguments ?? {});
    if (report) state.taskReport = report;
  }
  return record;
}
/** Compare complete arguments AND observations from one SDK cycle, never a rolling historical window. */
export function cycleFingerprint(
  state: ChatStreamState,
  cycle: number,
): string {
  return (state.assistantToolCalls as ToolObservation[])
    .filter((r) => r.cycle === cycle && r.name !== "report_task_status")
    .map((r) =>
      canonical({
        name: r.name,
        args: r.arguments,
        status: r.status,
        result: r.resultHash,
      }),
    )
    .sort()
    .join("\n");
}
export function runOutcome(state: ChatStreamState): RunOutcome {
  if (state.runOutcome) return state.runOutcome;
  if (state.assistantToolCalls.some((r) => r.status === "running"))
    return "stalled";
  if (
    state.awaitingMcpWidget ||
    state.awaitingSupabaseProvision ||
    state.awaitingIntegrationConnect ||
    state.taskReport?.status === "waiting_for_input"
  )
    return "waiting";
  if (state.taskReport?.status === "in_progress") return "stalled";
  return "completed";
}

/** Automatic repair must never turn a read-only or waiting task into a write. */
export function mayAutoRepair(state: ChatStreamState): boolean {
  return (
    !state.runOutcome &&
    !state.deferredError &&
    state.taskReport?.intent === "change" &&
    state.taskReport.status === "completed" &&
    runOutcome(state) === "completed"
  );
}
