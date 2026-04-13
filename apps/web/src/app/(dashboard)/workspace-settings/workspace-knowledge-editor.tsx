"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronLeft,
  Save,
  RotateCcw,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ─── Types & Constants ──────────────────────────────────────

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

const AUTO_SAVE_DELAY = 2500;

const FILE_DESCRIPTIONS: Record<string, string> = {
  "knowledge.md": "Tech stack, conventions, domain terms",
  "instructions.md": "Rules for the AI to follow",
  "identity.md": "Brand voice and personality",
  "soul.md": "Core values and mission",
  "memory.md": "Persistent facts and preferences",
  "user.md": "User context and background",
  "plan.md": "Project roadmap and milestones",
};

// ─── File Editor ────────────────────────────────────────────

export function FileEditor({
  file,
  workspaceId,
  onBack,
}: {
  file: ContextFile;
  workspaceId: string;
  onBack: () => void;
}) {
  const [content, setContent] = useState(file.content);
  const [originalContent, setOriginalContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = content !== originalContent;

  const save = useCallback(async (contentToSave: string) => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/context/${file.filename}`, {
        method: "PUT",
        body: JSON.stringify({ content: contentToSave }),
      });
      setOriginalContent(contentToSave);
      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [workspaceId, file.filename]);

  const handleChange = (newContent: string) => {
    setContent(newContent);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (newContent !== originalContent) void save(newContent);
    }, AUTO_SAVE_DELAY);
  };

  useEffect(() => {
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, []);

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void save(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleManualSave();
    }
  };

  return (
    <div className="flex flex-col" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Back to file list"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200 font-mono">{file.filename}</h3>
          <p className="text-[11px] text-zinc-500">
            {FILE_DESCRIPTIONS[file.filename] ?? "Custom context file"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {dirty && <span className="text-[10px] text-amber-400 mr-1">unsaved</span>}
          <button
            onClick={() => setContent(originalContent)}
            disabled={!dirty}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty ? "hover:bg-zinc-800 text-zinc-300" : "text-zinc-700 cursor-not-allowed"
            )}
            title="Revert changes"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleManualSave}
            disabled={!dirty || saving}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty ? "hover:bg-zinc-800 text-zinc-300" : "text-zinc-700 cursor-not-allowed"
            )}
            title="Save (Ctrl+S)"
          >
            <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs text-red-400 bg-red-950/20 rounded-lg border border-red-900/30">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full min-h-[400px] rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm font-mono leading-relaxed text-zinc-200 placeholder:text-zinc-600 resize-y focus:outline-none focus:ring-1 focus:ring-brand-500"
        placeholder={`# ${file.filename.replace(".md", "")}\n\nStart typing...`}
        spellCheck={false}
      />

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-[11px] text-zinc-600">
        <span>{content.length.toLocaleString()} chars</span>
        <div className="flex items-center gap-2">
          {saving && <span className="text-brand-400">Saving...</span>}
          {lastSaved && !saving && (
            <span className="flex items-center gap-1">
              <Check className="h-2.5 w-2.5 text-green-500" />
              Saved {lastSaved}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
