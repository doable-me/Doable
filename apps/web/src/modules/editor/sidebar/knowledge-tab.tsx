"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain,
  Save,
  RotateCcw,
  AlertCircle,
  ChevronLeft,
  Plus,
  FileText,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredTokens } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

interface KnowledgeTabProps {
  projectId: string;
  apiBaseUrl?: string;
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

function getAuthHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filename = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const fullFilename = filename.endsWith(".md") ? filename : `${filename}.md`;
  const isValid = filename.length > 0 && !existingFiles.includes(fullFilename);
  const isDuplicate = existingFiles.includes(fullFilename);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) onSubmit(fullFilename);
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-border bg-muted/30">
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        New Knowledge File
      </label>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. style-guide, api-docs"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        spellCheck={false}
      />
      {isDuplicate && (
        <p className="mt-1 text-xs text-destructive">File already exists.</p>
      )}
      {filename && !isDuplicate && (
        <p className="mt-1 text-xs text-muted-foreground font-mono">
          {fullFilename}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={!isValid}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── File List View ─────────────────────────────────────────

function FileListView({
  files,
  loading,
  error,
  onFileClick,
  onAddFile,
  onRetry,
}: {
  files: ContextFile[];
  loading: boolean;
  error: string | null;
  onFileClick: (file: ContextFile) => void;
  onAddFile: () => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading knowledge base...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 px-4">
        <AlertCircle className="h-6 w-6 text-destructive/60" />
        <p className="mt-2 text-xs text-muted-foreground text-center">{error}</p>
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hint */}
      <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground leading-relaxed">
        Context files the AI reads before every interaction. Click to edit.
      </div>

      {/* File list */}
      <div className="px-2 py-1">
        {files.map((file) => {
          const desc = FILE_DESCRIPTIONS[file.filename] ?? "Custom context";
          const hasContent = file.content.trim().length > 0;
          return (
            <button
              key={file.filename}
              onClick={() => onFileClick(file)}
              className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-accent/50 group"
            >
              <FileText
                className={cn(
                  "h-4 w-4 flex-none mt-0.5",
                  hasContent ? "text-primary/70" : "text-muted-foreground/40"
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
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {desc}
                </p>
                {hasContent && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                    {file.content.length} chars
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add button */}
      <div className="px-3 py-2">
        <button
          onClick={onAddFile}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Knowledge File
        </button>
      </div>
    </div>
  );
}

// ─── File Editor View ───────────────────────────────────────

function FileEditorView({
  file,
  projectId,
  apiBaseUrl,
  onBack,
}: {
  file: ContextFile;
  projectId: string;
  apiBaseUrl: string;
  onBack: () => void;
}) {
  const [content, setContent] = useState(file.content);
  const [originalContent, setOriginalContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = content !== originalContent;

  // Save
  const save = useCallback(
    async (contentToSave: string) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `${apiBaseUrl}/projects/${projectId}/context/${file.filename}`,
          {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ content: contentToSave }),
          }
        );
        if (!res.ok) throw new Error("Failed to save");
        setOriginalContent(contentToSave);
        setLastSaved(new Date().toLocaleTimeString());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [projectId, apiBaseUrl, file.filename]
  );

  // Auto-save
  const handleChange = (newContent: string) => {
    setContent(newContent);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (newContent !== originalContent) {
        void save(newContent);
      }
    }, AUTO_SAVE_DELAY);
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void save(content);
  };

  const handleReset = () => {
    setContent(originalContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleManualSave();
    }
  };

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Back to file list"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate font-mono">
            {file.filename}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {FILE_DESCRIPTIONS[file.filename] ?? "Custom context file"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {dirty && (
            <span className="text-[10px] text-amber-500 mr-1">unsaved</span>
          )}
          <button
            onClick={handleReset}
            disabled={!dirty}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              dirty
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed"
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
              dirty
                ? "hover:bg-muted text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
            title="Save (Ctrl+S)"
          >
            <Save className={cn("h-3.5 w-3.5", saving && "animate-pulse")} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-400 bg-red-950/20 border-b border-border">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full h-full p-4 bg-background text-sm font-mono leading-relaxed resize-none focus:outline-none"
          placeholder={`# ${file.filename.replace(".md", "")}\n\nStart typing...`}
          spellCheck={false}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border text-[11px] text-muted-foreground">
        <span>{content.length.toLocaleString()} chars</span>
        <div className="flex items-center gap-2">
          {saving && <span className="text-primary">Saving...</span>}
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

// ─── Main Component ─────────────────────────────────────────

export const KnowledgeTab = ({
  projectId,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
}: KnowledgeTabProps) => {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<ContextFile | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Fetch all context files
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/projects/${projectId}/context`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) throw new Error("Failed to load context files");
      const json = await res.json() as { data: { files: ContextFile[] } };
      setFiles(json.data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBaseUrl]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  // Create new file
  const handleCreateFile = useCallback(
    async (filename: string) => {
      setShowAddDialog(false);
      try {
        const res = await fetch(
          `${apiBaseUrl}/projects/${projectId}/context/${filename}`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ content: "" }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Failed to create file" }));
          throw new Error(body.error ?? "Failed to create file");
        }
        const json = await res.json() as { data: ContextFile };
        // Add to list and open immediately
        setFiles((prev) => [...prev, json.data].sort((a, b) => a.filename.localeCompare(b.filename)));
        setActiveFile(json.data);
      } catch (err) {
        console.error("Failed to create context file:", err);
      }
    },
    [projectId, apiBaseUrl]
  );

  // Open file for editing — re-fetch latest content
  const handleFileClick = useCallback(
    async (file: ContextFile) => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/projects/${projectId}/context/${file.filename}`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const json = await res.json() as { data: ContextFile };
          setActiveFile(json.data);
        } else {
          // Fall back to cached version
          setActiveFile(file);
        }
      } catch {
        setActiveFile(file);
      }
    },
    [projectId, apiBaseUrl]
  );

  // Back from editor — refresh list to pick up saves
  const handleBack = useCallback(() => {
    setActiveFile(null);
    void fetchFiles();
  }, [fetchFiles]);

  // If editing a file, show the editor
  if (activeFile) {
    return (
      <FileEditorView
        file={activeFile}
        projectId={projectId}
        apiBaseUrl={apiBaseUrl}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Project Knowledge
          </h3>
        </div>
        <button
          onClick={() => setShowAddDialog(!showAddDialog)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>

      {/* Add File Dialog */}
      {showAddDialog && (
        <AddFileDialog
          onSubmit={handleCreateFile}
          onCancel={() => setShowAddDialog(false)}
          existingFiles={files.map((f) => f.filename)}
        />
      )}

      {/* File list / loading / error */}
      <FileListView
        files={files}
        loading={loading}
        error={error}
        onFileClick={handleFileClick}
        onAddFile={() => setShowAddDialog(true)}
        onRetry={fetchFiles}
      />
    </div>
  );
};
