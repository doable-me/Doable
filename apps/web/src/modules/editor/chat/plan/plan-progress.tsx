"use client";

import { memo, useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  Circle,
  Pause,
  SkipForward,
} from "lucide-react";
import type { Plan } from "@doable/shared/types/ai";

interface PlanProgressProps {
  plan: Plan;
  onPause?: () => void;
  onSkipStep?: (stepId: string) => void;
}

export const PlanProgress = memo(function PlanProgress({
  plan,
  onPause,
  onSkipStep,
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
        <p className="text-xs text-muted-foreground leading-relaxed">
          {plan.summary}
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Step list */}
      <div className="px-3 pb-2 space-y-0.5">
        {sortedSteps.map((step) => {
          const isCompleted = step.status === "completed";
          const isActive = step.status === "in_progress";
          const isSkipped = step.status === "skipped";
          const isPending = step.status === "pending";

          return (
            <div
              key={step.id}
              className={`group flex items-center gap-2 rounded px-1.5 py-1 text-xs ${
                isActive ? "bg-brand-500/5" : ""
              }`}
            >
              {/* Status icon */}
              {isCompleted && (
                <CheckCircle2 className="h-3 w-3 flex-none text-green-500" />
              )}
              {isActive && (
                <Loader2 className="h-3 w-3 flex-none text-brand-500 animate-spin" />
              )}
              {isSkipped && (
                <SkipForward className="h-3 w-3 flex-none text-muted-foreground" />
              )}
              {isPending && (
                <Circle className="h-3 w-3 flex-none text-muted-foreground/50" />
              )}

              {/* Title */}
              <span
                className={`flex-1 truncate ${
                  isCompleted
                    ? "text-muted-foreground line-through"
                    : isActive
                      ? "text-foreground font-medium"
                      : isSkipped
                        ? "text-muted-foreground line-through"
                        : "text-muted-foreground/60"
                }`}
              >
                {step.title}
              </span>

              {/* Skip button for pending/active steps */}
              {onSkipStep && (isPending || isActive) && (
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
