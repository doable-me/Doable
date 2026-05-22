"use client";

import { memo, useState, useCallback, useRef } from "react";
import { ListChecks, Play, RefreshCw, RotateCcw, Plus, Sparkles } from "lucide-react";
import type { Plan } from "@doable/shared/types/ai";
import { PlanStepCard } from "./plan-step";

interface PlanCardProps {
  plan: Plan;
  onApprove?: () => void;
  onRefine?: () => void;
  onReset?: () => void;
  onStepEdit?: (stepId: string, field: "title" | "description", value: string) => void;
  onStepRemove?: (stepId: string) => void;
  onStepReorder?: (stepIds: string[]) => void;
  onStepAdd?: () => void;
  isEditable?: boolean;
}

const complexityConfig: Record<Plan["complexity"], { label: string; classes: string }> = {
  simple:   { label: "Simple",   classes: "bg-green-500/10 text-green-400 border-green-500/20" },
  moderate: { label: "Moderate", classes: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  complex:  { label: "Complex",  classes: "bg-red-500/10 text-red-400 border-red-500/20" },
};

export const PlanCard = memo(function PlanCard({
  plan,
  onApprove,
  onRefine,
  onReset,
  onStepEdit,
  onStepRemove,
  onStepReorder,
  onStepAdd,
  isEditable = false,
}: PlanCardProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);

  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);
  const complexity = complexityConfig[plan.complexity] ?? complexityConfig.moderate;

  // ─── Drag and Drop ──────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!isEditable) return;
      draggedIndexRef.current = index;
      e.dataTransfer.effectAllowed = "move";
      const target = e.currentTarget as HTMLElement;
      e.dataTransfer.setDragImage(target, 0, 0);
    },
    [isEditable]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!isEditable || draggedIndexRef.current === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverIndex !== index) setDragOverIndex(index);
    },
    [isEditable, dragOverIndex]
  );

  const handleDragEnd = useCallback(() => {
    draggedIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedIndexRef.current;
      if (fromIndex === null || fromIndex === dropIndex || !onStepReorder) {
        handleDragEnd();
        return;
      }
      const ids = sortedSteps.map((s) => s.id);
      const movedId = ids.splice(fromIndex, 1)[0]!;
      ids.splice(dropIndex, 0, movedId);
      onStepReorder(ids);
      handleDragEnd();
    },
    [sortedSteps, onStepReorder, handleDragEnd]
  );

  return (
    <div className="rounded-xl border border-white/8 bg-gradient-to-b from-muted/40 to-muted/20 shadow-lg overflow-hidden">
      {/* ── Premium Header ──────────────────────────────── */}
      <div className="relative flex items-center gap-2.5 px-3 py-2.5 border-b border-white/6 bg-gradient-to-r from-brand-500/10 via-purple-500/5 to-transparent">
        {/* Subtle glow orb */}
        <div className="absolute left-0 top-0 h-full w-24 bg-gradient-to-r from-brand-500/8 to-transparent pointer-events-none" />

        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500/15 border border-brand-500/20 shrink-0">
          <ListChecks className="h-3 w-3 text-brand-400" />
        </div>
        <span className="text-xs font-semibold text-foreground">Plan</span>

        <div className="ml-auto flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${complexity.classes}`}>
            {complexity.label}
          </span>
          <span className="text-[10px] text-muted-foreground/40">
            {sortedSteps.length} step{sortedSteps.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-sm text-foreground/90 leading-relaxed">{plan.summary}</p>
      </div>

      {/* ── Steps ────────────────────────────────────────── */}
      <div className="px-3 pb-3 space-y-1.5">
        {sortedSteps.map((step, index) => (
          <div
            key={step.id}
            draggable={isEditable}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`transition-all ${
              dragOverIndex === index && draggedIndexRef.current !== index
                ? "border-t-2 border-brand-500 pt-1"
                : ""
            }`}
          >
            <PlanStepCard
              step={step}
              index={index}
              onEdit={onStepEdit}
              onRemove={onStepRemove}
              isEditable={isEditable}
              isDragging={draggedIndexRef.current === index && dragOverIndex !== null}
            />
          </div>
        ))}

        {/* Add step button */}
        {isEditable && onStepAdd && (
          <button
            onClick={onStepAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-500/20 py-1.5 text-xs text-muted-foreground/60 hover:border-brand-500/40 hover:text-muted-foreground hover:bg-brand-500/5 transition-all duration-200"
          >
            <Plus className="h-3 w-3" />
            Add a step
          </button>
        )}
      </div>

      {/* ── Action Buttons ───────────────────────────────── */}
      {isEditable && plan.status === "draft" && (
        <div className="flex items-center gap-2 border-t border-white/6 px-3 py-2.5 bg-gradient-to-r from-brand-500/5 to-transparent">
          {onApprove && (
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-brand-500 hover:to-brand-400 transition-all duration-200 hover:shadow-brand-500/25 hover:shadow-md"
            >
              <Sparkles className="h-3 w-3" />
              Start Building
            </button>
          )}
          {onRefine && (
            <button
              onClick={onRefine}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:border-brand-500/30 transition-all duration-200"
            >
              <RefreshCw className="h-3 w-3" />
              Refine
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="ml-auto flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
});
