"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Mic,
  ArrowUp,
  Hammer,
  Target,
  Loader2,
  X,
  Layers,
  Wand2,
  Atom,
  Globe,
  Hexagon,
  Wind,
  Zap,
  Server,
  Code2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { Attachment } from "@/hooks/use-attachments";
import { useTypingPlaceholder } from "./dashboard-hooks";
import { apiFetch } from "@/lib/api";

// Static meta for icon/color mapping — the actual enabled set is fetched from API
const FRAMEWORK_META: Record<string, { icon: LucideIcon; color: string }> = {
  "vite-react": { icon: Atom, color: "text-cyan-500 dark:text-cyan-400" },
  "nextjs-app": { icon: Globe, color: "text-gray-800 dark:text-white" },
  "sveltekit": { icon: Hexagon, color: "text-orange-400" },
  "nuxt": { icon: Layers, color: "text-green-400" },
  "astro": { icon: Wind, color: "text-purple-400" },
  "hono": { icon: Zap, color: "text-orange-300" },
  "fastapi": { icon: Server, color: "text-emerald-400" },
  "django": { icon: Code2, color: "text-green-300" },
};

const AUTO_DETECT_OPTION = { id: "", label: "Auto-detect", icon: Wand2, color: "text-violet-400 dark:text-violet-400" };

function getDocIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (ext === "doc" || ext === "docx") return "📝";
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return "📊";
  if (ext === "ppt" || ext === "pptx") return "📑";
  if (ext === "txt" || ext === "md") return "📃";
  return "📎";
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isCreating,
  creatingStatus,
  attachments,
  onOpenFilePicker,
  onRemoveAttachment,
  isListening,
  isMicSupported,
  onToggleMic,
  startMode,
  onToggleMode,
  frameworkId,
  onFrameworkChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isCreating: boolean;
  creatingStatus: string;
  attachments: Attachment[];
  onOpenFilePicker: () => void;
  onRemoveAttachment: (id: string) => void;
  isListening: boolean;
  isMicSupported: boolean;
  onToggleMic: () => void;
  startMode: "agent" | "plan";
  onToggleMode: () => void;
  frameworkId: string | null;
  onFrameworkChange: (id: string | null) => void;
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
        {/* Attachment preview thumbnails */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
            {attachments.map((att) => (
              <div key={att.id} className="relative group/thumb">
                {att.type === "image" ? (
                  <img
                    src={att.preview || att.data}
                    alt={att.name}
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                ) : (
                  <div className="h-16 w-auto min-w-[64px] max-w-[140px] rounded-lg border border-border bg-muted/50 flex items-center gap-1.5 px-2">
                    <span className="text-lg shrink-0">{getDocIcon(att.name)}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => onRemoveAttachment(att.id)}
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
              title="Attach files"
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
            {/* Framework picker — defaults to auto-detect (server picks
                from prompt text, falls back to workspace admin default). */}
            <FrameworkPicker
              value={frameworkId}
              onChange={onFrameworkChange}
              disabled={isCreating}
            />
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

/* ─── Custom Framework Picker (supports icons + dark/light mode) ─── */

function FrameworkPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<{ id: string; label: string; icon: LucideIcon; color: string }[]>([AUTO_DETECT_OPTION]);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Fetch enabled frameworks from API once
  useEffect(() => {
    apiFetch<{ frameworks: Array<{ id: string; name: string }> }>("/frameworks")
      .then((res) => {
        if (res.frameworks?.length > 0) {
          const opts = [AUTO_DETECT_OPTION, ...res.frameworks.map((fw) => ({
            id: fw.id,
            label: fw.name,
            icon: FRAMEWORK_META[fw.id]?.icon ?? Globe,
            color: FRAMEWORK_META[fw.id]?.color ?? "text-muted-foreground",
          }))];
          setOptions(opts);
        }
      })
      .catch(() => { /* use default auto-detect only */ });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Position the menu below the button
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, [open]);

  // Hide picker entirely if only one framework (no choice to make).
  // This guard MUST come after every hook call — moving it earlier causes
  // React error #310 (rendered more hooks after fetch resolves).
  if (options.length <= 2) return null;

  const selected = options.find((o) => o.id === (value ?? "")) ?? options[0]!;
  const Icon = selected.icon;

  return (
    <div className="relative ml-1">
      <button
        ref={btnRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 h-7 text-[11px] font-medium text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-colors"
        title="Pick framework explicitly, or let the server detect from your prompt"
        disabled={disabled}
      >
        <Icon className={`h-3.5 w-3.5 ${selected.color}`} />
        <span>{selected.label}</span>
        <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map((opt) => {
            const OptIcon = opt.icon;
            const isSelected = opt.id === (value ?? "");
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id || null);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors ${
                  isSelected
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-popover-foreground hover:bg-accent/60"
                }`}
              >
                <OptIcon className={`h-3.5 w-3.5 shrink-0 ${opt.color}`} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
