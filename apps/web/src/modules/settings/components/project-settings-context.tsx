"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  Save,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { SectionCard, FILE_ICONS, type ContextFile, type ContextStats } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// CONTEXT FILES TAB
// ═══════════════════════════════════════════════════════════════

export function ContextFilesTab({
  projectId,
  addToast,
}: {
  projectId: string;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFile, setEditingFile] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        data: { files: ContextFile[]; stats: ContextStats };
      }>(`/projects/${projectId}/context`);
      setFiles(res.data.files);
      setStats(res.data.stats);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load context files");
    } finally {
      setLoading(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const handleSave = async (filename: string, content: string) => {
    try {
      await apiFetch(`/projects/${projectId}/context/${filename}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.filename === filename
            ? { ...f, content, updatedAt: new Date().toISOString() }
            : f
        )
      );
      addToast("success", `Saved ${filename}`);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save");
      throw err;
    }
  };

  // If editing a file, show the editor
  const activeFile = files.find((f) => f.filename === editingFile);
  if (activeFile) {
    return (
      <ContextFileEditor
        file={activeFile}
        onSave={(content) => handleSave(activeFile.filename, content)}
        onBack={() => setEditingFile(null)}
        addToast={addToast}
      />
    );
  }

  if (loading) {
    return (
      <SectionCard title="Knowledge (.doable/)">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="h-8 w-8 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Knowledge (.doable/)"
        description="Knowledge files guide the AI's behavior when editing your project. Each file serves a different purpose."
      >
        {/* Token budget */}
        {stats && (
          <div className="mb-5 rounded-lg bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats.totalFiles} files, {stats.estimatedTokens.toLocaleString()} tokens
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  stats.budgetUsedPercent > 80
                    ? "text-amber-600"
                    : "text-muted-foreground"
                )}
              >
                {stats.budgetUsedPercent}% of budget used
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  stats.budgetUsedPercent > 95
                    ? "bg-red-500"
                    : stats.budgetUsedPercent > 80
                      ? "bg-amber-500"
                      : "bg-primary"
                )}
                style={{
                  width: `${Math.min(100, stats.budgetUsedPercent)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        <div className="space-y-2">
          {files.map((file) => {
            const Icon = FILE_ICONS[file.filename] ?? FileText;
            const hasContent = file.content.trim().length > 10;

            return (
              <button
                key={file.filename}
                onClick={() => setEditingFile(file.filename)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 group"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    hasContent ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      hasContent ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {hasContent
                      ? `${file.content.length} characters`
                      : "Empty -- click to edit"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      hasContent ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Refresh */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => void fetchFiles()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Context File Editor ────────────────────────────────────

function ContextFileEditor({
  file,
  onSave,
  onBack,
  addToast,
}: {
  file: ContextFile;
  onSave: (content: string) => Promise<void>;
  onBack: () => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [content, setContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const dirty = content !== file.content;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(file.content);
  }, [file.filename, file.content]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(content);
    } catch {
      // Toast already shown by parent
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void handleSave();
    }
  };

  const Icon = FILE_ICONS[file.filename] ?? FileText;

  return (
    <div className="rounded-xl border" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-md p-1.5 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{file.filename}</span>
          {dirty && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {content.length} chars
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              dirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full bg-background p-4 text-sm font-mono leading-relaxed focus:outline-none resize-none"
        rows={20}
        placeholder="Start writing..."
        spellCheck={false}
      />

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          Last updated:{" "}
          {new Date(file.updatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-muted-foreground">Ctrl+S to save</span>
      </div>
    </div>
  );
}
