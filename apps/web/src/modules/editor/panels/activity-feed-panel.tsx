"use client";

/**
 * ActivityFeedPanel — real-time operations log panel.
 * Shows every tool call, file change, and command as it happens.
 * Toggleable from the chat panel header.
 * Preserves Doable's existing border/muted/brand design tokens.
 */

import { memo, useRef, useEffect, useCallback } from "react";
import {
  Zap, X, FileEdit, FilePlus, Search, Terminal,
  Package, TestTube, Wrench, Brain, ListChecks,
  CheckCircle2, XCircle, Loader2, FolderSearch, Cpu,
} from "lucide-react";
import { useEditorStore } from "../hooks/use-editor-store";
import type { AgentTimelineEvent, AgentPhase } from "../hooks/use-agent-progress";

// ─── Phase → icon ──────────────────────────────────────────────
function EventIcon({ phase, status }: { phase: AgentPhase; status: AgentTimelineEvent["status"] }) {
  const running = status === "running";
  const failed = status === "failed";
  const cls = `h-3.5 w-3.5 shrink-0 ${
    failed ? "text-red-400" :
    running ? "text-brand-400" :
    "text-muted-foreground/60"
  }`;

  if (status === "completed") return <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 text-green-500/80`} />;
  if (status === "failed") return <XCircle className={`h-3.5 w-3.5 shrink-0 text-red-400`} />;

  switch (phase) {
    case "thinking":          return <Brain className={`${cls} animate-pulse`} />;
    case "planning":          return <ListChecks className={`${cls} animate-pulse`} />;
    case "reading_files":     return <FolderSearch className={cls} />;
    case "writing_files":     return <FileEdit className={`${cls} animate-pulse`} />;
    case "running_command":   return <Terminal className={`${cls} animate-pulse`} />;
    case "installing":        return <Package className={`${cls} animate-pulse`} />;
    case "testing":           return <TestTube className={`${cls} animate-pulse`} />;
    case "fixing":            return <Wrench className={`${cls} animate-spin`} />;
    case "streaming_response":return <Loader2 className={`${cls} animate-spin`} />;
    default:                  return <Cpu className={cls} />;
  }
}

// ─── Relative time label ───────────────────────────────────────
function useRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Single timeline row ───────────────────────────────────────
const TimelineEventRow = memo(function TimelineEventRow({
  event,
}: {
  event: AgentTimelineEvent;
}) {
  const age = useRelativeTime(event.timestamp);
  const isRunning = event.status === "running";

  // Extract filename from path
  const fileName = event.filePath
    ? event.filePath.split("/").pop()
    : null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        isRunning
          ? "bg-brand-500/5 border-l-2 border-l-brand-500/40"
          : "border-l-2 border-l-transparent"
      }`}
    >
      {/* Phase icon */}
      <div className="shrink-0">
        <EventIcon phase={event.phase} status={event.status} />
      </div>

      {/* Message */}
      <span
        className={`flex-1 truncate ${
          event.status === "failed"
            ? "text-red-400"
            : isRunning
            ? "text-foreground/80"
            : "text-muted-foreground"
        }`}
      >
        {event.message}
      </span>

      {/* File name chip */}
      {fileName && (
        <span className="shrink-0 max-w-[90px] truncate text-[10px] font-mono text-brand-400/60 bg-brand-500/5 px-1 py-0.5 rounded">
          {fileName}
        </span>
      )}

      {/* Duration or age */}
      <span className="shrink-0 text-[10px] text-muted-foreground/40">
        {isRunning
          ? "running…"
          : event.durationMs !== undefined
          ? `${event.durationMs}ms`
          : age}
      </span>
    </div>
  );
});

// ─── Summary footer ────────────────────────────────────────────
function FeedSummary({ events }: { events: AgentTimelineEvent[] }) {
  const filesChanged = events.filter(
    (e) => (e.phase === "writing_files") && e.status === "completed"
  ).length;
  const commandsRun = events.filter(
    (e) => (e.phase === "running_command" || e.phase === "installing") && e.status === "completed"
  ).length;
  const totalTools = events.filter((e) => e.status !== "running").length;

  if (totalTools === 0) return null;

  return (
    <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-muted-foreground/60">
      {filesChanged > 0 && <span>{filesChanged} file{filesChanged !== 1 ? "s" : ""} changed</span>}
      {commandsRun > 0 && <span>{commandsRun} command{commandsRun !== 1 ? "s" : ""}</span>}
      {totalTools > 0 && <span>{totalTools} operation{totalTools !== 1 ? "s" : ""}</span>}
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────
export function ActivityFeedPanel({ onClose }: { onClose: () => void }) {
  const agentTimeline = useEditorStore((s) => s.agentTimeline);
  const isStreaming = useEditorStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [agentTimeline.length]);

  const runningCount = agentTimeline.filter((e) => e.status === "running").length;

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 shrink-0">
        <Zap className={`h-3.5 w-3.5 ${isStreaming ? "text-brand-500" : "text-muted-foreground"}`} />
        <span className="text-xs font-semibold text-foreground flex-1">Live Activity</span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            {runningCount} running
          </span>
        )}
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close activity feed"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Event list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {agentTimeline.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground/50 text-center px-4">
              {isStreaming
                ? "Waiting for AI to start working…"
                : "Activity will appear here when the AI is working."}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {agentTimeline.map((event) => (
              <TimelineEventRow key={`${event.id}-${event.status}`} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Footer summary */}
      <FeedSummary events={agentTimeline} />
    </div>
  );
}
