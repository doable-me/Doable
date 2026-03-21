"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Rocket,
  Wrench,
  Activity,
  Zap,
  Palette,
  Database,
  Building2,
  Globe,
  Bot,
  ChevronRight,
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

type Scope = "project" | "workspace" | "user";

interface ContextPanelProps {
  projectId: string;
  workspaceId?: string;
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
  "boot.md": Rocket,
  "tools.md": Wrench,
  "heartbeat.md": Activity,
  "bootstrap.md": Zap,
  "design-system.md": Palette,
  "schema.md": Database,
  "architecture.md": Building2,
  "api-reference.md": Globe,
  "agents.md": Bot,
};

// ─── Category Definitions ───────────────────────────────────

interface Category {
  key: string;
  label: string;
  filenames: string[];
}

const CATEGORIES: Category[] = [
  {
    key: "core",
    label: "Core",
    filenames: [
      "identity.md",
      "soul.md",
      "user.md",
      "instructions.md",
      "knowledge.md",
      "plan.md",
      "memory.md",
    ],
  },
  {
    key: "session",
    label: "Session",
    filenames: ["boot.md", "tools.md", "heartbeat.md", "bootstrap.md"],
  },
  {
    key: "architecture",
    label: "Architecture",
    filenames: [
      "design-system.md",
      "schema.md",
      "architecture.md",
      "api-reference.md",
    ],
  },
  {
    key: "agents",
    label: "Agents",
    filenames: ["agents.md"],
  },
];

// ─── Scope Tab Config ───────────────────────────────────────

const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "workspace", label: "Workspace" },
  { key: "user", label: "User" },
];

// ─── Helpers ────────────────────────────────────────────────

function groupFilesByCategory(
  files: ContextFile[]
): { category: Category | null; files: ContextFile[] }[] {
  const grouped: { category: Category | null; files: ContextFile[] }[] = [];
  const placed = new Set<string>();

  for (const cat of CATEGORIES) {
    const matched = files.filter(
      (f) => cat.filenames.includes(f.filename) && !placed.has(f.filename)
    );
    if (matched.length > 0) {
      // Sort by the order defined in the category
      matched.sort(
        (a, b) =>
          cat.filenames.indexOf(a.filename) -
          cat.filenames.indexOf(b.filename)
      );
      grouped.push({ category: cat, files: matched });
      matched.forEach((f) => placed.add(f.filename));
    }
  }

  // Custom files — anything not in a known category
  const custom = files.filter((f) => !placed.has(f.filename));
  if (custom.length > 0) {
    grouped.push({
      category: { key: "custom", label: "Custom", filenames: [] },
      files: custom,
    });
  }

  return grouped;
}

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

  const getListUrl = useCallback(() => {
    switch (scope) {
      case "workspace":
        return `${apiBaseUrl}/workspaces/${workspaceId}/context`;
      case "user":
        return `${apiBaseUrl}/workspaces/${workspaceId}/context/user/list`;
      case "project":
      default:
        return `${apiBaseUrl}/projects/${projectId}/context`;
    }
  }, [scope, projectId, workspaceId, apiBaseUrl]);

  const getFileUrl = useCallback(
    (filename: string) => {
      switch (scope) {
        case "workspace":
          return `${apiBaseUrl}/workspaces/${workspaceId}/context/${filename}`;
        case "user":
          return `${apiBaseUrl}/workspaces/${workspaceId}/context/user/${filename}`;
        case "project":
        default:
          return `${apiBaseUrl}/projects/${projectId}/context/${filename}`;
      }
    },
    [scope, projectId, workspaceId, apiBaseUrl]
  );

  // ─── Data fetching ────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getListUrl(), { credentials: "include" });
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
  }, [getListUrl]);

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
      const res = await fetch(getFileUrl(filename), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
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
    [getFileUrl]
  );

  const handleCreate = useCallback(async () => {
    const name = prompt("Context file name (e.g., api-notes.md):");
    if (!name || !name.endsWith(".md")) return;

    const res = await fetch(getFileUrl(name), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: `# ${name.replace(".md", "")}\n\n` }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error: string };
      alert(json.error);
      return;
    }
    await fetchFiles();
    setSelectedFile(name);
  }, [getFileUrl, fetchFiles]);

  const handleDelete = useCallback(
    async (filename: string) => {
      if (!confirm(`Delete ${filename}? Default files will be reset.`)) return;

      await fetch(getFileUrl(filename), {
        method: "DELETE",
        credentials: "include",
      });
      setSelectedFile(null);
      await fetchFiles();
    },
    [getFileUrl, fetchFiles]
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
