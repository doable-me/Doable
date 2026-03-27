"use client";

import { memo, useState, useCallback, useRef } from "react";
import {
  Circle,
  Loader2,
  CheckCircle2,
  SkipForward,
  ChevronDown,
  X,
  GripVertical,
} from "lucide-react";
import type { PlanStep as PlanStepType } from "@doable/shared/types/ai";

interface PlanStepProps {
  step: PlanStepType;
  onEdit?: (stepId: string, field: "title" | "description", value: string) => void;
  onRemove?: (stepId: string) => void;
  isEditable?: boolean;
  isDragging?: boolean;
}

const statusIcons: Record<PlanStepType["status"], React.ReactNode> = {
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-brand-500 animate-spin" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />,
};

export const PlanStepCard = memo(function PlanStepCard({
  step,
  onEdit,
  onRemove,
  isEditable = false,
  isDragging = false,
}: PlanStepProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<"title" | "description" | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const hasDetails = step.details || (step.filePaths && step.filePaths.length > 0);

  const startEdit = useCallback(
    (field: "title" | "description") => {
      if (!isEditable || !onEdit) return;
      setEditingField(field);
      setEditValue(step[field]);
      // Focus the input on next render
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [isEditable, onEdit, step]
  );

  const commitEdit = useCallback(() => {
    if (!editingField || !onEdit) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== step[editingField]) {
      onEdit(step.id, editingField, trimmed);
    }
    setEditingField(null);
    setEditValue("");
  }, [editingField, editValue, onEdit, step]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        setEditingField(null);
        setEditValue("");
      }
    },
    [commitEdit]
  );

  return (
    <div
      className={`group flex items-start gap-2 rounded-md border px-3 py-2 transition-all ${
        isDragging
          ? "border-brand-500 bg-brand-500/5 shadow-sm"
          : "border-border bg-background"
      } ${step.status === "skipped" ? "opacity-50" : ""}`}
    >
      {/* Drag handle */}
      {isEditable && (
        <div className="mt-0.5 flex-none cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Status icon */}
      <div className="mt-0.5 flex-none">{statusIcons[step.status]}</div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        {editingField === "title" ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            className="w-full rounded border border-brand-500 bg-background px-1.5 py-0.5 text-xs font-medium text-foreground focus:outline-none"
          />
        ) : (
          <div
            className={`text-xs font-medium ${
              step.status === "in_progress" ? "text-brand-500" : "text-foreground"
            } ${isEditable ? "cursor-pointer hover:text-brand-500" : ""}`}
            onClick={() => startEdit("title")}
          >
            <span className="text-muted-foreground mr-1.5">{step.order}.</span>
            {step.title}
          </div>
        )}

        {/* Description */}
        {editingField === "description" ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleEditKeyDown}
            className="mt-0.5 w-full rounded border border-brand-500 bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
          />
        ) : (
          <p
            className={`mt-0.5 text-xs text-muted-foreground leading-relaxed ${
              isEditable ? "cursor-pointer hover:text-foreground" : ""
            } ${step.status === "completed" ? "line-through" : ""}`}
            onClick={() => startEdit("description")}
          >
            {step.description}
          </p>
        )}

        {/* Expandable details */}
        {hasDetails && (
          <div className="mt-1.5">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  expanded ? "rotate-0" : "-rotate-90"
                }`}
              />
              Show details
            </button>
            {expanded && (
              <div className="mt-1.5 rounded border border-border/50 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground space-y-1.5">
                {step.details && (
                  <p className="leading-relaxed whitespace-pre-wrap">{step.details}</p>
                )}
                {step.filePaths && step.filePaths.length > 0 && (
                  <div>
                    <span className="font-medium text-foreground">Files:</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {step.filePaths.map((fp) => (
                        <li key={fp} className="font-mono text-[11px]">
                          {fp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove button */}
      {isEditable && onRemove && (
        <button
          onClick={() => onRemove(step.id)}
          className="mt-0.5 flex-none text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
          title="Remove step"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
