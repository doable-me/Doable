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
  index?: number;
  onEdit?: (stepId: string, field: "title" | "description", value: string) => void;
  onRemove?: (stepId: string) => void;
  isEditable?: boolean;
  isDragging?: boolean;
}

// ─── Status config ─────────────────────────────────────────
const STATUS_CONFIG = {
  pending: {
    icon: <Circle className="h-3.5 w-3.5" />,
    borderColor: "border-border/60",
    leftBorder: "bg-muted-foreground/20",
    iconColor: "text-muted-foreground",
    badge: null,
  },
  in_progress: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    borderColor: "border-brand-500/40",
    leftBorder: "bg-gradient-to-b from-brand-500 to-brand-400",
    iconColor: "text-brand-500",
    badge: (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 text-[9px] font-medium text-brand-400">
        <span className="h-1 w-1 rounded-full bg-brand-400 animate-pulse" />
        Running
      </span>
    ),
  },
  completed: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    borderColor: "border-green-500/30",
    leftBorder: "bg-gradient-to-b from-green-500 to-green-400",
    iconColor: "text-green-500",
    badge: null,
  },
  skipped: {
    icon: <SkipForward className="h-3.5 w-3.5" />,
    borderColor: "border-border/30",
    leftBorder: "bg-muted-foreground/10",
    iconColor: "text-muted-foreground/50",
    badge: null,
  },
} as const;

export const PlanStepCard = memo(function PlanStepCard({
  step,
  index = 0,
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
  const cfg = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;

  const startEdit = useCallback(
    (field: "title" | "description") => {
      if (!isEditable || !onEdit) return;
      setEditingField(field);
      setEditValue(step[field]);
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
      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
      else if (e.key === "Escape") { setEditingField(null); setEditValue(""); }
    },
    [commitEdit]
  );

  return (
    <div
      className={`plan-step-bubble group relative flex items-start gap-0 rounded-lg border transition-all duration-200
        ${isDragging ? "border-brand-500/60 shadow-md shadow-brand-500/10 scale-[1.01]" : cfg.borderColor}
        ${step.status === "skipped" ? "opacity-40" : ""}
        ${step.status === "completed" ? "bg-green-500/[0.02]" : step.status === "in_progress" ? "bg-brand-500/[0.03]" : "bg-muted/20"}
        overflow-hidden
      `}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Colored left border strip */}
      <div className={`w-0.5 self-stretch shrink-0 ${cfg.leftBorder} transition-all duration-300`} />

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2">
        {/* Drag handle */}
        {isEditable && (
          <div className="mt-0.5 flex-none cursor-grab text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}

        {/* Status icon */}
        <div className={`mt-0.5 flex-none ${cfg.iconColor} transition-colors`}>
          {cfg.icon}
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Title */}
            {editingField === "title" ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                className="flex-1 rounded border border-brand-500 bg-background px-1.5 py-0.5 text-xs font-medium text-foreground focus:outline-none"
              />
            ) : (
              <span
                className={`text-xs font-medium leading-snug ${
                  step.status === "in_progress" ? "text-brand-400" :
                  step.status === "completed" ? "text-muted-foreground line-through" :
                  "text-foreground"
                } ${isEditable ? "cursor-pointer hover:text-brand-400 transition-colors" : ""}`}
                onClick={() => startEdit("title")}
              >
                <span className="text-muted-foreground/40 mr-1.5 text-[10px] font-mono">{step.order}.</span>
                {step.title}
              </span>
            )}
            {cfg.badge}
          </div>

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
                isEditable ? "cursor-pointer hover:text-foreground transition-colors" : ""
              }`}
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
                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`} />
                {expanded ? "Hide" : "Show"} details
              </button>
              {expanded && (
                <div className="mt-1.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground space-y-1.5">
                  {step.details && (
                    <p className="leading-relaxed whitespace-pre-wrap">{step.details}</p>
                  )}
                  {step.filePaths && step.filePaths.length > 0 && (
                    <div>
                      <span className="font-medium text-foreground">Files:</span>
                      <ul className="mt-0.5 space-y-0.5">
                        {step.filePaths.map((fp) => (
                          <li key={fp} className="font-mono text-[11px]">{fp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Remove button */}
      {isEditable && onRemove && (
        <button
          onClick={() => onRemove(step.id)}
          className="absolute right-2 top-2 flex-none text-muted-foreground opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-400 transition-all"
          title="Remove step"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
