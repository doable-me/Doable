"use client";

import { useEditorStore, type EditorMode } from "../hooks/use-editor-store";
import { Hammer, Target } from "lucide-react";

const modes: { id: EditorMode; label: string; icon: typeof Hammer; desc: string }[] = [
  { id: "plan", label: "Strategize", icon: Target, desc: "AI helps you plan, then does the work" },
  { id: "agent", label: "Work", icon: Hammer, desc: "AI writes code directly" },
];

export function ModeToggle() {
  const { mode, setMode } = useEditorStore();

  return (
    <div className="flex shrink-0 items-center gap-0 rounded-full border border-border bg-muted p-0.5">
      {modes.map(({ id, label, icon: Icon, desc }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
            mode === id
              ? "bg-brand-500/20 text-brand-700 dark:text-brand-300 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={desc}
        >
          <Icon className={`h-3 w-3 ${mode === id ? "text-brand-600 dark:text-brand-400" : ""}`} />
          {label}
        </button>
      ))}
    </div>
  );
}
