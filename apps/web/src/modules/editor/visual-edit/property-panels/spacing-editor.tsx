"use client";

import { useState } from "react";
import {
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface SpacingValues {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

interface SpacingEditorProps {
  margin: SpacingValues;
  padding: SpacingValues;
  onMarginChange: (value: SpacingValues) => void;
  onPaddingChange: (value: SpacingValues) => void;
}

// ─── Sub-Components ─────────────────────────────────────────

function SpacingInput({
  value,
  icon: Icon,
  label,
  onChange,
}: {
  value: string;
  icon: React.ElementType;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={label}
        className="w-full rounded border border-input bg-background px-1 py-1 text-center text-[11px] text-foreground outline-none font-mono focus:border-brand-500/50 transition-colors"
      />
    </div>
  );
}

function SpacingGroup({
  label,
  values,
  onChange,
  expanded,
}: {
  label: string;
  values: SpacingValues;
  onChange: (values: SpacingValues) => void;
  expanded: boolean;
}) {
  const handleSideChange = (side: keyof SpacingValues, val: string) => {
    onChange({ ...values, [side]: val });
  };

  if (!expanded) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <div className="flex flex-1 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <span className="rounded bg-secondary px-1.5 py-0.5">{values.top}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5">{values.right}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5">{values.bottom}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5">{values.left}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="grid grid-cols-4 gap-1.5">
        <SpacingInput
          value={values.top}
          icon={ArrowUp}
          label="Top"
          onChange={(v) => handleSideChange("top", v)}
        />
        <SpacingInput
          value={values.right}
          icon={ArrowRight}
          label="Right"
          onChange={(v) => handleSideChange("right", v)}
        />
        <SpacingInput
          value={values.bottom}
          icon={ArrowDown}
          label="Bottom"
          onChange={(v) => handleSideChange("bottom", v)}
        />
        <SpacingInput
          value={values.left}
          icon={ArrowLeft}
          label="Left"
          onChange={(v) => handleSideChange("left", v)}
        />
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function SpacingEditor({
  margin,
  padding,
  onMarginChange,
  onPaddingChange,
}: SpacingEditorProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Move className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium text-foreground">Spacing</span>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={expanded ? "Collapse inputs" : "Expand inputs"}
        >
          {expanded ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3 px-3 pb-3">
        <SpacingGroup
          label="Margin"
          values={margin}
          onChange={onMarginChange}
          expanded={expanded}
        />

        <div className="border-t border-border" />

        <SpacingGroup
          label="Padding"
          values={padding}
          onChange={onPaddingChange}
          expanded={expanded}
        />
      </div>
    </div>
  );
}
