"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { VersionHistory } from "../sidebar/version-history";
import { useEditorStore } from "../hooks/use-editor-store";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

// ─── Main Component ──────────────────────────────────────────

export function HistoryPanel({ projectId, onClose }: Props) {
  // Ensure editor store has the correct projectId so VersionHistory can use it
  const storeProjectId = useEditorStore((s) => s.projectId);
  const setProjectId = useEditorStore((s) => s.setProjectId);

  useEffect(() => {
    if (storeProjectId !== projectId) {
      setProjectId(projectId);
    }
  }, [projectId, storeProjectId, setProjectId]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Version History</h2>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Version history content */}
      <div className="flex-1 overflow-hidden">
        <VersionHistory />
      </div>
    </div>
  );
}
