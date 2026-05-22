"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowUp, CornerRightUp, Code2, Trash2 } from "lucide-react";
import type { ElementRect } from "./types";

// ─── Types ──────────────────────────────────────────────────

interface VisualEditToolbarProps {
  elementRect: ElementRect | null;
  iframeRect: DOMRect | null;
  onSubmitPrompt: (prompt: string) => void;
  onSelectParent: () => void;
  onViewCode: () => void;
  onDelete: () => void;
  hasPendingChanges?: boolean;
}

// ─── Constants ──────────────────────────────────────────────

const TOOLBAR_HEIGHT = 40;
const TOOLBAR_WIDTH = 360;
const GAP = 8;
const VIEWPORT_PADDING = 12;

// ─── Component ──────────────────────────────────────────────

export function VisualEditToolbar({
  elementRect,
  iframeRect,
  onSubmitPrompt,
  onSelectParent,
  onViewCode,
  onDelete,
  hasPendingChanges = false,
}: VisualEditToolbarProps) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when toolbar appears
  useEffect(() => {
    if (elementRect && inputRef.current) {
      // Small delay so the toolbar is positioned before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [elementRect]);

  // ─── Submit handler ─────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmitPrompt(trimmed);
    setPrompt("");
  }, [prompt, onSubmitPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ─── Compute position ──────────────────────────────────────
  const position = useMemo(() => {
    if (!elementRect || !iframeRect) return null;

    // Convert element rect from iframe-relative to viewport-relative
    const absTop = iframeRect.top + elementRect.top;
    const absBottom = iframeRect.top + elementRect.bottom;
    const absLeft = iframeRect.left + elementRect.left;
    const absRight = iframeRect.left + elementRect.right;
    const elementCenterX = absLeft + elementRect.width / 2;

    // Preferred: center toolbar horizontally on element
    let left = elementCenterX - TOOLBAR_WIDTH / 2;

    // Clamp to viewport bounds
    left = Math.max(VIEWPORT_PADDING, left);
    left = Math.min(window.innerWidth - TOOLBAR_WIDTH - VIEWPORT_PADDING, left);

    // Preferred: place below the element
    let top = absBottom + GAP;
    let placement: "below" | "above" = "below";

    // If not enough room below, place above
    if (top + TOOLBAR_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
      top = absTop - TOOLBAR_HEIGHT - GAP;
      placement = "above";
    }

    // If still out of bounds (above viewport), clamp
    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING;
    }

    return { top, left, placement };
  }, [elementRect, iframeRect]);

  // ─── Don't render if no selection ──────────────────────────
  if (!elementRect || !iframeRect || !position) return null;

  return (
    <div
      className="fixed z-[9999] flex items-center gap-1 rounded-xl border border-border bg-popover px-1.5 shadow-md backdrop-blur-md transition-all duration-150 ease-out"
      style={{
        top: position.top,
        left: position.left,
        height: TOOLBAR_HEIGHT,
        width: TOOLBAR_WIDTH,
      }}
      // Prevent clicks on the toolbar from deselecting the element
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* AI Prompt Input */}
      <div className="relative flex flex-1 items-center">
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasPendingChanges ? "Save first" : "Ask Doable..."}
          disabled={hasPendingChanges}
          className="h-7 w-full rounded-lg bg-secondary px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Submit Button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!prompt.trim()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-brand-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        title="Send prompt"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px shrink-0 bg-border" />

      {/* Select Parent Button */}
      <button
        type="button"
        onClick={onSelectParent}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Select parent element"
      >
        <CornerRightUp className="h-3.5 w-3.5" />
      </button>

      {/* View Code Button */}
      <button
        type="button"
        onClick={onViewCode}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="View source code"
      >
        <Code2 className="h-3.5 w-3.5" />
      </button>

      {/* Delete Button */}
      <button
        type="button"
        onClick={onDelete}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
        title="Delete element"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
