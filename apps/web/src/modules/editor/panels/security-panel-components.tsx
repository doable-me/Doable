"use client";

import {
  ShieldCheck,
  ShieldAlert,
  Play,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  FileSearch,
  ArrowUpRight,
  EyeOff,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Severity, Finding, ScanCategory, ScanPhase } from "./security-panel-types";
import { SEVERITY_CONFIG, SCAN_PHASES } from "./security-panel-types";

// ─── EmptyState ─────────────────────────────────────────────

export function EmptyState({ onRunScan }: { onRunScan: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
        <ShieldCheck className="h-7 w-7 text-blue-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Security Scanner
      </h3>
      <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
        Scan your project for dependency vulnerabilities, hardcoded secrets, code
        quality issues, and HTTPS configuration.
      </p>
      <button
        onClick={onRunScan}
        className="mt-5 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Play className="h-3.5 w-3.5" />
        Run Security Scan
      </button>
    </div>
  );
}

// ─── ScanAnimation ──────────────────────────────────────────

export function ScanAnimation({
  phase,
  progress,
}: {
  phase: ScanPhase | null;
  progress: number;
}) {
  const phaseLabel =
    SCAN_PHASES.find((p) => p.phase === phase)?.label ?? "Initializing...";

  return (
    <div className="flex flex-col items-center py-8">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldAlert className="h-8 w-8 animate-pulse text-primary" />
        </div>
      </div>

      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{phaseLabel}</span>
          <span className="font-mono text-foreground">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {SCAN_PHASES.slice(0, -1).map((p) => {
          const current = SCAN_PHASES.findIndex((sp) => sp.phase === phase);
          const idx = SCAN_PHASES.findIndex((sp) => sp.phase === p.phase);
          const isDone = idx < current;
          const isActive = idx === current;

          return (
            <div
              key={p.phase}
              className={cn(
                "flex items-center gap-2 text-xs transition-opacity",
                isDone
                  ? "text-emerald-400"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground/40"
              )}
            >
              {isDone ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : isActive ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
              )}
              {p.label.replace("...", "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SecurityScore ──────────────────────────────────────────

export function SecurityScore({
  score,
  scoreColor,
  trackColor,
}: {
  score: number;
  scoreColor: string;
  trackColor: string;
}) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center border-b border-border px-4 py-6">
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke="currentColor" strokeWidth="6" className="text-muted/50"
          />
          <circle
            cx="60" cy="60" r="54" fill="none"
            strokeWidth="6" strokeLinecap="round"
            className={trackColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold tabular-nums", scoreColor)}>
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Your project security score
      </p>
    </div>
  );
}

// ─── CategoryCard ───────────────────────────────────────────

export function CategoryCard({ category }: { category: ScanCategory }) {
  const Icon = category.icon;
  const statusConfig = {
    pass: {
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      icon: ShieldCheck,
    },
    warn: {
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      icon: AlertTriangle,
    },
    fail: {
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      icon: ShieldAlert,
    },
  };

  const config = statusConfig[category.status];
  const StatusIcon = config.icon;

  return (
    <div className={cn("rounded-lg border p-3 transition-colors", config.border, config.bg)}>
      <div className="flex items-start justify-between">
        <Icon className={cn("h-4 w-4", config.color)} />
        <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
      </div>
      <p className="mt-2 text-xs font-medium text-foreground">{category.label}</p>
      <p className={cn("mt-0.5 text-[11px]", config.color)}>{category.summary}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{category.details}</p>
    </div>
  );
}

// ─── SeverityPill ───────────────────────────────────────────

export function SeverityPill({
  severity,
  count,
}: {
  severity: Severity;
  count: number;
}) {
  if (count === 0) return null;
  const config = SEVERITY_CONFIG[severity];
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", config.bg, config.color)}>
      {count} {config.label}
    </span>
  );
}

// ─── FindingRow ─────────────────────────────────────────────

export function FindingRow({
  finding,
  expanded,
  onToggle,
  onFix,
  onDismiss,
}: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
  onFix: () => void;
  onDismiss: () => void;
}) {
  const config = SEVERITY_CONFIG[finding.severity];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className={cn("rounded-lg border transition-colors", config.border, "bg-muted/20")}>
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <Chevron className="h-3 w-3 flex-none text-muted-foreground" />
        <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", config.bg, config.color)}>
          {config.label}
        </span>
        <span className="flex-1 truncate text-xs font-medium text-foreground">{finding.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {finding.fixSuggestion && (
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onFix(); }}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Fix
            </button>
          )}
          <button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDismiss(); }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <EyeOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-2.5">
          {finding.description && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{finding.description}</p>
          )}
          {finding.filePath && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <FileSearch className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">
                {finding.filePath}{finding.lineNumber ? `:${finding.lineNumber}` : ""}
              </span>
            </div>
          )}
          {finding.codeSnippet && (
            <div className="mt-1.5 rounded bg-muted/50 px-2 py-1.5">
              <code className="text-[10px] text-foreground/80">{finding.codeSnippet}</code>
            </div>
          )}
          {finding.fixSuggestion && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              <span className="text-muted-foreground">{finding.fixSuggestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SecretFindingRow ───────────────────────────────────────

export function SecretFindingRow({
  finding,
  onMoveToEnv,
  onDismiss,
}: {
  finding: Finding;
  onMoveToEnv: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 flex-none text-red-400" />
          <div>
            <span className="text-xs font-medium text-foreground">{finding.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveToEnv}
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            Move to .env
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <EyeOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      {finding.filePath && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileSearch className="h-3 w-3" />
          <span className="font-mono">
            {finding.filePath}{finding.lineNumber ? `:${finding.lineNumber}` : ""}
          </span>
        </div>
      )}
      {finding.codeSnippet && (
        <div className="mt-1.5 rounded bg-muted/50 px-2 py-1.5">
          <code className="text-[10px] text-red-400/80">{finding.codeSnippet}</code>
        </div>
      )}
    </div>
  );
}
