import {
  File,
  FileCode2,
  FileJson,
  FileText,
  FileType,
  Image,
  Palette,
  Globe,
  Cog,
} from "lucide-react";
import { getStoredTokens } from "@/lib/api";

// ─── Constants ──────────────────────────────────────────────
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
export interface FilesPanelProps {
  projectId: string;
  onClose?: () => void;
}

export interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  node: FileTreeNode;
}

export interface FileInfo {
  name: string;
  path: string;
  type: string;
  size: number | null;
  lastModified: string | null;
}

// ─── API Helpers ────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function apiListFiles(projectId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
  const json = (await res.json()) as { data: string[] };
  return json.data;
}

export async function apiReadFile(
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

export async function apiCreateFile(
  projectId: string,
  filePath: string,
  content: string = ""
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(`Failed to create file (${res.status})`);
}

export async function apiUpdateFile(
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
  if (!res.ok) throw new Error(`Failed to update file (${res.status})`);
}

export async function apiDeleteFile(
  projectId: string,
  filePath: string
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    }
  );
  if (!res.ok) throw new Error(`Failed to delete file (${res.status})`);
}

// ─── File Icon Mapping ──────────────────────────────────────

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
    css: Palette,
    scss: Palette,
    less: Palette,
    html: Globe,
    htm: Globe,
    png: Image,
    jpg: Image,
    jpeg: Image,
    svg: Image,
    gif: Image,
    webp: Image,
    ico: Image,
    yaml: Cog,
    yml: Cog,
    toml: Cog,
    env: Cog,
    gitignore: Cog,
    d: FileType,
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
    htm: "text-orange-400",
    md: "text-zinc-400",
    txt: "text-zinc-400",
    png: "text-green-400",
    jpg: "text-green-400",
    svg: "text-green-400",
  };
  return colorMap[ext] ?? "text-zinc-500";
}

// ─── Build File Tree ────────────────────────────────────────

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

// ─── File extension to type label ───────────────────────────

export function getFileTypeLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const typeMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript JSX",
    js: "JavaScript",
    jsx: "JavaScript JSX",
    json: "JSON",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    html: "HTML",
    htm: "HTML",
    md: "Markdown",
    txt: "Plain Text",
    svg: "SVG",
    png: "PNG Image",
    jpg: "JPEG Image",
    gif: "GIF Image",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    env: "Environment",
  };
  return typeMap[ext] ?? (ext.toUpperCase() || "File");
}

// ─── Filter tree recursively ────────────────────────────────

export function filterTree(
  nodes: FileTreeNode[],
  query: string
): FileTreeNode[] {
  const q = query.toLowerCase();
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        result.push(node);
      }
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

// ─── Collect all folder paths from a tree ───────────────────

export function collectFolderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectFolderPaths(node.children));
      }
    }
  }
  return paths;
}

// ─── Default content templates ──────────────────────────────

export function getDefaultContent(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx":
      return `export default function Component() {\n  return (\n    <div>\n      <h1>New Component</h1>\n    </div>\n  );\n}\n`;
    case "ts":
      return `// ${filePath.split("/").pop()}\n\nexport {};\n`;
    case "jsx":
      return `export default function Component() {\n  return (\n    <div>\n      <h1>New Component</h1>\n    </div>\n  );\n}\n`;
    case "js":
      return `// ${filePath.split("/").pop()}\n\n`;
    case "css":
      return `/* ${filePath.split("/").pop()} */\n`;
    case "json":
      return `{}\n`;
    case "html":
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n`;
    case "md":
      return `# ${filePath.split("/").pop()?.replace(/\.md$/, "")}\n`;
    default:
      return "";
  }
}
