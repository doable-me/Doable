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
    <div className="flex h-full flex-col bg-[#1C1C1C]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700/50 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Version History</h2>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
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
