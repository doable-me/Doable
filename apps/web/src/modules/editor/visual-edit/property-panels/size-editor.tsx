"use client";

import { Scaling, MoveHorizontal, MoveVertical } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface SizeEditorProps {
  width: string;
  height: string;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
}

// ─── Component ──────────────────────────────────────────────

export function SizeEditor({
  width,
  height,
  onWidthChange,
  onHeightChange,
}: SizeEditorProps) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Scaling className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">Size</span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Width */}
        <div className="flex items-center gap-2">
          <div className="flex w-20 shrink-0 items-center gap-1.5">
            <MoveHorizontal className="h-3.5 w-3.5 text-zinc-600" />
            <label className="text-[11px] text-zinc-500">Width</label>
          </div>
          <input
            type="text"
            value={width}
            onChange={(e) => onWidthChange(e.target.value)}
            className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-300 outline-none font-mono focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
            placeholder="auto"
          />
        </div>

        {/* Height */}
        <div className="flex items-center gap-2">
          <div className="flex w-20 shrink-0 items-center gap-1.5">
            <MoveVertical className="h-3.5 w-3.5 text-zinc-600" />
            <label className="text-[11px] text-zinc-500">Height</label>
          </div>
          <input
            type="text"
            value={height}
            onChange={(e) => onHeightChange(e.target.value)}
            className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-300 outline-none font-mono focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
            placeholder="auto"
          />
        </div>
      </div>
    </div>
  );
}
