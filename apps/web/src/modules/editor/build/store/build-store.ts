import { create } from "zustand";

export type BuildStatus =
  | "idle"
  | "running"
  | "stalled"
  | "completed"
  | "failed"
  | "disconnected";

export interface PhaseState {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
  startedAt?: number;
  endedAt?: number;
  subLine?: string;
}

export interface BuildErrorState {
  id: string;
  file: string;
  line?: number;
  col?: number;
  message: string;
  receivedAt: number;
  resolved: boolean;
}

export interface RawLogLine {
  id: number;
  ts: number;
  source: "stdout" | "stderr" | "system";
  text: string;
}

export interface BuildIngestEvent {
  type: string;
  data?: unknown;
  seq: number;
  ts: number;
}

export interface BuildStoreState {
  projectId: string | null;
  status: BuildStatus;
  phases: PhaseState[];
  currentPhase: string | null;
  errors: BuildErrorState[];
  rawLogLines: RawLogLine[];
  startedAt: number | null;
  elapsedMs: number;
  reset(projectId: string): void;
  ingest(event: BuildIngestEvent): void;
  setStatus(s: BuildStatus): void;
  setElapsed(ms: number): void;
}

const MAX_RAW_LOG_LINES = 5000;

const DEFAULT_PHASES: PhaseState[] = [
  { id: "scaffolding", label: "Setting up files", status: "pending" },
  { id: "installing", label: "Installing packages", status: "pending" },
  { id: "dev-server", label: "Starting dev server", status: "pending" },
  { id: "compiling", label: "Compiling code", status: "pending" },
  { id: "routes", label: "Resolving routes", status: "pending" },
  { id: "bundling", label: "Bundling assets", status: "pending" },
  { id: "ready", label: "Ready", status: "pending" },
];

let nextLogId = 1;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export const useBuildStore = create<BuildStoreState>((set, get) => ({
  projectId: null,
  status: "idle",
  phases: DEFAULT_PHASES.map((p) => ({ ...p })),
  currentPhase: null,
  errors: [],
  rawLogLines: [],
  startedAt: null,
  elapsedMs: 0,

  reset(projectId: string) {
    set({
      projectId,
      status: "idle",
      phases: DEFAULT_PHASES.map((p) => ({ ...p })),
      currentPhase: null,
      errors: [],
      rawLogLines: [],
      startedAt: null,
      elapsedMs: 0,
    });
  },

  setStatus(s: BuildStatus) {
    set({ status: s });
  },

  setElapsed(ms: number) {
    set({ elapsedMs: ms });
  },

  ingest(event: BuildIngestEvent) {
    const data = asRecord(event.data);
    const state = get();

    switch (event.type) {
      case "build_started": {
        const startedAt = event.ts || Date.now();
        set({
          status: "running",
          startedAt,
          elapsedMs: 0,
          phases: DEFAULT_PHASES.map((p) => ({ ...p })),
          currentPhase: null,
          errors: [],
          rawLogLines: [],
        });
        return;
      }

      case "build_phase_started":
      case "build_phase": {
        const id = pickString(data.id) ?? pickString(data.phase);
        if (!id) return;
        const label = pickString(data.label);
        const startedAt = event.ts || Date.now();
        const phases = state.phases.map((p) => {
          if (p.id === state.currentPhase && p.status === "active") {
            return { ...p, status: "done" as const, endedAt: startedAt };
          }
          return p;
        });
        const idx = phases.findIndex((p) => p.id === id);
        const existing = idx >= 0 ? phases[idx] : undefined;
        if (existing) {
          phases[idx] = {
            ...existing,
            status: "active",
            startedAt,
            label: label ?? existing.label,
          };
        } else {
          phases.push({
            id,
            label: label ?? id,
            status: "active",
            startedAt,
          });
        }
        set({ phases, currentPhase: id, status: "running" });
        return;
      }

      case "build_phase_completed": {
        const id = pickString(data.id) ?? pickString(data.phase);
        if (!id) return;
        const endedAt = event.ts || Date.now();
        const phases = state.phases.map((p) =>
          p.id === id ? { ...p, status: "done" as const, endedAt } : p,
        );
        set({ phases });
        return;
      }

      case "build_phase_subline": {
        const id = pickString(data.phase) ?? state.currentPhase;
        const text = pickString(data.text);
        if (!id || !text) return;
        const phases = state.phases.map((p) =>
          p.id === id ? { ...p, subLine: text } : p,
        );
        set({ phases });
        return;
      }

      case "build_log": {
        const text = pickString(data.text);
        if (text == null) return;
        const sourceRaw = pickString(data.source);
        const source: RawLogLine["source"] =
          sourceRaw === "stderr" || sourceRaw === "system" ? sourceRaw : "stdout";
        const line: RawLogLine = {
          id: nextLogId++,
          ts: event.ts || Date.now(),
          source,
          text,
        };
        const next = state.rawLogLines.concat(line);
        if (next.length > MAX_RAW_LOG_LINES) {
          next.splice(0, next.length - MAX_RAW_LOG_LINES);
        }
        set({ rawLogLines: next });
        return;
      }

      case "build_error": {
        const id = pickString(data.id) ?? `err-${event.seq}`;
        const file = pickString(data.file) ?? "unknown";
        const message = pickString(data.message) ?? "Unknown error";
        const err: BuildErrorState = {
          id,
          file,
          line: pickNumber(data.line),
          col: pickNumber(data.col),
          message,
          receivedAt: event.ts || Date.now(),
          resolved: false,
        };
        const phases = state.phases.map((p) =>
          p.id === state.currentPhase && p.status === "active"
            ? { ...p, status: "failed" as const }
            : p,
        );
        set({ errors: state.errors.concat(err), phases });
        return;
      }

      case "build_complete":
      case "build_completed": {
        const endedAt = event.ts || Date.now();
        const phases = state.phases.map((p) => {
          if (p.id === state.currentPhase && p.status === "active") {
            return { ...p, status: "done" as const, endedAt };
          }
          return p;
        });
        set({ status: "completed", phases });
        return;
      }

      case "build_failed": {
        const phases = state.phases.map((p) =>
          p.id === state.currentPhase && p.status === "active"
            ? { ...p, status: "failed" as const }
            : p,
        );
        set({ status: "failed", phases });
        return;
      }

      case "keep_alive":
      default:
        return;
    }
  },
}));
