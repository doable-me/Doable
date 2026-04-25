"use client";

import { useCallback } from "react";
import {
  Plus,
  Mic,
  ArrowUp,
  Hammer,
  Target,
  Loader2,
  X,
} from "lucide-react";
import type { ImageAttachment } from "@/hooks/use-image-attachments";
import { useTypingPlaceholder } from "./dashboard-hooks";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isCreating,
  creatingStatus,
  attachments,
  onOpenFilePicker,
  onRemoveImage,
  isListening,
  isMicSupported,
  onToggleMic,
  startMode,
  onToggleMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isCreating: boolean;
  creatingStatus: string;
  attachments: ImageAttachment[];
  onOpenFilePicker: () => void;
  onRemoveImage: (index: number) => void;
  isListening: boolean;
  isMicSupported: boolean;
  onToggleMic: () => void;
  startMode: "agent" | "plan";
  onToggleMode: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const placeholder = useTypingPlaceholder();
  const hasContent = value.trim() || attachments.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border bg-card shadow-lg transition-all focus-within:border-ring">
        <div className="p-4 pb-2">
          <textarea
            className="w-full resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[48px]"
            placeholder={value ? "" : placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isCreating}
          />
        </div>
        {/* Image preview thumbnails */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group/thumb">
                <img
                  src={att.data}
                  alt={att.name}
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
                <button
                  onClick={() => onRemoveImage(i)}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-secondary border border-border text-muted-foreground hover:text-white hover:bg-red-600 hover:border-red-600 transition-colors opacity-0 group-hover/thumb:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenFilePicker}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Attach image"
            >
              <Plus className="h-4 w-4" />
            </button>
            {/* Strategize / Work mode toggle */}
            <div className="flex items-center rounded-full border border-border overflow-hidden ml-1">
              <button
                onClick={startMode === "plan" ? undefined : onToggleMode}
                className={`flex items-center gap-1 px-2.5 h-7 text-[11px] font-medium transition-all ${
                  startMode === "plan"
                    ? "bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Strategize first, then do the work"
              >
                <Target className="h-3 w-3" />
                Strategize
              </button>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={startMode === "agent" ? undefined : onToggleMode}
                className={`flex items-center gap-1 px-2.5 h-7 text-[11px] font-medium transition-all ${
                  startMode === "agent"
                    ? "bg-brand-100 dark:bg-brand-600/20 text-brand-700 dark:text-brand-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Start working immediately"
              >
                <Hammer className="h-3 w-3" />
                Work
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isMicSupported && (
              <button
                onClick={onToggleMic}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isListening
                    ? "text-red-400 bg-red-500/10 animate-pulse"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={isListening ? "Stop recording" : "Voice input"}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onSubmit}
              disabled={!hasContent || isCreating}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                hasContent && !isCreating
                  ? "bg-brand-600 text-white hover:bg-brand-500"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              }`}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Granular status while creating + connecting */}
      {isCreating && creatingStatus && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200">
          <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
          <span>{creatingStatus}</span>
        </div>
      )}
    </div>
  );
}
