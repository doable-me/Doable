/**
 * use-agent-progress.ts
 * Typed progress state machine for the AI agent.
 * Replaces the ad-hoc liveStatus colon-string format with a structured model.
 */

export type AgentPhase =
  | "idle"
  | "thinking"           // AI is reasoning / waiting for model response
  | "planning"           // Generating a structured plan
  | "clarifying"         // AI issued clarification questions, waiting for user
  | "reading_files"      // readFile / listDirectory / searchCodebase tool
  | "writing_files"      // editFile / createFile / deleteFile tool
  | "running_command"    // runCommand / shell execution
  | "fixing"             // Debugger / auto-fix retry loop
  | "installing"         // npm install / package manager
  | "testing"            // runTests / lint / type-check
  | "streaming_response" // Final answer streaming to the user
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentProgressState {
  phase: AgentPhase;
  /** Human-readable summary shown in the header badge and message status */
  message: string;
  /** Optional secondary detail line */
  subMessage?: string;
  /** Raw tool name from the SDK, e.g. "editFile" */
  toolName?: string;
  /** File path the tool is operating on, sanitized */
  filePath?: string;
  /** 0–100 progress percent when deterministic (e.g. plan step N of M) */
  percent?: number;
  /** 0-based index of the current plan step */
  stepIndex?: number;
  /** Total number of plan steps */
  stepTotal?: number;
  /** Milliseconds elapsed since this task started */
  elapsed?: number;
}

export interface AgentTimelineEvent {
  id: string;
  phase: AgentPhase;
  /** Friendly description shown in the activity feed */
  message: string;
  filePath?: string;
  toolName?: string;
  timestamp: string;
  /** Set when the event transitions to completed/failed */
  durationMs?: number;
  status: "running" | "completed" | "failed";
}

// ─── Tool → Phase inference ──────────────────────────────────

const TOOL_PHASE_MAP: Record<string, AgentPhase> = {
  // File operations
  editFile:              "writing_files",
  createFile:            "writing_files",
  deleteFile:            "writing_files",
  writeFile:             "writing_files",
  overwriteFile:         "writing_files",
  // Read operations
  readFile:              "reading_files",
  listDirectory:         "reading_files",
  searchCodebase:        "reading_files",
  findFiles:             "reading_files",
  grepFiles:             "reading_files",
  // Commands
  runCommand:            "running_command",
  executeCommand:        "running_command",
  bash:                  "running_command",
  // Package management
  installPackage:        "installing",
  installDependencies:   "installing",
  // Testing
  runTests:              "testing",
  runLint:               "testing",
  typeCheck:             "testing",
  // Planning
  createPlan:            "planning",
  updatePlan:            "planning",
  // Fixing
  autoFix:               "fixing",
  retryStep:             "fixing",
};

export function inferPhaseFromTool(toolName?: string): AgentPhase {
  if (!toolName) return "thinking";
  return TOOL_PHASE_MAP[toolName] ?? "thinking";
}

// ─── Friendly phase labels ───────────────────────────────────

export const PHASE_LABELS: Record<AgentPhase, string> = {
  idle:              "Ready",
  thinking:          "Thinking…",
  planning:          "Planning…",
  clarifying:        "Waiting for your input",
  reading_files:     "Reading files…",
  writing_files:     "Writing code…",
  running_command:   "Running command…",
  fixing:            "Fixing issues…",
  installing:        "Installing packages…",
  testing:           "Running tests…",
  streaming_response:"Responding…",
  completed:         "Done",
  failed:            "Failed",
  cancelled:         "Cancelled",
};

// ─── Phase-aware stale timeouts (ms) ────────────────────────
// These replace the single 30_000ms hardcoded threshold in use-chat.ts.

export const STALE_THRESHOLD_BY_PHASE: Partial<Record<AgentPhase, number>> = {
  thinking:          45_000,
  planning:          45_000,
  reading_files:     30_000,
  writing_files:     60_000,
  running_command:   90_000,
  installing:       120_000,   // npm install can take 2+ minutes
  testing:           90_000,
  fixing:            90_000,
  streaming_response:15_000,
  clarifying:       300_000,   // user may take time to answer
  idle:              30_000,
  completed:          5_000,
  failed:             5_000,
  cancelled:          5_000,
};

export const DEFAULT_STALE_THRESHOLD_MS = 45_000;

export function getStaleThreshold(phase: AgentPhase): number {
  return STALE_THRESHOLD_BY_PHASE[phase] ?? DEFAULT_STALE_THRESHOLD_MS;
}

// ─── File path extractor ─────────────────────────────────────

/** Extract a sanitized relative file path from a tool's argument object. */
export function extractFilePath(evtData: Record<string, unknown> | undefined): string | undefined {
  if (!evtData) return undefined;
  const raw =
    (evtData.path as string | undefined) ??
    (evtData.filePath as string | undefined) ??
    (evtData.file as string | undefined) ??
    (evtData.target as string | undefined);
  if (!raw) return undefined;
  // Strip absolute server prefixes — keep only relative path
  return raw.replace(/^.*\/(workspace|projects|sandboxes)\/[^/]+\//, "");
}
