"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { FileEditor } from "./workspace-knowledge-editor";

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
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading knowledge base...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-6 w-6 text-red-400/60" />
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
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
      <p className="mb-4 text-xs text-muted-foreground">
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
              className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-secondary group"
            >
              <FileText
                className={cn(
                  "h-4 w-4 flex-none mt-0.5",
                  hasContent ? "text-brand-400/70" : "text-muted-foreground"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate font-mono">
                    {file.filename}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-none">
                    {formatDate(file.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{desc}</p>
                {hasContent && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
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
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-brand-500/50 hover:text-brand-400 transition-colors"
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
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-secondary p-4">
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        New Knowledge File
      </label>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. style-guide, api-docs"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        spellCheck={false}
      />
      {isDuplicate && <p className="mt-1 text-xs text-red-400">File already exists.</p>}
      {filename && !isDuplicate && (
        <p className="mt-1 text-xs text-muted-foreground font-mono">{fullFilename}</p>
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
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
