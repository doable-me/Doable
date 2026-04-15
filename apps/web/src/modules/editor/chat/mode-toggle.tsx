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
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
      {modes.map(({ id, label, icon: Icon, desc }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            mode === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={desc}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
