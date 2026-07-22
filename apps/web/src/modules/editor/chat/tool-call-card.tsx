"use client";

/**
 * ToolCallCard — Dyad-inspired expandable card for each tool action
 * (running / completed / failed) with duration and file path.
 */

import { memo, useState } from "react";
import {
  Check,
  X,
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
  ChevronRight,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolCallCardProps {
  id: string;
  toolName: string;
  filePath?: string;
  friendlyMessage?: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  linesAdded?: number;
  linesRemoved?: number;
  /** Optional detail text shown when expanded */
  detail?: string;
}

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  editFile: "Edited",
  createFile: "Created",
  deleteFile: "Deleted",
  writeFile: "Wrote",
  overwriteFile: "Updated",
  readFile: "Read",
  listDirectory: "Scanned",
  searchCodebase: "Searched",
  findFiles: "Found files",
  grepFiles: "Searched",
  runCommand: "Ran command",
  executeCommand: "Executed",
  bash: "Shell",
  installPackage: "Installed packages",
  installDependencies: "Installed dependencies",
  runTests: "Ran tests",
  runLint: "Linted",
  typeCheck: "Type-checked",
  createPlan: "Created plan",
  updatePlan: "Updated plan",
  autoFix: "Auto-fixed",
  retryStep: "Retried",
  create_file: "Created",
  edit_file: "Edited",
  write_file: "Wrote",
  delete_file: "Deleted",
  read_file: "Read",
};

export function formatDuration(ms: number): string {
  if (ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const s = ms / 1000;
    return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
  }
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function ToolIcon({ toolName, status }: { toolName: string; status: ToolCallCardProps["status"] }) {
  const cls = cn(
    "h-3.5 w-3.5 shrink-0",
    status === "running" && "text-sky-500",
    status === "completed" && "text-emerald-500",
    status === "failed" && "text-red-400",
  );

  if (status === "running") return <Loader2 className={cn(cls, "animate-spin")} />;

  const name = toolName.toLowerCase();
  if (name.includes("edit") || name.includes("write") || name.includes("overwrite")) {
    return <FileEdit className={cls} />;
  }
  if (name.includes("create")) return <FilePlus className={cls} />;
  if (name.includes("read") || name.includes("list") || name.includes("folder")) {
    return <FolderSearch className={cls} />;
  }
  if (name.includes("search") || name.includes("grep") || name.includes("find")) {
    return <Search className={cls} />;
  }
  if (name.includes("command") || name.includes("bash") || name.includes("shell")) {
    return <Terminal className={cls} />;
  }
  if (name.includes("install") || name.includes("package")) return <Package className={cls} />;
  if (name.includes("test") || name.includes("lint") || name.includes("typecheck")) {
    return <TestTube className={cls} />;
  }
  if (name.includes("plan")) return <Cpu className={cls} />;
  if (status === "completed") return <Check className={cls} />;
  if (status === "failed") return <X className={cls} />;
  return <Wrench className={cls} />;
}

function pastTenseLabel(toolName: string, status: ToolCallCardProps["status"], shortName?: string) {
  const base =
    FRIENDLY_TOOL_NAMES[toolName] ??
    FRIENDLY_TOOL_NAMES[toolName.replace(/([A-Z])/g, "_$1").toLowerCase()] ??
    null;

  if (status === "running") {
    if (shortName) {
      const gerund =
        toolName.toLowerCase().includes("create")
          ? "Creating"
          : toolName.toLowerCase().includes("edit") || toolName.toLowerCase().includes("write")
            ? "Editing"
            : toolName.toLowerCase().includes("read")
              ? "Reading"
              : toolName.toLowerCase().includes("delete")
                ? "Deleting"
                : "Working on";
      return `${gerund} ${shortName}`;
    }
    return base ? `${base}…` : `${toolName}…`;
  }

  if (shortName && base) return `${base} ${shortName}`;
  if (shortName) return shortName;
  return base ?? toolName;
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
  detail,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const shortName = filePath ? filePath.split(/[\\/]/).pop() : undefined;
  const label =
    friendlyMessage ||
    pastTenseLabel(toolName, status, shortName);
  const durationMs =
    completedAt != null
      ? completedAt - startedAt
      : status === "running"
        ? Date.now() - startedAt
        : null;
  const canExpand = Boolean(filePath || detail);

  return (
    <div
      className={cn(
        "group rounded-xl border transition-all duration-200",
        status === "running" && "border-sky-500/30 bg-sky-500/5",
        status === "completed" && "border-border/80 bg-background/80 hover:border-emerald-500/25",
        status === "failed" && "border-red-500/25 bg-red-500/5",
      )}
    >
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left",
          canExpand && "cursor-pointer",
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
            status === "running" && "border-sky-500/30 bg-sky-500/10",
            status === "completed" && "border-emerald-500/20 bg-emerald-500/10",
            status === "failed" && "border-red-500/20 bg-red-500/10",
          )}
        >
          <ToolIcon toolName={toolName} status={status} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-[13px] font-medium",
                status === "failed" ? "text-red-400" : "text-foreground",
              )}
            >
              {label}
            </span>
            {status === "completed" && (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Done
              </span>
            )}
            {status === "running" && (
              <span className="shrink-0 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                Running
              </span>
            )}
          </div>
          {filePath && shortName !== filePath && (
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={filePath}>
              {filePath}
            </p>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {status === "completed" && (linesAdded !== undefined || linesRemoved !== undefined) && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium">
              {linesAdded !== undefined && linesAdded > 0 && (
                <span className="text-emerald-500">+{linesAdded}</span>
              )}
              {linesRemoved !== undefined && linesRemoved > 0 && (
                <span className="text-red-400">−{linesRemoved}</span>
              )}
            </span>
          )}
          {durationMs != null && (
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {formatDuration(durationMs)}
            </span>
          )}
          {status === "completed" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
          {status === "failed" && <X className="h-3.5 w-3.5 text-red-400" />}
          {canExpand && (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
          {filePath && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <FileCode className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-all font-mono">{filePath}</span>
            </div>
          )}
          {detail && (
            <p className="text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {detail}
            </p>
          )}
          {status === "completed" && durationMs != null && (
            <p className="text-[11px] text-muted-foreground">
              Completed in {formatDuration(durationMs)}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

/** Compact summary banner for a finished batch of tool actions */
export function ToolActivitySummary({
  actions,
  isStreaming,
  liveStatus,
}: {
  actions: Array<{
    id: string;
    toolName: string;
    description: string;
    filePath?: string;
    status?: "running" | "completed" | "failed";
    startedAt?: number;
    completedAt?: number;
  }>;
  isStreaming?: boolean;
  liveStatus?: string;
}) {
  const completed = actions.filter((a) => a.status === "completed");
  const failed = actions.filter((a) => a.status === "failed");
  const running = actions.filter((a) => a.status === "running");

  const times = actions
    .filter((a) => a.startedAt != null)
    .map((a) => ({
      start: a.startedAt!,
      end: a.completedAt ?? (a.status === "running" ? Date.now() : a.startedAt!),
    }));
  const totalMs =
    times.length > 0
      ? Math.max(...times.map((t) => t.end)) - Math.min(...times.map((t) => t.start))
      : null;

  const title = isStreaming
    ? liveStatus || (running[0]
        ? running[0].filePath?.split(/[\\/]/).pop() || running[0].description
        : "Working…")
    : failed.length > 0
      ? `Finished with ${failed.length} issue${failed.length === 1 ? "" : "s"}`
      : completed.length === 0
        ? "Done"
        : completed.length === 1
          ? "1 change applied"
          : `${completed.length} changes applied`;

  return (
    <div className="mt-3 mb-1 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {isStreaming ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-500" />
          ) : failed.length > 0 ? (
            <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="truncate text-[13px] font-semibold text-foreground">{title}</span>
        </div>
        {totalMs != null && totalMs > 0 && (
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {isStreaming ? "elapsed " : ""}
            {formatDuration(totalMs)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {actions.map((action) => (
          <ToolCallCard
            key={action.id}
            id={action.id}
            toolName={action.toolName}
            filePath={action.filePath}
            friendlyMessage={action.description}
            status={action.status ?? "completed"}
            startedAt={action.startedAt ?? Date.now()}
            completedAt={action.completedAt}
            detail={
              action.filePath && action.description !== action.filePath
                ? action.description
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
