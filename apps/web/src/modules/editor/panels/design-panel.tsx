"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Sparkles,
  ArrowLeft,
  CornerRightUp,
  MousePointer2,
  Crosshair,
  Save,
  Loader2,
} from "lucide-react";
import type {
  SelectedElement,
  VisualEditMode,
} from "@/modules/editor/visual-edit/types";
import {
  TextEditor,
  ColorEditor,
  SpacingEditor,
  TypographyEditor,
  SizeEditor,
  BorderEditor,
  LayoutEditor,
} from "@/modules/editor/visual-edit/property-panels";
import type { DesignPanelProps } from "./design-panel-types";
export type { DesignPanelProps } from "./design-panel-types";

// ─── Main Component ─────────────────────────────────────────

export function DesignPanel({
  onClose,
  onSendMessage: _onSendMessage,
  mode,
  selectedElement,
  onActivate,
  onSelectParent,
  onDeselectElement: _onDeselectElement,
  onApplyLiveStyle,
  onApplyLiveText,
  hasPendingChanges: hasPendingLiveChanges,
  onCommitChanges,
  onDiscardChanges,
  onDirectSave,
  isSaving,
}: DesignPanelProps) {
  // ─── Local style editing state (tracks user edits) ─────────
  const [textContent, setTextContent] = useState("");
  const [textColor, setTextColor] = useState("");
  const [bgColor, setBgColor] = useState("");
  const [fontSize, setFontSize] = useState("");
  const [fontWeight, setFontWeight] = useState("");
  const [fontStyle, setFontStyle] = useState("");
  const [textAlign, setTextAlign] = useState("");
  const [marginTop, setMarginTop] = useState("");
  const [marginRight, setMarginRight] = useState("");
  const [marginBottom, setMarginBottom] = useState("");
  const [marginLeft, setMarginLeft] = useState("");
  const [paddingTop, setPaddingTop] = useState("");
  const [paddingRight, setPaddingRight] = useState("");
  const [paddingBottom, setPaddingBottom] = useState("");
  const [paddingLeft, setPaddingLeft] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [borderWidth, setBorderWidth] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [borderStyle, setBorderStyle] = useState("");
  const [borderRadius, setBorderRadius] = useState("");
  const [flexDirection, setFlexDirection] = useState("");
  const [alignItems, setAlignItems] = useState("");
  const [justifyContent, setJustifyContent] = useState("");
  const [gap, setGap] = useState("");

  // Track original values for diff
  const [origStyles, setOrigStyles] = useState<Record<string, string>>({});

  // ─── Sync state when element changes ──────────────────────
  const syncElementStyles = useCallback((el: SelectedElement) => {
    const cs = el.computedStyles;
    setTextContent(el.textContent);
    setTextColor(cs.color);
    setBgColor(cs.backgroundColor);
    setFontSize(cs.fontSize);
    setFontWeight(cs.fontWeight);
    setFontStyle(cs.fontStyle);
    setTextAlign(cs.textAlign);
    setMarginTop(cs.marginTop);
    setMarginRight(cs.marginRight);
    setMarginBottom(cs.marginBottom);
    setMarginLeft(cs.marginLeft);
    setPaddingTop(cs.paddingTop);
    setPaddingRight(cs.paddingRight);
    setPaddingBottom(cs.paddingBottom);
    setPaddingLeft(cs.paddingLeft);
    setWidth(cs.width);
    setHeight(cs.height);
    setBorderWidth(cs.borderWidth);
    setBorderColor(cs.borderColor);
    setBorderStyle(cs.borderStyle);
    setBorderRadius(cs.borderRadius);
    setFlexDirection(cs.flexDirection);
    setAlignItems(cs.alignItems);
    setJustifyContent(cs.justifyContent);
    setGap(cs.gap);
    setOrigStyles({
      textContent: el.textContent,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      textAlign: cs.textAlign,
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      width: cs.width,
      height: cs.height,
      borderWidth: cs.borderWidth,
      borderColor: cs.borderColor,
      borderStyle: cs.borderStyle,
      borderRadius: cs.borderRadius,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      gap: cs.gap,
    });
  }, []);

  // ─── Wrappers: update local state + apply live to iframe ────
  const liveStyle = useCallback(
    (setter: (v: string) => void, property: string) => (value: string) => {
      setter(value);
      onApplyLiveStyle(property, value);
    },
    [onApplyLiveStyle],
  );

  const handleLiveTextContent = useCallback(
    (value: string) => {
      setTextContent(value);
      onApplyLiveText(value);
    },
    [onApplyLiveText],
  );

  const handleLiveTextColor = useMemo(() => liveStyle(setTextColor, "color"), [liveStyle]);
  const handleLiveBgColor = useMemo(() => liveStyle(setBgColor, "backgroundColor"), [liveStyle]);
  const handleLiveFontSize = useMemo(() => liveStyle(setFontSize, "fontSize"), [liveStyle]);
  const handleLiveFontWeight = useMemo(() => liveStyle(setFontWeight, "fontWeight"), [liveStyle]);
  const handleLiveFontStyle = useMemo(() => liveStyle(setFontStyle, "fontStyle"), [liveStyle]);
  const handleLiveTextAlign = useMemo(() => liveStyle(setTextAlign, "textAlign"), [liveStyle]);
  const handleLiveMarginTop = useMemo(() => liveStyle(setMarginTop, "marginTop"), [liveStyle]);
  const handleLiveMarginRight = useMemo(() => liveStyle(setMarginRight, "marginRight"), [liveStyle]);
  const handleLiveMarginBottom = useMemo(() => liveStyle(setMarginBottom, "marginBottom"), [liveStyle]);
  const handleLiveMarginLeft = useMemo(() => liveStyle(setMarginLeft, "marginLeft"), [liveStyle]);
  const handleLivePaddingTop = useMemo(() => liveStyle(setPaddingTop, "paddingTop"), [liveStyle]);
  const handleLivePaddingRight = useMemo(() => liveStyle(setPaddingRight, "paddingRight"), [liveStyle]);
  const handleLivePaddingBottom = useMemo(() => liveStyle(setPaddingBottom, "paddingBottom"), [liveStyle]);
  const handleLivePaddingLeft = useMemo(() => liveStyle(setPaddingLeft, "paddingLeft"), [liveStyle]);
  const handleLiveWidth = useMemo(() => liveStyle(setWidth, "width"), [liveStyle]);
  const handleLiveHeight = useMemo(() => liveStyle(setHeight, "height"), [liveStyle]);
  const handleLiveBorderWidth = useMemo(() => liveStyle(setBorderWidth, "borderWidth"), [liveStyle]);
  const handleLiveBorderColor = useMemo(() => liveStyle(setBorderColor, "borderColor"), [liveStyle]);
  const handleLiveBorderStyle = useMemo(() => liveStyle(setBorderStyle, "borderStyle"), [liveStyle]);
  const handleLiveBorderRadius = useMemo(() => liveStyle(setBorderRadius, "borderRadius"), [liveStyle]);
  const handleLiveFlexDirection = useMemo(() => liveStyle(setFlexDirection, "flexDirection"), [liveStyle]);
  const handleLiveAlignItems = useMemo(() => liveStyle(setAlignItems, "alignItems"), [liveStyle]);
  const handleLiveJustifyContent = useMemo(() => liveStyle(setJustifyContent, "justifyContent"), [liveStyle]);
  const handleLiveGap = useMemo(() => liveStyle(setGap, "gap"), [liveStyle]);

  // Sync when selected element changes
  const lastElementSelector = useMemo(() => selectedElement?.selector, [selectedElement]);
  const [lastSyncedSelector, setLastSyncedSelector] = useState<string | null>(null);

  useEffect(() => {
    if (lastElementSelector && lastElementSelector !== lastSyncedSelector && selectedElement) {
      syncElementStyles(selectedElement);
      setLastSyncedSelector(lastElementSelector);
    }
    if (!lastElementSelector && lastSyncedSelector) {
      setLastSyncedSelector(null);
    }
  }, [lastElementSelector, lastSyncedSelector, selectedElement, syncElementStyles]);

  // ─── Determine which panels to show ────────────────────────
  const showTextPanel = selectedElement?.isTextElement || (selectedElement?.textContent && selectedElement.textContent.length > 0);
  const showLayoutPanel = selectedElement?.computedStyles.display === "flex" || selectedElement?.computedStyles.display === "inline-flex" || selectedElement?.computedStyles.display === "grid";

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Design</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-foreground">Design View</span>
        </div>
        {selectedElement && (
          <button
            onClick={onSelectParent}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <CornerRightUp className="h-3.5 w-3.5" />
            Select parent
          </button>
        )}
      </div>

      {/* ─── Scrollable Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ─── No Selection State ────────────────────────────── */}
        {!selectedElement && (
          <div className="flex flex-col items-center px-6 pt-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              {mode === "selecting" ? (
                <Crosshair className="h-6 w-6 text-brand-400 animate-pulse" />
              ) : (
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <h3 className="mb-1 text-base font-semibold text-foreground">Design View</h3>
            <p className="mb-2 text-center text-sm text-muted-foreground">
              Select an element to edit it
            </p>
            <p className="mb-6 text-center text-xs text-muted-foreground">
              Hold <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl</kbd> to select multiple elements
            </p>
            {mode === "idle" && (
              <button
                onClick={onActivate}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors shadow-md shadow-brand-900/30"
              >
                <MousePointer2 className="h-4 w-4" />
                Start selecting
              </button>
            )}
            {mode === "selecting" && (
              <p className="text-xs text-brand-400 animate-pulse">
                Click an element in the preview...
              </p>
            )}
          </div>
        )}

        {/* ─── Element Selected — Property Editors ───────────── */}
        {selectedElement && (
          <div className="space-y-0">
            {/* Text Editor */}
            {showTextPanel && (
              <TextEditor value={textContent} onChange={handleLiveTextContent} />
            )}

            {/* Colors */}
            <ColorEditor
              textColor={textColor}
              backgroundColor={bgColor}
              onTextColorChange={handleLiveTextColor}
              onBgColorChange={handleLiveBgColor}
            />

            {/* Spacing */}
            <SpacingEditor
              margin={{ top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft }}
              padding={{ top: paddingTop, right: paddingRight, bottom: paddingBottom, left: paddingLeft }}
              onMarginChange={(v) => {
                handleLiveMarginTop(v.top);
                handleLiveMarginRight(v.right);
                handleLiveMarginBottom(v.bottom);
                handleLiveMarginLeft(v.left);
              }}
              onPaddingChange={(v) => {
                handleLivePaddingTop(v.top);
                handleLivePaddingRight(v.right);
                handleLivePaddingBottom(v.bottom);
                handleLivePaddingLeft(v.left);
              }}
            />

            {/* Layout (only for flex containers) */}
            {showLayoutPanel && (
              <LayoutEditor
                display={selectedElement.computedStyles.display}
                flexDirection={flexDirection}
                alignItems={alignItems}
                justifyContent={justifyContent}
                gap={gap}
                onFlexDirectionChange={handleLiveFlexDirection}
                onAlignItemsChange={handleLiveAlignItems}
                onJustifyContentChange={handleLiveJustifyContent}
                onGapChange={handleLiveGap}
              />
            )}

            {/* Typography */}
            <TypographyEditor
              fontSize={fontSize}
              fontWeight={fontWeight}
              fontStyle={fontStyle}
              textAlign={textAlign}
              onFontSizeChange={handleLiveFontSize}
              onFontWeightChange={handleLiveFontWeight}
              onFontStyleChange={handleLiveFontStyle}
              onTextAlignChange={handleLiveTextAlign}
            />

            {/* Size */}
            <SizeEditor
              width={width}
              height={height}
              onWidthChange={handleLiveWidth}
              onHeightChange={handleLiveHeight}
            />

            {/* Border */}
            <BorderEditor
              borderWidth={borderWidth}
              borderColor={borderColor}
              borderStyle={borderStyle}
              borderRadius={borderRadius}
              onBorderWidthChange={handleLiveBorderWidth}
              onBorderColorChange={handleLiveBorderColor}
              onBorderStyleChange={handleLiveBorderStyle}
              onBorderRadiusChange={handleLiveBorderRadius}
            />

            {/* ─── Sticky Pending Changes Bar ─────────────────── */}
            {hasPendingLiveChanges && (
              <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-foreground">Unsaved changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onDiscardChanges}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => onDirectSave()}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-900/30 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onCommitChanges}
                    disabled={isSaving}
                    className="flex items-center justify-center gap-2 rounded-lg bg-brand-600/80 px-3 py-2 text-xs font-medium text-white hover:bg-brand-500 transition-all disabled:opacity-50"
                    title="Send changes to AI for smarter code updates"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <div className="border-t border-border px-4 py-2.5">
        {/* Element breadcrumb chips */}
        <div className="mb-2 flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Design
          </span>
          {selectedElement && (
            <>
              <span className="text-muted-foreground text-[11px]">›</span>
              <span className="flex items-center gap-1 rounded-md bg-brand-500/15 px-2 py-1 text-[11px] font-medium text-brand-300">
                {selectedElement.tagName}
              </span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Chat
        </button>
      </div>
    </div>
  );
}
