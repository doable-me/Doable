"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { FileTreeNode, ContextMenuState, FileInfo } from "./files-helpers";
import {
  apiListFiles,
  apiReadFile,
  apiCreateFile,
  apiDeleteFile,
  buildFileTree,
  getFileTypeLabel,
  getDefaultContent,
  filterTree,
  collectFolderPaths,
} from "./files-helpers";

export function useFilesPanel(projectId: string) {
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileInfo, setSelectedFileInfo] = useState<FileInfo | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [draggedNode, setDraggedNode] = useState<FileTreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const paths = await apiListFiles(projectId);
      const tree = buildFileTree(paths);
      setFileTree(tree);
      const topFolders = tree.filter((n) => n.type === "folder").map((n) => n.path);
      setExpandedFolders((prev: Set<string>) => new Set([...prev, ...topFolders]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree;
    return filterTree(fileTree, searchQuery.trim());
  }, [fileTree, searchQuery]);

  const displayExpandedFolders = useMemo(() => {
    if (!searchQuery.trim()) return expandedFolders;
    const allFolders = collectFolderPaths(filteredTree);
    return new Set([...expandedFolders, ...allFolders]);
  }, [searchQuery, filteredTree, expandedFolders]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(async (node: FileTreeNode) => {
    if (node.type === "folder") { toggleFolder(node.path); return; }
    setSelectedFile(node.path);
    try {
      const content = await apiReadFile(projectId, node.path);
      const size = new Blob([content]).size;
      setSelectedFileInfo({ name: node.name, path: node.path, type: getFileTypeLabel(node.name), size, lastModified: null });
    } catch {
      setSelectedFileInfo({ name: node.name, path: node.path, type: getFileTypeLabel(node.name), size: null, lastModified: null });
    }
  }, [projectId, toggleFolder]);

  const handleCreateFile = useCallback(async () => {
    const path = newFilePath.trim();
    if (!path) return;
    setOperationLoading(true);
    try {
      await apiCreateFile(projectId, path, getDefaultContent(path));
      await fetchTree();
      setShowNewFileDialog(false);
      setNewFilePath("");
      const parts = path.split("/");
      if (parts.length > 1) {
        const parentPaths: string[] = [];
        for (let i = 1; i < parts.length; i++) parentPaths.push(parts.slice(0, i).join("/"));
        setExpandedFolders((prev: Set<string>) => new Set([...prev, ...parentPaths]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
    } finally { setOperationLoading(false); }
  }, [projectId, newFilePath, fetchTree]);

  const handleCreateFolder = useCallback(async () => {
    const folder = newFolderPath.trim().replace(/\/+$/, "");
    if (!folder) return;
    setOperationLoading(true);
    try {
      await apiCreateFile(projectId, `${folder}/.gitkeep`, "");
      await fetchTree();
      setShowNewFolderDialog(false);
      setNewFolderPath("");
      const parts = folder.split("/");
      const parentPaths: string[] = [];
      for (let i = 1; i <= parts.length; i++) parentPaths.push(parts.slice(0, i).join("/"));
      setExpandedFolders((prev: Set<string>) => new Set([...prev, ...parentPaths]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally { setOperationLoading(false); }
  }, [projectId, newFolderPath, fetchTree]);

  const startRename = useCallback((node: FileTreeNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const oldPath = renamingPath;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = renameValue.trim();
    const newPath = parts.join("/");
    if (newPath === oldPath) { setRenamingPath(null); return; }
    setOperationLoading(true);
    try {
      const content = await apiReadFile(projectId, oldPath);
      await apiCreateFile(projectId, newPath, content);
      await apiDeleteFile(projectId, oldPath);
      await fetchTree();
      if (selectedFile === oldPath) setSelectedFile(newPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename file");
    } finally { setRenamingPath(null); setOperationLoading(false); }
  }, [renamingPath, renameValue, projectId, fetchTree, selectedFile]);

  const handleDelete = useCallback(async (path: string) => {
    setOperationLoading(true);
    try {
      await apiDeleteFile(projectId, path);
      await fetchTree();
      if (selectedFile === path) { setSelectedFile(null); setSelectedFileInfo(null); }
      setShowDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file");
    } finally { setOperationLoading(false); }
  }, [projectId, fetchTree, selectedFile]);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  }, []);

  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, node: FileTreeNode) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedNode(node);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLButtonElement>, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(targetPath);
  }, []);

  const handleDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLButtonElement>, targetFolderPath: string) => {
    e.preventDefault();
    setDropTarget(null);
    if (!draggedNode || draggedNode.type !== "file") { setDraggedNode(null); return; }
    const oldPath = draggedNode.path;
    const newPath = `${targetFolderPath}/${draggedNode.name}`;
    if (newPath === oldPath) { setDraggedNode(null); return; }
    setOperationLoading(true);
    try {
      const content = await apiReadFile(projectId, oldPath);
      await apiCreateFile(projectId, newPath, content);
      await apiDeleteFile(projectId, oldPath);
      await fetchTree();
      if (selectedFile === oldPath) setSelectedFile(newPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move file");
    } finally { setDraggedNode(null); setOperationLoading(false); }
  }, [draggedNode, projectId, fetchTree, selectedFile]);

  const handleContextMenu = useCallback((e: ReactMouseEvent, node: FileTreeNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => { setContextMenu(null); }, []);

  return {
    fileTree, loading, error, setError, searchQuery, setSearchQuery,
    filteredTree, displayExpandedFolders, selectedFile, selectedFileInfo,
    contextMenu, closeContextMenu, handleContextMenu,
    showNewFileDialog, setShowNewFileDialog, showNewFolderDialog, setShowNewFolderDialog,
    showDeleteConfirm, setShowDeleteConfirm,
    newFilePath, setNewFilePath, newFolderPath, setNewFolderPath,
    renamingPath, setRenamingPath, renameValue, setRenameValue, renameInputRef,
    dropTarget, operationLoading,
    fetchTree, handleSelectFile, handleCreateFile, handleCreateFolder,
    startRename, handleRename, handleDelete, handleCopyPath,
    handleDragStart, handleDragOver, handleDragLeave, handleDrop,
  };
}
