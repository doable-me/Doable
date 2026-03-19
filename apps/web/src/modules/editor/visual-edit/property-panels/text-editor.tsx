"use client";

import { Type } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// ─── Component ──────────────────────────────────────────────

export function TextEditor({ value, onChange }: TextEditorProps) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Type className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-300">Text</span>
      </div>

      {/* Content */}
      <div className="px-3 pb-3">
        <label className="mb-1.5 block text-[11px] text-zinc-500">
          Content
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-zinc-700/60 bg-zinc-800/80 px-2.5 py-2 text-[12px] text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all font-mono leading-relaxed"
          placeholder="Element text content..."
        />
      </div>
    </div>
  );
}
