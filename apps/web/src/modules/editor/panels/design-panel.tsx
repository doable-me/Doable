"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Palette,
  ChevronDown,
  ChevronRight,
  MousePointer2,
  Type,
  Paintbrush,
  Move,
  Square,
  ArrowLeft,
  Crosshair,
  Layers,
  Info,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface DesignPanelProps {
  projectId: string;
  onClose: () => void;
  onSendMessage: (message: string) => void;
}

interface SelectedElement {
  tagName: string;
  classes: string;
  textContent: string;
  selector: string;
}

interface SpacingValues {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

interface StyleProperties {
  textContent: string;
  backgroundColor: string;
  textColor: string;
  fontSize: string;
  fontWeight: string;
  padding: SpacingValues;
  margin: SpacingValues;
  borderRadius: string;
}

// ─── Constants ──────────────────────────────────────────────

const FONT_WEIGHT_OPTIONS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extrabold" },
];

const DEFAULT_SPACING: SpacingValues = { top: "0", right: "0", bottom: "0", left: "0" };

const DEFAULT_STYLES: StyleProperties = {
  textContent: "",
  backgroundColor: "#transparent",
  textColor: "#ffffff",
  fontSize: "16",
  fontWeight: "400",
  padding: { ...DEFAULT_SPACING },
  margin: { ...DEFAULT_SPACING },
  borderRadius: "0",
};

// ─── Helper: Build AI prompt from style changes ─────────────

function buildPrompt(element: SelectedElement, original: StyleProperties, current: StyleProperties): string {
  const changes: string[] = [];

  if (current.textContent !== original.textContent && current.textContent) {
    changes.push(`text content to "${current.textContent}"`);
  }
  if (current.backgroundColor !== original.backgroundColor) {
    changes.push(`background color to ${current.backgroundColor}`);
  }
  if (current.textColor !== original.textColor) {
    changes.push(`text color to ${current.textColor}`);
  }
  if (current.fontSize !== original.fontSize) {
    changes.push(`font size to ${current.fontSize}px`);
  }
  if (current.fontWeight !== original.fontWeight) {
    const label = FONT_WEIGHT_OPTIONS.find((o) => o.value === current.fontWeight)?.label ?? current.fontWeight;
    changes.push(`font weight to ${label}`);
  }
  if (JSON.stringify(current.padding) !== JSON.stringify(original.padding)) {
    changes.push(`padding to ${current.padding.top}px ${current.padding.right}px ${current.padding.bottom}px ${current.padding.left}px`);
  }
  if (JSON.stringify(current.margin) !== JSON.stringify(original.margin)) {
    changes.push(`margin to ${current.margin.top}px ${current.margin.right}px ${current.margin.bottom}px ${current.margin.left}px`);
  }
  if (current.borderRadius !== original.borderRadius) {
    changes.push(`border radius to ${current.borderRadius}px`);
  }

  if (changes.length === 0) return "";

  const elementDesc = element.classes
    ? `the <${element.tagName}> element with class "${element.classes}"`
    : `the <${element.tagName}> element`;

  return `Change ${elementDesc} to have ${changes.join(", ")}`;
}

// ─── Sub-Components ─────────────────────────────────────────

function SectionHeader({
  label,
  icon: Icon,
  expanded,
  onToggle,
}: {
  label: string;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/60"
    >
      <Icon className="h-3.5 w-3.5 text-zinc-500" />
      <span className="flex-1 text-xs font-medium text-zinc-300">{label}</span>
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
      )}
    </button>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-24 text-[11px] text-zinc-500">{label}</label>
      <div className="flex flex-1 items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2 py-1">
        <div className="relative">
          <input
            type="color"
            value={value.startsWith("#") ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-5 w-5 cursor-pointer opacity-0"
          />
          <div
            className="h-5 w-5 rounded border border-zinc-600"
            style={{ backgroundColor: value }}
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none font-mono"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

function SpacingEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SpacingValues;
  onChange: (v: SpacingValues) => void;
}) {
  const sides = [
    { key: "top" as const, label: "T" },
    { key: "right" as const, label: "R" },
    { key: "bottom" as const, label: "B" },
    { key: "left" as const, label: "L" },
  ];

  return (
    <div>
      <label className="mb-1.5 block text-[11px] text-zinc-500">{label}</label>
      <div className="grid grid-cols-4 gap-1">
        {sides.map(({ key, label: sideLabel }) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-medium text-zinc-600">{sideLabel}</span>
            <input
              type="number"
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className="w-full rounded border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-1 text-center text-[11px] text-zinc-300 outline-none focus:border-purple-500/50"
              min="0"
              max="200"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  suffix = "px",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const numValue = parseInt(value, 10) || 0;

  return (
    <div className="flex items-center gap-2">
      <label className="w-24 text-[11px] text-zinc-500">{label}</label>
      <div className="flex flex-1 items-center gap-1.5">
        <input
          type="range"
          value={numValue}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="flex-1 accent-purple-500"
        />
        <div className="flex items-center gap-0.5 rounded border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-1">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 bg-transparent text-center text-[11px] text-zinc-300 outline-none"
            min={min}
            max={max}
          />
          <span className="text-[9px] text-zinc-600">{suffix}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function DesignPanel({ projectId, onClose, onSendMessage }: DesignPanelProps) {
  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);

  // Expand/collapse sections
  const [expandedSections, setExpandedSections] = useState({
    visual: true,
    text: true,
    colors: true,
    typography: true,
    spacing: true,
    borders: true,
  });

  // Style properties
  const [originalStyles] = useState<StyleProperties>({ ...DEFAULT_STYLES });
  const [styles, setStyles] = useState<StyleProperties>({ ...DEFAULT_STYLES });

  // Toggle a section
  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // Update a style property
  const updateStyle = useCallback(<K extends keyof StyleProperties>(key: K, value: StyleProperties[K]) => {
    setStyles((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Simulate selecting an element (placeholder for future iframe communication)
  const simulateSelectElement = useCallback(() => {
    const mockElement: SelectedElement = {
      tagName: "h1",
      classes: "text-4xl font-bold",
      textContent: "Welcome to My App",
      selector: "h1.text-4xl.font-bold",
    };
    setSelectedElement(mockElement);
    setStyles({
      textContent: mockElement.textContent,
      backgroundColor: "transparent",
      textColor: "#ffffff",
      fontSize: "36",
      fontWeight: "700",
      padding: { top: "0", right: "0", bottom: "0", left: "0" },
      margin: { top: "0", right: "0", bottom: "16", left: "0" },
      borderRadius: "0",
    });
    setSelectionMode(false);
  }, []);

  // Compute the AI prompt from current changes
  const pendingPrompt = useMemo(() => {
    if (!selectedElement) return "";
    return buildPrompt(selectedElement, originalStyles, styles);
  }, [selectedElement, originalStyles, styles]);

  // Apply changes
  const handleApply = useCallback(() => {
    if (!pendingPrompt) return;
    onSendMessage(pendingPrompt);
    // Reset selection after sending
    setSelectedElement(null);
    setStyles({ ...DEFAULT_STYLES });
  }, [pendingPrompt, onSendMessage]);

  // Reset to original
  const handleReset = useCallback(() => {
    setStyles({ ...originalStyles });
  }, [originalStyles]);

  // Deselect element
  const handleDeselect = useCallback(() => {
    setSelectedElement(null);
    setStyles({ ...DEFAULT_STYLES });
  }, []);

  return (
    <div className="flex h-full w-[380px] flex-col border-r border-zinc-800/60 bg-[#1C1C1C]">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Design</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          title="Close design panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Scrollable Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Visual Edits Card */}
        <div className="mx-3 mt-3 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
          <SectionHeader
            label="Visual edits"
            icon={Sparkles}
            expanded={expandedSections.visual}
            onToggle={() => toggleSection("visual")}
          />

          {expandedSections.visual && (
            <div className="px-3 pb-3">
              <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                Select elements to edit and style visually. Changes are sent as
                AI prompts to update your code.
              </p>

              {/* Selection Mode Toggle */}
              <button
                onClick={() => {
                  if (!selectionMode) {
                    setSelectionMode(true);
                    // In a real implementation, this would enable click-to-select
                    // in the preview iframe. For now, simulate after a delay.
                    setTimeout(simulateSelectElement, 800);
                  } else {
                    setSelectionMode(false);
                  }
                }}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
                  selectionMode
                    ? "border border-purple-500/50 bg-purple-500/10 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                    : "border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800"
                )}
              >
                {selectionMode ? (
                  <>
                    <Crosshair className="h-3.5 w-3.5 animate-pulse" />
                    Click an element in the preview...
                  </>
                ) : (
                  <>
                    <MousePointer2 className="h-3.5 w-3.5" />
                    {selectedElement ? "Select another element" : "Start selecting"}
                  </>
                )}
              </button>

              {/* Info box when no selection */}
              {!selectedElement && !selectionMode && (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-zinc-800/40 px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-600" />
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Enter selection mode, then click any element in the preview
                    to begin editing its styles. The preview cursor will change
                    to a crosshair.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Element Info */}
        {selectedElement && (
          <>
            <div className="mx-3 mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-xs font-medium text-purple-300">
                    Selected element
                  </span>
                </div>
                <button
                  onClick={handleDeselect}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Deselect
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[11px] font-mono font-medium text-purple-300">
                  &lt;{selectedElement.tagName}&gt;
                </span>
                {selectedElement.classes && (
                  <span className="truncate rounded bg-zinc-800/80 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">
                    .{selectedElement.classes.split(" ").join(" .")}
                  </span>
                )}
              </div>
            </div>

            {/* ─── Property Editors ─────────────────────────── */}

            {/* Text Content */}
            <div className="mx-3 mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
              <SectionHeader
                label="Text content"
                icon={Type}
                expanded={expandedSections.text}
                onToggle={() => toggleSection("text")}
              />
              {expandedSections.text && (
                <div className="px-3 pb-3">
                  <textarea
                    value={styles.textContent}
                    onChange={(e) => updateStyle("textContent", e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2.5 py-2 text-[12px] text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                    placeholder="Element text content..."
                  />
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="mx-3 mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
              <SectionHeader
                label="Colors"
                icon={Paintbrush}
                expanded={expandedSections.colors}
                onToggle={() => toggleSection("colors")}
              />
              {expandedSections.colors && (
                <div className="space-y-2.5 px-3 pb-3">
                  <ColorInput
                    label="Background"
                    value={styles.backgroundColor}
                    onChange={(v) => updateStyle("backgroundColor", v)}
                  />
                  <ColorInput
                    label="Text color"
                    value={styles.textColor}
                    onChange={(v) => updateStyle("textColor", v)}
                  />
                </div>
              )}
            </div>

            {/* Typography */}
            <div className="mx-3 mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
              <SectionHeader
                label="Typography"
                icon={Type}
                expanded={expandedSections.typography}
                onToggle={() => toggleSection("typography")}
              />
              {expandedSections.typography && (
                <div className="space-y-2.5 px-3 pb-3">
                  <NumberInput
                    label="Font size"
                    value={styles.fontSize}
                    onChange={(v) => updateStyle("fontSize", v)}
                    min={8}
                    max={120}
                  />
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-[11px] text-zinc-500">Weight</label>
                    <select
                      value={styles.fontWeight}
                      onChange={(e) => updateStyle("fontWeight", e.target.value)}
                      className="flex-1 rounded border border-zinc-700/60 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-300 outline-none focus:border-purple-500/50"
                    >
                      {FONT_WEIGHT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} ({opt.value})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Spacing */}
            <div className="mx-3 mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
              <SectionHeader
                label="Spacing"
                icon={Move}
                expanded={expandedSections.spacing}
                onToggle={() => toggleSection("spacing")}
              />
              {expandedSections.spacing && (
                <div className="space-y-3 px-3 pb-3">
                  <SpacingEditor
                    label="Padding"
                    value={styles.padding}
                    onChange={(v) => updateStyle("padding", v)}
                  />
                  <div className="border-t border-zinc-800/40" />
                  <SpacingEditor
                    label="Margin"
                    value={styles.margin}
                    onChange={(v) => updateStyle("margin", v)}
                  />
                </div>
              )}
            </div>

            {/* Borders */}
            <div className="mx-3 mt-2 rounded-lg border border-zinc-800/60 bg-zinc-900/50">
              <SectionHeader
                label="Borders"
                icon={Square}
                expanded={expandedSections.borders}
                onToggle={() => toggleSection("borders")}
              />
              {expandedSections.borders && (
                <div className="px-3 pb-3">
                  <NumberInput
                    label="Border radius"
                    value={styles.borderRadius}
                    onChange={(v) => updateStyle("borderRadius", v)}
                    min={0}
                    max={100}
                  />
                </div>
              )}
            </div>

            {/* ─── Actions ──────────────────────────────────── */}
            <div className="mx-3 mt-3 mb-3 space-y-2">
              {/* Pending prompt preview */}
              {pendingPrompt && (
                <div className="rounded-md border border-zinc-700/40 bg-zinc-800/40 px-3 py-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                    AI Prompt Preview
                  </p>
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    {pendingPrompt}
                  </p>
                </div>
              )}

              {/* Apply button */}
              <button
                onClick={handleApply}
                disabled={!pendingPrompt}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-all",
                  pendingPrompt
                    ? "bg-purple-600 text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
                    : "cursor-not-allowed bg-zinc-800/60 text-zinc-600"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Apply changes
              </button>

              {/* Reset */}
              <button
                onClick={handleReset}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700/60 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-300"
              >
                <RotateCcw className="h-3 w-3" />
                Reset changes
              </button>
            </div>
          </>
        )}
      </div>

      {/* ─── Footer: Back to Chat ────────────────────────────── */}
      <div className="border-t border-zinc-800/60 px-4 py-3">
        <button
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Chat
        </button>
      </div>
    </div>
  );
}
