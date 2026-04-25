"use client";

import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface TypographyEditorProps {
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  onFontSizeChange: (value: string) => void;
  onFontWeightChange: (value: string) => void;
  onFontStyleChange: (value: string) => void;
  onTextAlignChange: (value: string) => void;
}

// ─── Constants ──────────────────────────────────────────────

const FONT_SIZE_OPTIONS = [
  { value: "0.75rem", label: "xs" },
  { value: "0.875rem", label: "sm" },
  { value: "1rem", label: "base" },
  { value: "1.125rem", label: "lg" },
  { value: "1.25rem", label: "xl" },
  { value: "1.5rem", label: "2xl" },
  { value: "1.875rem", label: "3xl" },
  { value: "2.25rem", label: "4xl" },
  { value: "3rem", label: "5xl" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: "", label: "Select weight" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
];

const FONT_STYLE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
];

const ALIGNMENT_OPTIONS = [
  { value: "left", icon: AlignLeft, label: "Align left" },
  { value: "center", icon: AlignCenter, label: "Align center" },
  { value: "right", icon: AlignRight, label: "Align right" },
  { value: "justify", icon: AlignJustify, label: "Justify" },
] as const;

// ─── Component ──────────────────────────────────────────────

export function TypographyEditor({
  fontSize,
  fontWeight,
  fontStyle,
  textAlign,
  onFontSizeChange,
  onFontWeightChange,
  onFontStyleChange,
  onTextAlignChange,
}: TypographyEditorProps) {
  // Find closest matching font size label
  const matchedSize = FONT_SIZE_OPTIONS.find((opt) => opt.value === fontSize);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Type className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Typography</span>
      </div>

      {/* Content */}
      <div className="space-y-2.5 px-3 pb-3">
        {/* Font Size */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Size</label>
          <select
            value={matchedSize ? fontSize : ""}
            onChange={(e) => onFontSizeChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand-500/50 transition-colors"
          >
            {!matchedSize && (
              <option value="" disabled>
                {fontSize}
              </option>
            )}
            {FONT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
              </option>
            ))}
          </select>
        </div>

        {/* Font Style */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Style</label>
          <select
            value={fontStyle}
            onChange={(e) => onFontStyleChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand-500/50 transition-colors"
          >
            {FONT_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Font Weight */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Weight</label>
          <select
            value={FONT_WEIGHT_OPTIONS.find((o) => o.value === fontWeight) ? fontWeight : ""}
            onChange={(e) => onFontWeightChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand-500/50 transition-colors"
          >
            {!FONT_WEIGHT_OPTIONS.find((o) => o.value === fontWeight) && fontWeight && (
              <option value="" disabled>
                {fontWeight}
              </option>
            )}
            {FONT_WEIGHT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Text Alignment */}
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">Align</label>
          <div className="flex gap-0.5 rounded-md border border-input bg-background p-0.5">
            {ALIGNMENT_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => onTextAlignChange(value)}
                title={label}
                className={cn(
                  "rounded p-1.5 transition-colors",
                  textAlign === value
                    ? "bg-brand-500/20 text-brand-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
