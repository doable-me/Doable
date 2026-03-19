"use client";

import { useRef, useState } from "react";
import { Paintbrush } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface ColorEditorProps {
  textColor: string;
  backgroundColor: string;
  onTextColorChange: (value: string) => void;
  onBgColorChange: (value: string) => void;
}

// ─── Sub-Components ─────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    setDraft(value);
    setPopoverOpen(true);
  };

  const handleClose = () => {
    setPopoverOpen(false);
  };

  const handleCommit = () => {
    if (draft !== value) {
      onChange(draft);
    }
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCommit();
    } else if (e.key === "Escape") {
      setDraft(value);
      handleClose();
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  // Display label: shorten long values
  const displayValue = value || "Inherit";

  // Attempt to render swatch color
  const swatchColor = value === "transparent" || !value ? "transparent" : value;

  return (
    <div className="relative" ref={rowRef}>
      <button
        onClick={handleOpen}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-zinc-800/60"
      >
        <label className="w-24 shrink-0 text-[11px] text-zinc-500 text-left pointer-events-none">
          {label}
        </label>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {/* Color swatch */}
          <div
            className="h-5 w-5 shrink-0 rounded-full border border-zinc-600"
            style={{ backgroundColor: swatchColor }}
          />
          <span className="truncate text-[11px] text-zinc-300 font-mono">
            {displayValue}
          </span>
        </div>
      </button>

      {/* Popover */}
      {popoverOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleClose}
          />
          {/* Popover content */}
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-zinc-700/60 bg-zinc-900 p-3 shadow-xl shadow-black/40">
            <div className="space-y-2.5">
              {/* Text input */}
              <div>
                <label className="mb-1 block text-[10px] text-zinc-500">
                  CSS Value
                </label>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-full rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1.5 text-[11px] text-zinc-300 outline-none font-mono focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                  placeholder="#000000 or color name"
                />
              </div>

              {/* Native color picker */}
              <div>
                <label className="mb-1 block text-[10px] text-zinc-500">
                  Pick Color
                </label>
                <input
                  type="color"
                  value={draft.startsWith("#") ? draft : "#000000"}
                  onChange={handleNativeColorChange}
                  className="h-8 w-full cursor-pointer rounded-md border border-zinc-700/60 bg-zinc-800/80 p-0.5"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleCommit}
                  className="flex-1 rounded-md bg-orange-500/20 px-2 py-1.5 text-[11px] font-medium text-orange-400 transition-colors hover:bg-orange-500/30"
                >
                  Apply
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function ColorEditor({
  textColor,
  backgroundColor,
  onTextColorChange,
  onBgColorChange,
}: ColorEditorProps) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Paintbrush className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">Colors</span>
      </div>

      {/* Content */}
      <div className="space-y-1 px-3 pb-3">
        <ColorRow
          label="Text color"
          value={textColor}
          onChange={onTextColorChange}
        />
        <ColorRow
          label="Background"
          value={backgroundColor}
          onChange={onBgColorChange}
        />
      </div>
    </div>
  );
}
