"use client";

import { memo, useMemo, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Circle,
  Pause,
  SkipForward,
  XCircle,
} from "lucide-react";
import type { Plan } from "@doable/shared/types/ai";

interface PlanProgressProps {
  plan: Plan;
  onPause?: () => void;
  onSkipStep?: (stepId: string) => void;
  /** When true, renders the compact horizontal pill strip for the sticky header */
  compact?: boolean;
}

// ─── Step icon ────────────────────────────────────────────────
function StepIcon({ status }: { status: string }) {
  if (status === "completed")  return <CheckCircle2 className="h-3 w-3 flex-none text-green-500" />;
  if (status === "in_progress") return <Loader2 className="h-3 w-3 flex-none text-brand-500 animate-spin" />;
  if (status === "skipped")    return <SkipForward className="h-3 w-3 flex-none text-muted-foreground" />;
  if (status === "failed")     return <XCircle className="h-3 w-3 flex-none text-red-400" />;
  return <Circle className="h-3 w-3 flex-none text-muted-foreground/40" />;
}

// ─── Compact step pill (for sticky header strip) ───────────────
function StepPill({
  status,
  title,
  isLast,
}: {
  status: string;
  title: string;
  isLast: boolean;
}) {
  const [justCompleted, setJustCompleted] = useState(false);
  const prevStatus = useRef(status);

  // Flash green when step transitions to completed
  useEffect(() => {
    if (prevStatus.current !== "completed" && status === "completed") {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 1200);
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status]);

  return (
    <div className="flex items-center gap-1 shrink-0">
      <div
        title={title}
        className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 transition-all duration-300 ${
          justCompleted
            ? "ring-green-500 bg-green-500/20 animate-step-complete"
            : status === "completed"
            ? "ring-green-500/40 bg-green-500/10"
            : status === "in_progress"
            ? "ring-brand-500 bg-brand-500/10"
            : status === "failed"
            ? "ring-red-400/40 bg-red-400/10"
            : "ring-border bg-transparent"
        }`}
      >
        <StepIcon status={status} />
      </div>
      {!isLast && (
        <div
          className={`h-px w-4 transition-all duration-500 ${
            status === "completed" ? "bg-green-500/40" : "bg-border"
          }`}
        />
      )}
    </div>
  );
}

// ─── Compact mode (sticky header) ─────────────────────────────
function CompactPlanProgress({ plan }: { plan: Plan }) {
  const sortedSteps = useMemo(
    () => [...plan.steps].sort((a, b) => a.order - b.order),
    [plan.steps]
  );

  const { completedCount, percentage } = useMemo(() => {
    const done = plan.steps.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length;
    return {
      completedCount: done,
      percentage: plan.steps.length > 0
        ? Math.round((done / plan.steps.length) * 100)
        : 0,
    };
  }, [plan.steps]);

  const activeStep = sortedSteps.find((s) => s.status === "in_progress");

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* Spinner + label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Loader2 className="h-3 w-3 text-brand-500 animate-spin" />
        <span className="text-xs font-medium text-foreground">Building</span>
      </div>

      {/* Step pills */}
      <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
        {sortedSteps.map((step, idx) => (
          <StepPill
            key={step.id}
            status={step.status}
            title={step.title}
            isLast={idx === sortedSteps.length - 1}
          />
        ))}
      </div>

      {/* Active step name */}
      {activeStep && (
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {activeStep.title}
        </span>
      )}

      {/* Percent */}
      <span className="text-xs text-muted-foreground shrink-0">
        {percentage}%
      </span>
    </div>
  );
}

// ─── Full mode (inside message list) ──────────────────────────
export const PlanProgress = memo(function PlanProgress({
  plan,
  onPause,
  onSkipStep,
  compact = false,
}: PlanProgressProps) {
  const sortedSteps = useMemo(
    () => [...plan.steps].sort((a, b) => a.order - b.order),
    [plan.steps]
  );

  const { completedCount, percentage } = useMemo(() => {
    const done = plan.steps.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length;
    const total = plan.steps.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { completedCount: done, percentage: pct };
  }, [plan.steps]);

  // Early return AFTER hooks to keep hook order stable across renders.
  if (compact) return <CompactPlanProgress plan={plan} />;

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Loader2 className="h-3.5 w-3.5 text-brand-500 animate-spin" />
        <span className="text-xs font-semibold text-foreground">Building</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {completedCount}/{plan.steps.length} steps
        </span>
        {onPause && (
          <button
            onClick={onPause}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Pause className="h-3 w-3" />
            Pause
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="px-3 pt-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{plan.summary}</p>
      </div>

      {/* Progress bar */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-700 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{percentage}%</span>
        </div>
      </div>

      {/* Step list */}
      <div className="px-3 pb-2 space-y-0.5">
        {sortedSteps.map((step) => {
          const isActive  = step.status === "in_progress";
          const isPending = step.status === "pending";

          return (
            <div
              key={step.id}
              className={`group flex items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors ${
                isActive ? "bg-brand-500/5" : ""
              }`}
            >
              <StepIcon status={step.status} />
              <span
                className={`flex-1 truncate ${
                  step.status === "completed" || step.status === "skipped"
                    ? "text-muted-foreground line-through"
                    : isActive
                    ? "text-foreground font-medium"
                    : (step.status as string) === "failed"
                    ? "text-red-400"
                    : "text-muted-foreground/60"
                }`}
              >
                {step.title}
              </span>
              {onSkipStep && (step.status === "pending" || step.status === "in_progress") && (
                <button
                  onClick={() => onSkipStep(step.id)}
                  className="flex-none text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                  title="Skip this step"
                >
                  <SkipForward className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
