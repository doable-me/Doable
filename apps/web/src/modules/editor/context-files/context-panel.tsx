"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  RefreshCw,
  BookOpen,
  Brain,
  Lightbulb,
  Heart,
  Clock,
  User,
  Map,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextEditor } from "./context-editor";

// ─── Types ──────────────────────────────────────────────────

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

interface ContextStats {
  totalFiles: number;
  totalChars: number;
  estimatedTokens: number;
  budgetUsedPercent: number;
}

interface ContextPanelProps {
  projectId: string;
  apiBaseUrl?: string;
}

// ─── Icon Map ───────────────────────────────────────────────

const FILE_ICONS: Record<string, typeof FileText> = {
  "identity.md": BookOpen,
  "knowledge.md": Brain,
  "instructions.md": Lightbulb,
  "soul.md": Heart,
  "memory.md": Clock,
  "user.md": User,
  "plan.md": Map,
};

// ─── Component ──────────────────────────────────────────────

export const ContextPanel = ({
  projectId,
  apiBaseUrl = "/api",
}: ContextPanelProps) => {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBaseUrl}/projects/${projectId}/context`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load context files");
      const json = (await res.json()) as {
        data: { files: ContextFile[]; stats: ContextStats };
      };
      setFiles(json.data.files);
      setStats(json.data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBaseUrl]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const handleSave = useCallback(
    async (filename: string, content: string) => {
      const res = await fetch(
        `${apiBaseUrl}/projects/${projectId}/context/${filename}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) throw new Error("Failed to save");

      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.filename === filename
            ? { ...f, content, updatedAt: new Date().toISOString() }
            : f
        )
      );
    },
    [projectId, apiBaseUrl]
  );

  const handleCreate = useCallback(async () => {
    const name = prompt("Context file name (e.g., api-notes.md):");
    if (!name || !name.endsWith(".md")) return;

    const res = await fetch(
      `${apiBaseUrl}/projects/${projectId}/context/${name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: `# ${name.replace(".md", "")}\n\n` }),
      }
    );
    if (!res.ok) {
      const json = (await res.json()) as { error: string };
      alert(json.error);
      return;
    }
    await fetchFiles();
    setSelectedFile(name);
  }, [projectId, apiBaseUrl, fetchFiles]);

  const handleDelete = useCallback(
    async (filename: string) => {
      if (!confirm(`Delete ${filename}? Default files will be reset.`)) return;

      await fetch(
        `${apiBaseUrl}/projects/${projectId}/context/${filename}`,
        { method: "DELETE", credentials: "include" }
      );
      setSelectedFile(null);
      await fetchFiles();
    },
    [projectId, apiBaseUrl, fetchFiles]
  );

  // ─── Selected file view ─────────────────────────────────

  const activeFile = files.find((f) => f.filename === selectedFile);
  if (activeFile) {
    return (
      <ContextEditor
        file={activeFile}
        onSave={(content) => handleSave(activeFile.filename, content)}
        onBack={() => setSelectedFile(null)}
        onDelete={() => handleDelete(activeFile.filename)}
      />
    );
  }

  // ─── File list view ─────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Project Context</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void fetchFiles()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => void handleCreate()}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="New file"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Token budget bar */}
      {stats && (
        <div className="px-4 py-2 border-b">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{stats.estimatedTokens.toLocaleString()} tokens</span>
            <span>{stats.budgetUsedPercent}% of budget</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                stats.budgetUsedPercent > 80
                  ? "bg-amber-500"
                  : stats.budgetUsedPercent > 95
                    ? "bg-red-500"
                    : "bg-primary"
              )}
              style={{ width: `${Math.min(100, stats.budgetUsedPercent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {files.map((file) => {
              const Icon = FILE_ICONS[file.filename] ?? FileText;
              const hasContent = file.content.trim().length > 50;

              return (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFile(file.filename)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-left hover:bg-muted transition-colors group"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.filename}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {hasContent
                        ? `${file.content.length} chars`
                        : "Empty — click to edit"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      hasContent ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
