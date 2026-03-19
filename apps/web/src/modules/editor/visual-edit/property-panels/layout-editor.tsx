"use client";

import {
  LayoutGrid,
  ArrowRight,
  ArrowDown,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Rows3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface LayoutEditorProps {
  display: string;
  flexDirection: string;
  alignItems: string;
  justifyContent: string;
  gap: string;
  onFlexDirectionChange: (value: string) => void;
  onAlignItemsChange: (value: string) => void;
  onJustifyContentChange: (value: string) => void;
  onGapChange: (value: string) => void;
}

// ─── Constants ──────────────────────────────────────────────

const DIRECTION_OPTIONS = [
  { value: "row", icon: ArrowRight, label: "Row" },
  { value: "column", icon: ArrowDown, label: "Column" },
] as const;

const ALIGN_OPTIONS = [
  { value: "flex-start", icon: AlignStartVertical, label: "Start" },
  { value: "center", icon: AlignCenterVertical, label: "Center" },
  { value: "flex-end", icon: AlignEndVertical, label: "End" },
  { value: "stretch", icon: Rows3, label: "Stretch" },
] as const;

// ─── Component ──────────────────────────────────────────────

export function LayoutEditor({
  display,
  flexDirection,
  alignItems,
  justifyContent,
  gap,
  onFlexDirectionChange,
  onAlignItemsChange,
  onJustifyContentChange,
  onGapChange,
}: LayoutEditorProps) {
  // Only show full controls for flex/grid display modes
  const isFlexOrGrid =
    display === "flex" ||
    display === "inline-flex" ||
    display === "grid" ||
    display === "inline-grid";

  if (!isFlexOrGrid) {
    return (
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50">
        {/* Section Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <LayoutGrid className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-300">Layout</span>
        </div>

        <div className="px-3 pb-3">
          <p className="text-[11px] text-zinc-600">
            Display: <span className="font-mono text-zinc-500">{display}</span>
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            Layout controls are available for flex and grid elements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <LayoutGrid className="h-3.5 w-3.5 text-zinc-500" />
        <span className="flex-1 text-xs font-medium text-zinc-300">Layout</span>
        <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
          {display}
        </span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Direction */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-zinc-500">Direction</label>
          <div className="flex gap-0.5 rounded-md border border-zinc-700/60 bg-zinc-800/80 p-0.5">
            {DIRECTION_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => onFlexDirectionChange(value)}
                title={label}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1.5 text-[11px] transition-colors",
                  flexDirection === value
                    ? "bg-brand-500/20 text-brand-400"
                    : "text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Align Items */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-zinc-500">Align</label>
          <div className="flex gap-0.5 rounded-md border border-zinc-700/60 bg-zinc-800/80 p-0.5">
            {ALIGN_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => onAlignItemsChange(value)}
                title={label}
                className={cn(
                  "rounded p-1.5 transition-colors",
                  alignItems === value
                    ? "bg-brand-500/20 text-brand-400"
                    : "text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Gap */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-zinc-500">Gap</label>
          <input
            type="text"
            value={gap}
            onChange={(e) => onGapChange(e.target.value)}
            className="flex-1 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-300 outline-none font-mono focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
            placeholder="0px"
          />
        </div>
      </div>
    </div>
  );
}
