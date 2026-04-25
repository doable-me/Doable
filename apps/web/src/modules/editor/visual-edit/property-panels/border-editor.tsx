"use client";

import { useState } from "react";
import { Square } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface BorderEditorProps {
  borderWidth: string;
  borderColor: string;
  borderStyle: string;
  borderRadius: string;
  onBorderWidthChange: (value: string) => void;
  onBorderColorChange: (value: string) => void;
  onBorderStyleChange: (value: string) => void;
  onBorderRadiusChange: (value: string) => void;
}

// ─── Constants ──────────────────────────────────────────────

const BORDER_WIDTH_OPTIONS = [
  { value: "0px", label: "None" },
  { value: "1px", label: "1px" },
  { value: "2px", label: "2px" },
  { value: "4px", label: "4px" },
];

const BORDER_STYLE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "none", label: "None" },
];

// ─── Component ──────────────────────────────────────────────

export function BorderEditor({
  borderWidth,
  borderColor,
  borderStyle,
  borderRadius,
  onBorderWidthChange,
  onBorderColorChange,
  onBorderStyleChange,
  onBorderRadiusChange,
}: BorderEditorProps) {
  const [editingColor, setEditingColor] = useState(false);
  const [colorDraft, setColorDraft] = useState(borderColor);

  const handleColorStartEdit = () => {
    setColorDraft(borderColor);
    setEditingColor(true);
  };

  const handleColorCommit = () => {
    setEditingColor(false);
    if (colorDraft !== borderColor) {
      onBorderColorChange(colorDraft);
    }
  };

  const handleColorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleColorCommit();
    } else if (e.key === "Escape") {
      setColorDraft(borderColor);
      setEditingColor(false);
    }
  };

  // Match current width to one of our options
  const matchedWidth = BORDER_WIDTH_OPTIONS.find((opt) => opt.value === borderWidth);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Square className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Border</span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Border Width */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Width</label>
          <select
            value={matchedWidth ? borderWidth : ""}
            onChange={(e) => onBorderWidthChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand-500/50 transition-colors"
          >
            {!matchedWidth && (
              <option value="" disabled>
                {borderWidth}
              </option>
            )}
            {BORDER_WIDTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Border Color */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Color</label>
          <div className="flex flex-1 items-center gap-2">
            {/* Color swatch */}
            <div
              className="h-5 w-5 shrink-0 rounded-full border border-border"
              style={{
                backgroundColor:
                  borderColor === "transparent" ? "transparent" : borderColor,
              }}
            />

            {editingColor ? (
              <input
                type="text"
                value={colorDraft}
                onChange={(e) => setColorDraft(e.target.value)}
                onBlur={handleColorCommit}
                onKeyDown={handleColorKeyDown}
                autoFocus
                className="flex-1 rounded-md border border-brand-500/50 bg-background px-2 py-1 text-[11px] text-foreground outline-none font-mono focus:ring-1 focus:ring-brand-500/20"
                placeholder="#000000"
              />
            ) : (
              <button
                onClick={handleColorStartEdit}
                className="flex-1 truncate rounded-md border border-input bg-background px-2 py-1 text-left text-[11px] text-foreground font-mono transition-colors hover:border-border"
              >
                {borderColor || "none"}
              </button>
            )}
          </div>
        </div>

        {/* Border Style */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Style</label>
          <select
            value={borderStyle}
            onChange={(e) => onBorderStyleChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand-500/50 transition-colors"
          >
            {!BORDER_STYLE_OPTIONS.find((o) => o.value === borderStyle) && (
              <option value={borderStyle} disabled>
                {borderStyle}
              </option>
            )}
            {BORDER_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Border Radius */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Radius</label>
          <input
            type="text"
            value={borderRadius}
            onChange={(e) => onBorderRadiusChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none font-mono focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
            placeholder="0px"
          />
        </div>
      </div>
    </div>
  );
}
