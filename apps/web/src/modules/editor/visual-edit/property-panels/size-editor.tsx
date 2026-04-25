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
    <div className="rounded-lg border border-border bg-card">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Scaling className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Size</span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Width */}
        <div className="flex items-center gap-2">
          <div className="flex w-20 shrink-0 items-center gap-1.5">
            <MoveHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-[11px] text-muted-foreground">Width</label>
          </div>
          <input
            type="text"
            value={width}
            onChange={(e) => onWidthChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none font-mono focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
            placeholder="auto"
          />
        </div>

        {/* Height */}
        <div className="flex items-center gap-2">
          <div className="flex w-20 shrink-0 items-center gap-1.5">
            <MoveVertical className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-[11px] text-muted-foreground">Height</label>
          </div>
          <input
            type="text"
            value={height}
            onChange={(e) => onHeightChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none font-mono focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
            placeholder="auto"
          />
        </div>
      </div>
    </div>
  );
}
