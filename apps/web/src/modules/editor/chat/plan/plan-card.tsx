"use client";

import { memo, useState, useCallback, useRef } from "react";
import { ListChecks, Play, RefreshCw, RotateCcw, Plus } from "lucide-react";
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

const complexityColors: Record<Plan["complexity"], string> = {
  simple: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  moderate: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  complex: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
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

  // Sort steps by order
  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

  // ─── Drag and Drop ──────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!isEditable) return;
      draggedIndexRef.current = index;
      e.dataTransfer.effectAllowed = "move";
      // Set a minimal drag image
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
      if (dragOverIndex !== index) {
        setDragOverIndex(index);
      }
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

      // Reorder the step IDs
      const ids = sortedSteps.map((s) => s.id);
      const movedId = ids.splice(fromIndex, 1)[0]!;
      ids.splice(dropIndex, 0, movedId);
      onStepReorder(ids);
      handleDragEnd();
    },
    [sortedSteps, onStepReorder, handleDragEnd]
  );

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <ListChecks className="h-3.5 w-3.5 text-brand-500" />
        <span className="text-xs font-semibold text-foreground">Plan</span>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            complexityColors[plan.complexity]
          }`}
        >
          {plan.complexity}
        </span>
      </div>

      {/* Summary */}
      <div className="px-3 py-2">
        <p className="text-sm text-foreground leading-relaxed">{plan.summary}</p>
      </div>

      {/* Steps */}
      <div className="px-3 pb-2 space-y-1.5">
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
              onEdit={onStepEdit}
              onRemove={onStepRemove}
              isEditable={isEditable}
              isDragging={
                draggedIndexRef.current === index && dragOverIndex !== null
              }
            />
          </div>
        ))}

        {/* Add step button */}
        {isEditable && onStepAdd && (
          <button
            onClick={onStepAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add a step
          </button>
        )}
      </div>

      {/* Action buttons — only for draft plans in editable mode */}
      {isEditable && plan.status === "draft" && (
        <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
          {onApprove && (
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <Play className="h-3 w-3" />
              Start Building
            </button>
          )}
          {onRefine && (
            <button
              onClick={onRefine}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refine...
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="ml-auto flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
