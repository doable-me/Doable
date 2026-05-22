import { getStoredTokens } from "@/lib/api";
import {
  File,
  FileCode2,
  FileJson,
  FileText,
  Image,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ───────────────────────────────────────────────────
export interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

export interface OpenTab {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
  content: string;
}

// ─── API Helpers ─────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function fetchFileList(projectId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
  const json = (await res.json()) as { data: string[] };
  return json.data;
}

export async function fetchFileContent(
  projectId: string,
  filePath: string
): Promise<string> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
  const json = (await res.json()) as {
    data: { path: string; content: string };
  };
  return json.data.content;
}

export async function saveFileContent(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(`Failed to save file (${res.status})`);
}

// ─── File Tree Builder ───────────────────────────────────────

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      const existing = currentLevel.find((n) => n.name === part);
      if (existing) {
        if (!isLast && existing.children) {
          currentLevel = existing.children;
        }
      } else {
        const node: FileTreeNode = {
          name: part,
          type: isLast ? "file" : "folder",
          path: currentPath,
          children: isLast ? undefined : [],
        };
        currentLevel.push(node);
        if (!isLast && node.children) {
          currentLevel = node.children;
        }
      }
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  };

  return sortNodes(root);
}

// ─── Language Detection ──────────────────────────────────────

export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    env: "plaintext",
    xml: "xml",
    svg: "xml",
    txt: "plaintext",
    gitignore: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

// ─── File Icon Mapping ───────────────────────────────────────

export function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap: Record<string, typeof File> = {
    ts: FileCode2,
    tsx: FileCode2,
    js: FileCode2,
    jsx: FileCode2,
    json: FileJson,
    md: FileText,
    txt: FileText,
    png: Image,
    jpg: Image,
    jpeg: Image,
    svg: Image,
    gif: Image,
  };
  return iconMap[ext] ?? File;
}

export function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    json: "text-yellow-300",
    css: "text-brand-400",
    scss: "text-pink-400",
    html: "text-orange-400",
    md: "text-zinc-400",
    svg: "text-green-400",
    png: "text-green-400",
    jpg: "text-green-400",
  };
  return colorMap[ext] ?? "text-zinc-500";
}

export const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 20,
  padding: { top: 8, bottom: 8 },
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  lineNumbers: "on" as const,
  renderLineHighlight: "line" as const,
  cursorBlinking: "smooth" as const,
  smoothScrolling: true,
  contextmenu: true,
  folding: true,
  foldingHighlight: true,
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    verticalSliderSize: 8,
  },
};
