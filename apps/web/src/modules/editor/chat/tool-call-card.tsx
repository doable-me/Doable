"use client";

/**
 * ToolCallCard — animated card rendered inside assistant messages
 * for each tool call (running / completed / failed).
 * Preserves Doable's existing design tokens (brand-*, border, muted, etc.)
 */

import { memo } from "react";
import {
  Check,
  X,
  FileCode,
  Search,
  Terminal,
  Package,
  TestTube,
  Wrench,
  Loader2,
  FileEdit,
  FilePlus,
  FolderSearch,
  Cpu,
} from "lucide-react";
import type { AgentPhase } from "../hooks/use-agent-progress";

interface ToolCallCardProps {
  id: string;
  toolName: string;
  filePath?: string;
  friendlyMessage?: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

// Map tool name → human-readable label
const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  editFile:            "Editing file",
  createFile:          "Creating file",
  deleteFile:          "Deleting file",
  writeFile:           "Writing file",
  overwriteFile:       "Overwriting file",
  readFile:            "Reading file",
  listDirectory:       "Scanning directory",
  searchCodebase:      "Searching codebase",
  findFiles:           "Finding files",
  grepFiles:           "Searching files",
  runCommand:          "Running command",
  executeCommand:      "Executing command",
  bash:                "Running shell",
  installPackage:      "Installing packages",
  installDependencies: "Installing dependencies",
  runTests:            "Running tests",
  runLint:             "Running lint",
  typeCheck:           "Type checking",
  createPlan:          "Creating plan",
  updatePlan:          "Updating plan",
  autoFix:             "Auto-fixing issue",
  retryStep:           "Retrying step",
};

// Map tool name → lucide icon
function ToolIcon({ toolName, status }: { toolName: string; status: ToolCallCardProps["status"] }) {
  const cls = `h-3.5 w-3.5 shrink-0 ${
    status === "running"
      ? "text-blue-400"
      : status === "completed"
      ? "text-green-500"
      : "text-red-400"
  }`;

  if (status === "running") return <Loader2 className={`${cls} animate-spin`} />;

  const name = toolName.toLowerCase();
  if (name.includes("edit") || name.includes("write") || name.includes("overwrite")) return <FileEdit className={cls} />;
  if (name.includes("create")) return <FilePlus className={cls} />;
  if (name.includes("read") || name.includes("list") || name.includes("folder")) return <FolderSearch className={cls} />;
  if (name.includes("search") || name.includes("grep") || name.includes("find")) return <Search className={cls} />;
  if (name.includes("command") || name.includes("bash") || name.includes("shell")) return <Terminal className={cls} />;
  if (name.includes("install") || name.includes("package")) return <Package className={cls} />;
  if (name.includes("test") || name.includes("lint") || name.includes("typecheck")) return <TestTube className={cls} />;
  if (name.includes("plan")) return <Cpu className={cls} />;
  if (status === "completed") return <Check className={cls} />;
  if (status === "failed") return <X className={cls} />;
  return <Wrench className={cls} />;
}

export const ToolCallCard = memo(function ToolCallCard({
  toolName,
  filePath,
  friendlyMessage,
  status,
  startedAt,
  completedAt,
  linesAdded,
  linesRemoved,
}: ToolCallCardProps) {
  const baseLabel = FRIENDLY_TOOL_NAMES[toolName] ?? toolName;
  const shortName = filePath ? filePath.split(/[\\/]/).pop() : undefined;
  // Prefer a derived "<Action> <filename>" label so the user sees WHAT file is
  // being acted on (e.g. "Creating index.ts"). Fall back to the server's
  // friendlyMessage, then the static FRIENDLY_TOOL_NAMES entry.
  const label = shortName
    ? `${baseLabel.replace(/\s+file$/i, "")} ${shortName}`
    : friendlyMessage || baseLabel;
  const durationMs = completedAt ? completedAt - startedAt : null;

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs my-0.5 transition-all duration-300 ${
        status === "running"
          ? "border-blue-500/25 bg-blue-500/5"
          : status === "completed"
          ? "border-green-500/15 bg-green-500/5"
          : "border-red-500/15 bg-red-500/5"
      }`}
    >
      {/* Icon */}
      <div className="mt-0.5">
        <ToolIcon toolName={toolName} status={status} />
      </div>

      {/* Label + file path */}
      <div className="min-w-0 flex-1">
        <span
          className={`font-medium ${
            status === "running"
              ? "text-foreground"
              : status === "completed"
              ? "text-foreground/80"
              : "text-red-400"
          }`}
        >
          {label}
        </span>

        {/* Diff stats for file edits */}
        {status === "completed" && (linesAdded !== undefined || linesRemoved !== undefined) && (
          <span className="ml-2 inline-flex items-center gap-1.5 text-[10px]">
            {linesAdded !== undefined && linesAdded > 0 && (
              <span className="text-green-500">+{linesAdded}</span>
            )}
            {linesRemoved !== undefined && linesRemoved > 0 && (
              <span className="text-red-400">−{linesRemoved}</span>
            )}
          </span>
        )}
      </div>

      {/* Right side: status indicator */}
      <div className="ml-auto shrink-0 flex items-center gap-1">
        {status === "running" && (
          <span className="flex gap-[3px]">
            <span className="status-dot-1 inline-block h-1 w-1 rounded-full bg-blue-400" />
            <span className="status-dot-2 inline-block h-1 w-1 rounded-full bg-blue-400" />
            <span className="status-dot-3 inline-block h-1 w-1 rounded-full bg-blue-400" />
          </span>
        )}
        {status === "completed" && (
          <>
            {durationMs !== null && (
              <span className="text-[10px] text-muted-foreground/50">{durationMs}ms</span>
            )}
            <Check className="h-3 w-3 text-green-500" />
          </>
        )}
        {status === "failed" && <X className="h-3 w-3 text-red-400" />}
      </div>
    </div>
  );
});
