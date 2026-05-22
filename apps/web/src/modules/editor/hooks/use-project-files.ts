"use client";

import { useCallback, useEffect } from "react";
import { useEditorStore, type FileNode, type OpenTab } from "./use-editor-store";
import { getStoredTokens } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    css: "css",
    json: "json",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    sql: "sql",
    sh: "shell",
    env: "env",
  };
  return map[ext] ?? "plaintext";
}

export function useProjectFiles(projectId: string | null) {
  const {
    fileTree,
    activeFilePath,
    activeFileContent,
    openTabs,
    setFileTree,
    setActiveFile,
    setActiveFileContent,
    openTab,
    markTabDirty,
  } = useEditorStore();

  /** Build Authorization header from stored tokens */
  const authHeaders = useCallback((): Record<string, string> => {
    const { accessToken } = getStoredTokens();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, []);

  const fetchFileTree = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/files`,
        { headers: authHeaders() }
      );
      if (!response.ok) throw new Error("Failed to fetch file tree");

      const data = await response.json();
      setFileTree(data.data ?? []);
    } catch (err) {
      console.error("Failed to fetch file tree:", err);
    }
  }, [projectId, setFileTree, authHeaders]);

  const readFile = useCallback(
    async (path: string) => {
      if (!projectId) return;

      try {
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(path)}`,
          { headers: authHeaders() }
        );
        if (!response.ok) throw new Error("Failed to read file");

        const data = await response.json();
        const content = data.data?.content ?? "";
        const filename = path.split("/").pop() ?? path;
        const language = detectLanguage(filename);

        setActiveFile(path, content);
        openTab({
          path,
          name: filename,
          language,
          isDirty: false,
        });
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    },
    [projectId, setActiveFile, openTab, authHeaders]
  );

  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (!projectId) return;

      try {
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(path)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ content }),
          }
        );
        if (!response.ok) throw new Error("Failed to save file");
        markTabDirty(path, false);
      } catch (err) {
        console.error("Failed to save file:", err);
      }
    },
    [projectId, markTabDirty, authHeaders]
  );

  const createFile = useCallback(
    async (path: string, content: string = "") => {
      if (!projectId) return;

      try {
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/files`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ path, content }),
          }
        );
        if (!response.ok) throw new Error("Failed to create file");
        await fetchFileTree();
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    },
    [projectId, fetchFileTree, authHeaders]
  );

  const deleteFile = useCallback(
    async (path: string) => {
      if (!projectId) return;

      try {
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(path)}`,
          { method: "DELETE", headers: authHeaders() }
        );
        if (!response.ok) throw new Error("Failed to delete file");
        await fetchFileTree();
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
    },
    [projectId, fetchFileTree, authHeaders]
  );

  // Load file tree on mount
  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  return {
    fileTree,
    activeFilePath,
    activeFileContent,
    openTabs,
    fetchFileTree,
    readFile,
    saveFile,
    createFile,
    deleteFile,
  };
}
