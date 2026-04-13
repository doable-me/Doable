import { useState, useEffect, useMemo, useCallback } from "react";
import {
  type FileTreeNode,
  type OpenTab,
  fetchFileList,
  fetchFileContent,
  saveFileContent,
  buildFileTree,
  detectLanguage,
} from "./code-panel-utils";

export function useCodePanel(projectId: string) {
  // File tree state
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // File content loading
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Read-only mode (free tier)
  const [readOnly] = useState(true);

  // Active tab reference
  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath) ?? null,
    [openTabs, activeTabPath]
  );

  // ─── Load file tree ──────────────────────────────────────────

  const loadFileTree = useCallback(async () => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const paths = await fetchFileList(projectId);
      const tree = buildFileTree(paths);
      setFileTree(tree);
      // Auto-expand top-level folders
      const topFolders = tree
        .filter((n) => n.type === "folder")
        .map((n) => n.path);
      setExpandedFolders((prev) => new Set([...prev, ...topFolders]));
    } catch (err) {
      setFileTreeError(
        err instanceof Error ? err.message : "Failed to load files"
      );
    } finally {
      setFileTreeLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // ─── Open file in tab ────────────────────────────────────────

  const openFile = useCallback(
    async (filePath: string) => {
      // If already open, just activate
      const existing = openTabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveTabPath(filePath);
        return;
      }

      setFileLoading(true);
      setFileError(null);
      try {
        const content = await fetchFileContent(projectId, filePath);
        const name = filePath.split("/").pop() ?? filePath;
        const language = detectLanguage(name);
        const newTab: OpenTab = {
          path: filePath,
          name,
          language,
          isDirty: false,
          content,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(filePath);
      } catch (err) {
        setFileError(
          err instanceof Error ? err.message : "Failed to load file"
        );
      } finally {
        setFileLoading(false);
      }
    },
    [projectId, openTabs]
  );

  // ─── Close tab ───────────────────────────────────────────────

  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => prev.filter((t) => t.path !== path));
      if (activeTabPath === path) {
        setActiveTabPath((prev) => {
          const remaining = openTabs.filter((t) => t.path !== path);
          return remaining.length > 0
            ? remaining[remaining.length - 1]!.path
            : null;
        });
      }
    },
    [activeTabPath, openTabs]
  );

  // ─── Handle editor content change ───────────────────────────

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabPath || readOnly) return;
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTabPath
            ? { ...t, content: value ?? "", isDirty: true }
            : t
        )
      );
    },
    [activeTabPath, readOnly]
  );

  // ─── Save file (Ctrl+S) ─────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty || readOnly) return;
    try {
      await saveFileContent(projectId, activeTab.path, activeTab.content);
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab.path ? { ...t, isDirty: false } : t
        )
      );
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [activeTab, projectId, readOnly]);

  // ─── Keyboard shortcut handler ───────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // ─── Copy file content ───────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!activeTab) return;
    try {
      await navigator.clipboard.writeText(activeTab.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [activeTab]);

  // ─── Download file ───────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!activeTab) return;
    const blob = new Blob([activeTab.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeTab.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeTab]);

  // ─── Toggle folder ──────────────────────────────────────────

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return {
    fileTree,
    fileTreeLoading,
    fileTreeError,
    expandedFolders,
    searchQuery,
    setSearchQuery,
    openTabs,
    activeTabPath,
    setActiveTabPath,
    fileLoading,
    fileError,
    copied,
    readOnly,
    activeTab,
    loadFileTree,
    openFile,
    closeTab,
    handleEditorChange,
    handleCopy,
    handleDownload,
    toggleFolder,
  };
}
