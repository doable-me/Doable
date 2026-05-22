"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { FileText, Plus, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextEditor } from "./context-editor";
import {
  type ContextFile,
  type ContextStats,
  type Scope,
  type ContextPanelProps,
  FILE_ICONS,
  SCOPE_TABS,
  groupFilesByCategory,
} from "./context-panel-types";

// ─── Component ──────────────────────────────────────────────

export const ContextPanel = ({
  projectId,
  workspaceId,
  apiBaseUrl = "/api",
}: ContextPanelProps) => {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("project");
  const [collapsedCategories, setCollapsedCategories] = useState<
    Set<string>
  >(new Set());

  const availableTabs = useMemo(() => {
    if (!workspaceId) return SCOPE_TABS.filter((t) => t.key === "project");
    return SCOPE_TABS;
  }, [workspaceId]);

  // ─── Endpoint builders ────────────────────────────────

  const getListPath = useCallback(() => {
    switch (scope) {
      case "workspace":
        return `/workspaces/${workspaceId}/context`;
      case "user":
        return `/workspaces/${workspaceId}/context/user/list`;
      case "project":
      default:
        return `/projects/${projectId}/context`;
    }
  }, [scope, projectId, workspaceId]);

  const getFilePath = useCallback(
    (filename: string) => {
      switch (scope) {
        case "workspace":
          return `/workspaces/${workspaceId}/context/${filename}`;
        case "user":
          return `/workspaces/${workspaceId}/context/user/${filename}`;
        case "project":
        default:
          return `/projects/${projectId}/context/${filename}`;
      }
    },
    [scope, projectId, workspaceId]
  );

  // ─── Data fetching ────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ data: { files: ContextFile[]; stats: ContextStats } }>(getListPath());
      setFiles(json.data.files);
      setStats(json.data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load context files");
    } finally {
      setLoading(false);
    }
  }, [getListPath]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  // Reset selection when scope changes
  useEffect(() => {
    setSelectedFile(null);
  }, [scope]);

  // ─── Handlers ─────────────────────────────────────────

  const handleSave = useCallback(
    async (filename: string, content: string) => {
      await apiFetch(getFilePath(filename), {
        method: "PUT",
        body: JSON.stringify({ content }),
      });

      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.filename === filename
            ? { ...f, content, updatedAt: new Date().toISOString() }
            : f
        )
      );
    },
    [getFilePath]
  );

  const handleCreate = useCallback(async () => {
    const name = prompt("Context file name (e.g., api-notes.md):");
    if (!name || !name.endsWith(".md")) return;

    try {
      await apiFetch(getFilePath(name), {
        method: "POST",
        body: JSON.stringify({ content: `# ${name.replace(".md", "")}\n\n` }),
      });
      await fetchFiles();
      setSelectedFile(name);
    } catch {
      // Create failed
    }
  }, [getFilePath, fetchFiles]);

  const handleDelete = useCallback(
    async (filename: string) => {
      if (!confirm(`Delete ${filename}? Default files will be reset.`)) return;

      await apiFetch(getFilePath(filename), { method: "DELETE" });
      setSelectedFile(null);
      await fetchFiles();
    },
    [getFilePath, fetchFiles]
  );

  const toggleCategory = useCallback((categoryKey: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  }, []);

  // ─── Grouped files ────────────────────────────────────

  const groupedFiles = useMemo(
    () => groupFilesByCategory(files),
    [files]
  );

  // ─── Selected file view ───────────────────────────────

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

  // ─── Scope label ──────────────────────────────────────

  const scopeLabel =
    scope === "project"
      ? "Project Context"
      : scope === "workspace"
        ? "Workspace Context"
        : "User Context";

  // ─── File list view ───────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Scope tabs */}
      {availableTabs.length > 1 && (
        <div className="flex items-center gap-0.5 px-3 pt-3 pb-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setScope(tab.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                scope === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">{scopeLabel}</h3>
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

      {/* File list — grouped by category */}
      <div className="flex-1 overflow-auto">
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {groupedFiles.map(({ category, files: catFiles }) => {
              const catKey = category?.key ?? "uncategorized";
              const isCollapsed = collapsedCategories.has(catKey);

              return (
                <div key={catKey}>
                  {/* Category header */}
                  {category && (
                    <button
                      onClick={() => toggleCategory(catKey)}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform",
                          !isCollapsed && "rotate-90"
                        )}
                      />
                      <span>{category.label}</span>
                      <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">
                        ({catFiles.length})
                      </span>
                    </button>
                  )}

                  {/* File items */}
                  {!isCollapsed && (
                    <div className="space-y-0.5">
                      {catFiles.map((file) => {
                        const Icon =
                          FILE_ICONS[file.filename] ?? FileText;
                        const hasContent =
                          file.content.trim().length > 50;

                        return (
                          <button
                            key={file.filename}
                            onClick={() =>
                              setSelectedFile(file.filename)
                            }
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
                                hasContent
                                  ? "bg-emerald-500"
                                  : "bg-muted-foreground/30"
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
