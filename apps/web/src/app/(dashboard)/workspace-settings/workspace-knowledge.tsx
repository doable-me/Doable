"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  FileText,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Save,
  RotateCcw,
  Check,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

interface WorkspaceKnowledgePanelProps {
  workspaceId: string;
}

// ─── Constants ──────────────────────────────────────────────

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

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

// ─── Main Component ─────────────────────────────────────────

export function WorkspaceKnowledgePanel({ workspaceId }: WorkspaceKnowledgePanelProps) {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<ContextFile | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { files: ContextFile[] } }>(
        `/workspaces/${workspaceId}/context`
      );
      setFiles(res.data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge files");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchFiles(); }, [fetchFiles]);

  const handleCreateFile = useCallback(async (filename: string) => {
    setShowAddDialog(false);
    try {
      await apiFetch(`/workspaces/${workspaceId}/context/${filename}`, {
        method: "PUT",
        body: JSON.stringify({ content: "" }),
      });
      await fetchFiles();
      // Open the new file
      setActiveFile({ filename, content: "", updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  }, [workspaceId, fetchFiles]);

  if (activeFile) {
    return (
      <FileEditor
        file={activeFile}
        workspaceId={workspaceId}
        onBack={() => { setActiveFile(null); void fetchFiles(); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading knowledge base...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-6 w-6 text-red-400/60" />
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
        <button
          onClick={fetchFiles}
          className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Hint */}
      <p className="mb-4 text-xs text-zinc-500">
        These files are read by the AI before every interaction in this workspace. Click a file to edit it.
      </p>

      {/* Add file dialog */}
      {showAddDialog && (
        <AddFileDialog
          onSubmit={handleCreateFile}
          onCancel={() => setShowAddDialog(false)}
          existingFiles={files.map((f) => f.filename)}
        />
      )}

      {/* File list */}
      <div className="space-y-1">
        {files.map((file) => {
          const desc = FILE_DESCRIPTIONS[file.filename] ?? "Custom context";
          const hasContent = file.content.trim().length > 0;
          return (
            <button
              key={file.filename}
              onClick={() => setActiveFile(file)}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-zinc-800/60 group"
            >
              <FileText
                className={cn(
                  "h-4 w-4 flex-none mt-0.5",
                  hasContent ? "text-brand-400/70" : "text-zinc-600"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-200 truncate font-mono">
                    {file.filename}
                  </span>
                  <span className="text-[10px] text-zinc-600 flex-none">
                    {formatDate(file.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 truncate">{desc}</p>
                {hasContent && (
                  <p className="mt-0.5 text-[10px] text-zinc-600">
                    {file.content.length} chars
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add button */}
      <div className="mt-4">
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 py-2.5 text-xs text-zinc-500 hover:border-brand-500/50 hover:text-brand-400 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Knowledge File
        </button>
      </div>
    </div>
  );
}

// ─── Add File Dialog ────────────────────────────────────────

function AddFileDialog({
  onSubmit,
  onCancel,
  existingFiles,
}: {
  onSubmit: (filename: string) => void;
  onCancel: () => void;
  existingFiles: string[];
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filename = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const fullFilename = filename.endsWith(".md") ? filename : `${filename}.md`;
  const isValid = filename.length > 0 && !existingFiles.includes(fullFilename);
  const isDuplicate = existingFiles.includes(fullFilename);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) onSubmit(fullFilename);
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/60 p-4">
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
        New Knowledge File
      </label>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. style-guide, api-docs"
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        spellCheck={false}
      />
      {isDuplicate && <p className="mt-1 text-xs text-red-400">File already exists.</p>}
      {filename && !isDuplicate && (
        <p className="mt-1 text-xs text-zinc-500 font-mono">{fullFilename}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!isValid}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── File Editor ────────────────────────────────────────────

function FileEditor({
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
