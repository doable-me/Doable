"use client";

import { useState, useRef, useCallback, useEffect, memo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getStoredTokens, apiFetch, apiUpdateProject, apiDeleteProject, apiDuplicateProject, apiGetProject, apiGetEffectiveAiConfig, type ApiEffectiveAiConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useAuth } from "@/hooks/use-auth";
import { CollaborationProvider } from "@/modules/collaboration";
import { CollabHeaderItems } from "@/modules/collaboration/components/collab-header-items";
import { CollabActivityOverlay } from "@/modules/collaboration/components/collab-activity-overlay";
import { CollabTeamChatWrapper } from "@/modules/collaboration/components/collab-team-chat-wrapper";
import { CollabPresenceSync } from "@/modules/collaboration/components/collab-presence-sync";
import { FileTabPresenceDots } from "@/modules/collaboration/components/file-tab-presence-dots";
import { CollabFileTabSync } from "@/modules/collaboration/components/collab-file-tab-sync";
import { CollabAiSync } from "@/modules/collaboration/components/collab-ai-sync";
import { CollabChatTyping } from "@/modules/collaboration/components/collab-chat-typing";
import { useImageAttachments, type ImageAttachment } from "@/hooks/use-image-attachments";
import { EditorModelSelector, type ModelOption } from "@/modules/ai-settings/components/editor-model-selector";
import {
  ArrowUp,
  ArrowLeft,
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  ExternalLink,
  Globe,
  MessageSquare,
  Code2,
  UserPlus,
  Sparkles,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  User,
  Pencil,
  Check,
  Loader2,
  AlertCircle,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  MoreHorizontal,
  Wrench,
  Bookmark,
  BookmarkCheck,
  Clock,
  PanelLeftClose,
  Palette,
  Cloud,
  BarChart3,
  Github,
  Zap,
  Plus,
  Mic,
  X,
  Settings,
  Download,
  CopyPlus,
  Trash2,
  Link,
  Keyboard,
  Eye,
  EyeOff,
  Code,
  Maximize2,
  Minimize2,
  CheckCircle2,
  XCircle,
  Rocket,
  Circle,
  Map,
  Lock,
  FileCode2,
  Pin,
  PinOff,
  Shield,
  Gauge,
  Square,
  ListChecks,
  Undo2,
  Bot,
  ClipboardList,
  Plug,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { MonacoEditorWrapperProps } from "@/modules/editor/code-editor/monaco-editor-wrapper";
import { CollaborativeMonacoWrapper } from "@/modules/editor/code-editor/collaborative-monaco-wrapper";
import { useVisualEdit } from "@/modules/editor/visual-edit/use-visual-edit";
import { VisualEditToolbar } from "@/modules/editor/visual-edit/visual-edit-toolbar";

// ─── Dynamically import Monaco (browser-only) ───────────────
const MonacoEditorWrapper = dynamic<MonacoEditorWrapperProps>(
  () =>
    import("@/modules/editor/code-editor/monaco-editor-wrapper").then(
      (mod) => mod.MonacoEditorWrapper,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-brand-400" />
          <span className="text-xs text-zinc-500">Loading editor...</span>
        </div>
      </div>
    ),
  },
);

// ─── Dynamic panel imports ──────────────────────────────────
const CodePanel = dynamic(() => import("@/modules/editor/panels/code-panel").then(m => ({ default: m.CodePanel })), { ssr: false });
const DesignPanel = dynamic(() => import("@/modules/editor/panels/design-panel").then(m => ({ default: m.DesignPanel })), { ssr: false });
const FilesPanel = dynamic(() => import("@/modules/editor/panels/files-panel").then(m => ({ default: m.FilesPanel })), { ssr: false });
const CloudPanel = dynamic(() => import("@/modules/editor/panels/cloud-panel").then(m => ({ default: m.CloudPanel })), { ssr: false });
const AnalyticsPanel = dynamic(() => import("@/modules/editor/panels/analytics-panel").then(m => ({ default: m.AnalyticsPanel })), { ssr: false });
const SecurityPanel = dynamic(() => import("@/modules/editor/panels/security-panel").then(m => ({ default: m.SecurityPanel })), { ssr: false });
const SpeedPanel = dynamic(() => import("@/modules/editor/panels/speed-panel").then(m => ({ default: m.SpeedPanel })), { ssr: false });
const ConnectorsPanel = dynamic(() => import("@/modules/connectors/connectors-panel").then(m => ({ default: m.ConnectorsPanel })), { ssr: false });
const SkillsPanel = dynamic(() => import("@/modules/skills/skills-panel").then(m => ({ default: m.SkillsPanel })), { ssr: false });

// ─── Constants ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
type ActiveTab = "chat" | "code" | "preview" | "history" | "design" | "cloud" | "analytics" | "files" | "security" | "speed" | "connectors" | "skills" | "team";
type ChatMode = "agent" | "plan" | "visual-edit";
type DeviceMode = "desktop" | "tablet" | "mobile";

interface ToolAction {
  id: string;
  toolName: string;
  description: string;
  isExpanded: boolean;
  isBookmarked?: boolean;
  filePath?: string;
  status?: "running" | "completed" | "failed";
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
  toolActions?: ToolAction[];
  feedbackGiven?: "up" | "down" | null;
  suggestions?: string[];  // AI-generated next-step suggestions
  attachments?: { type: string; data: string; name: string }[];
  thinkingContent?: string;
  senderInfo?: { userId: string; displayName: string; color: string; isRemote: boolean };
  liveStatus?: string;
}

type TaskCardTab = "details" | "preview";

interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

type ScaffoldStatus =
  | "idle"
  | "scaffolding"
  | "starting"
  | "ready"
  | "error";

interface OpenFileTab {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
}

// ─── Language detection ─────────────────────────────────────
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

// ─── Autosave delay ─────────────────────────────────────────
const AUTOSAVE_DELAY_MS = 1500;

/** Tabs that render a full panel (replacing the preview pane) */
const PANEL_TABS: ActiveTab[] = ["cloud", "analytics", "files", "security", "speed", "connectors", "skills"];

/** All items available in the triple-dots "More" menu */
interface MoreMenuItem {
  key: ActiveTab;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const MORE_MENU_ITEMS: MoreMenuItem[] = [
  { key: "history", icon: Clock, label: "History" },
  { key: "design", icon: Palette, label: "Design" },
  { key: "cloud", icon: Cloud, label: "Cloud" },
  { key: "analytics", icon: BarChart3, label: "Analytics" },
  { key: "files", icon: FolderOpen, label: "Files" },
  { key: "security", icon: Shield, label: "Security" },
  { key: "speed", icon: Gauge, label: "Speed" },
  { key: "connectors", icon: Plug, label: "Connectors" },
  { key: "skills", icon: Sparkles, label: "Skills" },
];

/** Load pinned toolbar items from localStorage */
function loadPinnedItems(): ActiveTab[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("doable_pinned_toolbar");
    if (stored) return JSON.parse(stored) as ActiveTab[];
  } catch {
    // ignore
  }
  return [];
}

/** Save pinned toolbar items to localStorage */
function savePinnedItems(items: ActiveTab[]) {
  try {
    localStorage.setItem("doable_pinned_toolbar", JSON.stringify(items));
  } catch {
    // ignore
  }
}

// ─── API helpers ────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Convert a relative preview path (e.g. /preview/abc/) to an absolute URL using the API base. */
function toAbsolutePreviewUrl(url: string | null): string | null {
  if (!url) return null;
  // Already absolute — return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Relative path — prepend the API base URL
  return `${API_URL}${url}`;
}

async function scaffoldProject(projectId: string): Promise<string | null> {
  const json = await apiFetch<{ data: { previewUrl?: string | null } }>(`/projects/${projectId}/scaffold`, {
    method: "POST",
  });
  return toAbsolutePreviewUrl(json.data.previewUrl ?? null);
}

async function fetchPreviewUrl(projectId: string): Promise<string | null> {
  const json = await apiFetch<{ data: { url: string | null; running: boolean } }>(`/projects/${projectId}/preview-url`);
  // Return null if the server isn't running yet — caller will retry
  if (!json.data.url || !json.data.running) return null;
  return toAbsolutePreviewUrl(json.data.url);
}

async function fetchFileList(projectId: string): Promise<string[]> {
  const json = await apiFetch<{ data: string[] }>(`/projects/${projectId}/files`);
  return json.data;
}

async function fetchFileContent(
  projectId: string,
  filePath: string,
): Promise<string> {
  const json = await apiFetch<{ data: { path: string; content: string } }>(
    `/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
  );
  return json.data.content;
}

async function saveFileContent(
  projectId: string,
  filePath: string,
  content: string,
): Promise<void> {
  await apiFetch(`/projects/${projectId}/files/${encodeURIComponent(filePath)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

// ─── Build file tree from flat paths ────────────────────────
function buildFileTree(paths: string[]): FileTreeNode[] {
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

  // Sort: folders first, then alphabetical
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

// ─── SSE Chat Helper ────────────────────────────────────────
async function streamChat(
  projectId: string,
  message: string,
  mode: ChatMode,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  onToolCompleted?: (toolName: string, args: Record<string, unknown>) => void,
  onToolStarted?: (toolName: string, args: Record<string, unknown>) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  onStatusChange?: (status: string) => void,
  attachments?: { type: string; data: string; name: string }[],
  modelOverride?: string,
  providerIdOverride?: string | null,
  copilotAccountIdOverride?: string | null,
) {
  let currentToken = getStoredTokens().accessToken;

  const makeRequest = async (token: string | null): Promise<Response> => {
    return fetch(`${API_URL}/projects/${projectId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        content: message,
        mode,
        ...(attachments?.length ? { attachments } : {}),
        ...(modelOverride ? { model: modelOverride } : {}),
        ...(providerIdOverride ? { providerId: providerIdOverride } : {}),
        ...(copilotAccountIdOverride ? { copilotAccountId: copilotAccountIdOverride } : {}),
      }),
      signal,
    });
  };

  let res: Response;
  try {
    res = await makeRequest(currentToken);

    // Auto-refresh token on 401 and retry once
    if (res.status === 401) {
      try {
        const { apiFetch: _af, ...rest } = await import("@/lib/api");
        // Trigger token refresh via apiFetch (it handles refresh internally)
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: getStoredTokens().refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.tokens) {
            const { storeTokens } = await import("@/lib/api");
            storeTokens(data.tokens);
            currentToken = data.tokens.accessToken;
            res = await makeRequest(currentToken);
          }
        }
      } catch {
        // Refresh failed — fall through to error handling
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    onError(
      "Unable to connect to Doable's AI engine. Please check that the API server is running."
    );
    return;
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    onError(
      `Server error (${res.status}): ${errorText || "Something went wrong. Please try again."}`
    );
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("No response stream received from the server.");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  // Track pending tool names so tool_result can resolve via the last tool_call
  const pendingToolNames: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6); // strip "data: "
        if (payload === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(payload) as {
            type?: string;
            data?: unknown;
            content?: string;
            name?: string;
            args?: Record<string, unknown>;
          };

          // Handle tool_call events — show "in progress" card immediately
          if (parsed.type === "tool_call" && onToolStarted) {
            const d = parsed.data as Record<string, unknown> | undefined;
            const toolName = (d?.name as string) ?? (d?.toolName as string) ?? "";
            const toolArgs = (d?.arguments as Record<string, unknown>) ?? {};
            // Use backend's human-friendly message if available
            const friendly = (d?.friendlyMessage as string) ?? "";
            if (friendly && onThinking) {
              onThinking(friendly);
            }
            if (toolName) {
              pendingToolNames.push(toolName);
              onToolStarted(toolName, toolArgs);
            }
          }

          // Handle tool completion events — triggers file tree / content refresh
          if (parsed.type === "tool.completed" && onToolCompleted) {
            const toolName = parsed.name ?? (typeof parsed.data === "object" && parsed.data !== null ? (parsed.data as Record<string, unknown>).name as string : "");
            const toolArgs = parsed.args ?? (typeof parsed.data === "object" && parsed.data !== null ? (parsed.data as Record<string, unknown>).args as Record<string, unknown> : {});
            onToolCompleted(toolName ?? "", toolArgs ?? {});
          }

          // Handle tool_result events — tool finished executing, update card to completed
          if ((parsed.type === "tool_result" || parsed.type === "tool.completed") && onToolCompleted) {
            const d = parsed.data as Record<string, unknown> | undefined;
            let toolName = (d?.name as string) ?? (d?.toolName as string) ?? "";
            const toolArgs = (d?.result as Record<string, unknown>) ?? (d?.args as Record<string, unknown>) ?? {};
            // If tool_result lacks a name, use the name from the last tool_call
            if (!toolName && pendingToolNames.length > 0) {
              toolName = pendingToolNames.shift()!;
            } else if (toolName && pendingToolNames.length > 0 && pendingToolNames[0] === toolName) {
              pendingToolNames.shift();
            }
            if (toolName) {
              onToolCompleted(toolName, toolArgs);
            }
          }

          // Handle code_diff events
          if (parsed.type === "code_diff" && onToolCompleted) {
            const d = parsed.data as Record<string, unknown> | undefined;
            const filePath = (d?.filePath as string) ?? "";
            const action = (d?.action as string) ?? "edit";
            if (filePath) {
              onToolCompleted(`${action}_file`, { path: filePath });
            }
          }

          // Forward thinking events for live status display
          if (parsed.type === "thinking" && onThinking) {
            const thinkingContent = typeof parsed.data === "string" ? parsed.data : "";
            if (thinkingContent) {
              onThinking(thinkingContent);
            }
          }

          // Handle status events from auto-fix system
          if (parsed.type === "status" && onStatusChange) {
            const d = parsed.data as Record<string, unknown> | undefined;
            const statusMsg = (d?.message as string) ?? "";
            if (statusMsg) {
              onStatusChange(statusMsg);
            }
          }

          // Handle auto-fix completion
          if (parsed.type === "auto_fix_complete" && onStatusChange) {
            const d = parsed.data as Record<string, unknown> | undefined;
            const success = d?.success as boolean;
            onStatusChange(success ? "All issues resolved" : "");
          }

          // Handle error events from the backend
          if (parsed.type === "error") {
            const errMsg = typeof parsed.data === "string"
              ? parsed.data
              : "An unknown error occurred.";
            onError(errMsg);
            return;
          }

          // Extract text content from various SSE event shapes
          let text = "";
          if (parsed.type === "text_delta") {
            // Copilot SDK sends {type:"text_delta", data:"actual text"}
            text = typeof parsed.data === "string" ? parsed.data : "";
          } else if (parsed.type === "assistant.message") {
            // Full message event: {type:"assistant.message", data:{content:"..."}}
            const d = parsed.data as Record<string, unknown> | undefined;
            text = typeof d?.content === "string" ? d.content : "";
          } else if (parsed.type === "text_delta" || !parsed.type || parsed.type === "content") {
            if (typeof parsed.data === "string") {
              text = parsed.data;
            } else if (typeof parsed.content === "string") {
              text = parsed.content;
            }
          }
          // Skip non-text events (session.tools_updated, usage_info, etc.)
          if (text) {
            onChunk(text);
          }
        } catch {
          // If the payload isn't JSON, treat it as raw text
          if (payload) {
            onChunk(payload);
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    onError(
      "Unable to connect to Doable's AI engine. Please check that the API server is running."
    );
    return;
  }

  // Stream ended without [DONE] — still call onDone
  onDone();
}

// ─── Markdown Rendering (static — outside component for memoization) ────

function formatInlineStatic(text: string): React.ReactNode {
  const segments = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return segments.map((seg, j) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        <strong key={j} className="font-semibold text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith("`") && seg.endsWith("`")) {
      return (
        <code
          key={j}
          className="rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] text-brand-300"
        >
          {seg.slice(1, -1)}
        </code>
      );
    }
    return seg;
  });
}

function formatContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const lines = part.split("\n");
      const lang = (lines[0] ?? "").replace("```", "").trim();
      const code = lines.slice(1, -1).join("\n");
      return (
        <div
          key={i}
          className="my-3 overflow-hidden rounded-lg border border-zinc-700/50"
        >
          {lang && (
            <div className="bg-zinc-800/80 px-3 py-1.5 text-[11px] font-medium text-zinc-400 border-b border-zinc-700/50">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto bg-zinc-900/60 p-3 text-[13px] leading-relaxed text-zinc-300">
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    const textLines = part.split("\n");
    const elements: React.ReactNode[] = [];
    let listBuffer: { ordered: boolean; items: React.ReactNode[] } | null = null;

    const flushList = () => {
      if (!listBuffer) return;
      if (listBuffer.ordered) {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-1.5 ml-4 list-decimal space-y-0.5 text-zinc-300">
            {listBuffer.items.map((item, idx) => (<li key={idx}>{item}</li>))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-1.5 ml-4 list-disc space-y-0.5 text-zinc-300">
            {listBuffer.items.map((item, idx) => (<li key={idx}>{item}</li>))}
          </ul>
        );
      }
      listBuffer = null;
    };

    for (let li = 0; li < textLines.length; li++) {
      const line = textLines[li]!;
      const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
      const olMatch = line.match(/^\s*\d+\.\s+(.*)/);

      if (ulMatch) {
        if (!listBuffer || listBuffer.ordered) { flushList(); listBuffer = { ordered: false, items: [] }; }
        listBuffer.items.push(formatInlineStatic(ulMatch[1] ?? ""));
      } else if (olMatch) {
        if (!listBuffer || !listBuffer.ordered) { flushList(); listBuffer = { ordered: true, items: [] }; }
        listBuffer.items.push(formatInlineStatic(olMatch[1] ?? ""));
      } else {
        flushList();
        elements.push(
          <span key={`line-${i}-${li}`} className="whitespace-pre-wrap">
            {formatInlineStatic(line)}
            {li < textLines.length - 1 ? "\n" : ""}
          </span>
        );
      }
    }
    flushList();
    return <span key={i}>{elements}</span>;
  });
}

/** Memoized message content renderer — prevents re-parsing markdown for unchanged messages */
const MemoizedMessageContent = memo(function MemoizedMessageContent({ content }: { content: string }) {
  return <>{formatContent(content)}</>;
});

// ─── Helpers ────────────────────────────────────────────────

/** Derive a project name from the user prompt (capitalize first letter of each word, max ~6 words) */
function deriveProjectName(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 6);
  const name = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  // Remove trailing punctuation
  return name.replace(/[.!?,;:]+$/, "") || "New Project";
}

/** Generate a human-readable description for a tool action */
function describeToolAction(toolName: string, args?: Record<string, unknown>): string {
  const fileName = args?.path ?? args?.filePath ?? args?.file ?? "";
  const shortName = typeof fileName === "string" ? fileName.split("/").pop() ?? "" : "";

  if (toolName.toLowerCase().includes("create") || toolName.toLowerCase().includes("write")) {
    return shortName ? `Creating ${shortName}` : "Creating file";
  }
  if (toolName.toLowerCase().includes("edit") || toolName.toLowerCase().includes("update") || toolName.toLowerCase().includes("patch")) {
    return shortName ? `Updating ${shortName}` : "Updating file";
  }
  if (toolName.toLowerCase().includes("delete") || toolName.toLowerCase().includes("remove")) {
    return shortName ? `Removing ${shortName}` : "Removing file";
  }
  if (toolName.toLowerCase().includes("rename")) {
    return shortName ? `Renaming ${shortName}` : "Renaming file";
  }
  if (toolName.toLowerCase().includes("read")) {
    return shortName ? `Reading ${shortName}` : "Reading file";
  }
  if (toolName.toLowerCase().includes("list")) {
    return "Scanning project structure";
  }
  if (toolName.toLowerCase().includes("install") || toolName.toLowerCase().includes("package")) {
    const pkgs = args?.packages ?? args?.name ?? "";
    if (typeof pkgs === "string" && pkgs) {
      const first = pkgs.split(/\s+/)[0] ?? pkgs;
      return `Installing ${first}`;
    }
    return "Installing packages";
  }
  if (toolName.toLowerCase().includes("deploy")) {
    return "Deploying preview";
  }
  // Filter out technical jargon - never show raw tool names like "powershell"
  const cleaned = toolName
    .replace(/[_-]/g, " ")
    .replace(/\b(powershell|bash|shell|cmd|exec|run)\b/gi, "")
    .trim();
  if (!cleaned) return "Working on it";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert AI thinking text into a short, human-friendly status message */
function humanizeThinking(text: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  // Filter out technical/system content
  if (lower.includes("powershell") || lower.includes("bash") || lower.includes("shell")) return "";
  if (lower.includes("layout") || lower.includes("structure") || lower.includes("page")) return "Planning the layout";
  if (lower.includes("component") || lower.includes("button") || lower.includes("card")) return "Designing components";
  if (lower.includes("style") || lower.includes("css") || lower.includes("tailwind") || lower.includes("color") || lower.includes("font")) return "Styling your design";
  if (lower.includes("api") || lower.includes("fetch") || lower.includes("data") || lower.includes("state")) return "Setting up data flow";
  if (lower.includes("install") || lower.includes("package") || lower.includes("dependency") || lower.includes("npm")) return "Setting up dependencies";
  if (lower.includes("route") || lower.includes("navigation") || lower.includes("link")) return "Configuring navigation";
  if (lower.includes("fix") || lower.includes("error") || lower.includes("bug") || lower.includes("issue")) return "Fixing an issue";
  if (lower.includes("image") || lower.includes("icon") || lower.includes("asset")) return "Adding visual elements";
  if (lower.includes("responsive") || lower.includes("mobile") || lower.includes("breakpoint")) return "Making it responsive";
  if (lower.includes("animation") || lower.includes("transition") || lower.includes("motion")) return "Adding animations";
  if (lower.includes("form") || lower.includes("input") || lower.includes("validation")) return "Building form logic";
  return "";
}

/** Shown while AI suggestions load, or if the suggestions API fails */
const FALLBACK_SUGGESTIONS: string[] = [
  "Improve the styling",
  "Add responsive design",
  "Add more features",
  "Fix any issues",
];

/**
 * Fetch AI-generated contextual suggestions from the API.
 * Uses a fast/cheap model via Copilot SDK to generate relevant next steps.
 */
async function fetchAISuggestions(
  projectId: string,
  userPrompt: string,
  lastAssistantMessage: string,
): Promise<string[]> {
  try {
    const { accessToken } = getStoredTokens();
    const res = await fetch(`${API_URL}/projects/${projectId}/chat/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        userPrompt: userPrompt.slice(0, 4000),
        lastAssistantMessage: lastAssistantMessage.slice(0, 4000),
      }),
    });
    if (!res.ok) return FALLBACK_SUGGESTIONS;
    const json = (await res.json()) as { data: string[] };
    return json.data.length > 0 ? json.data : FALLBACK_SUGGESTIONS;
  } catch {
    return FALLBACK_SUGGESTIONS;
  }
}

function generateProjectId(): string {
  return `proj-${Date.now()}`;
}

function nowTimestamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ──────────────────────────────────────────────
export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawProjectId = params.projectId;

  // For "new" projects, generate a stable ID and persist it so refreshes
  // don't create duplicate projects and waste credits.
  const [resolvedProjectId] = useState<string>(() => {
    if (rawProjectId !== "new") return rawProjectId;
    // Check sessionStorage first — if user refreshes, reuse the same project
    const storageKey = "doable_new_project_id";
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    if (stored) return stored;
    const newId = generateProjectId();
    if (typeof window !== "undefined") sessionStorage.setItem(storageKey, newId);
    return newId;
  });
  const isNewProject = rawProjectId === "new";
  const { user: authUser } = useAuth();

  // ─── Scaffold / preview state ─────────────────────────────
  const [scaffoldStatus, setScaffoldStatus] = useState<ScaffoldStatus>("idle");
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ─── Workspace / AI enforcement state ────────────────────
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [effectiveAiConfig, setEffectiveAiConfig] = useState<ApiEffectiveAiConfig | null>(null);

  // ─── File tree state ──────────────────────────────────────
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  // ─── File content state ───────────────────────────────────
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileContentError, setFileContentError] = useState<string | null>(null);

  // ─── Multi-tab editor state ─────────────────────────────────
  const [openFileTabs, setOpenFileTabs] = useState<OpenFileTab[]>([]);
  const [showMinimap, setShowMinimap] = useState(false);
  const fileContentsCache = useRef<Record<string, string>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── UI state ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");

  // ── AI Model Selection ──
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("doable_selected_model") ?? "";
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("doable_selected_provider_id") ?? null;
  });
  const [selectedCopilotAccountId, setSelectedCopilotAccountId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("doable_selected_copilot_account") ?? null;
  });
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await apiFetch<{ data: { id: string; name: string }[] }>("/ai/models");
        if (cancelled) return;
        const fetched = json.data ?? [];
        if (fetched.length > 0) {
          setAvailableModels(fetched.map((m) => ({ id: m.id, label: m.name, group: "copilot" as const })));
        }
      } catch { /* use fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleModelSelect = useCallback((modelId: string, providerId: string | null, copilotAccountId: string | null) => {
    // Block user changes when AI enforcement is active
    if (effectiveAiConfig?.enforce_ai) return;
    setSelectedModelId(modelId);
    setSelectedProviderId(providerId);
    setSelectedCopilotAccountId(copilotAccountId);
    localStorage.setItem("doable_selected_model", modelId);
    if (providerId) localStorage.setItem("doable_selected_provider_id", providerId);
    else localStorage.removeItem("doable_selected_provider_id");
    if (copilotAccountId) localStorage.setItem("doable_selected_copilot_account", copilotAccountId);
    else localStorage.removeItem("doable_selected_copilot_account");
  }, [effectiveAiConfig?.enforce_ai]);

  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    // Restore chat history from localStorage on mount
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(`doable_chat_${resolvedProjectId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMsg[];
        // Strip any leftover streaming state from a previous session
        return parsed.map((m) => ({ ...m, isStreaming: false }));
      }
    } catch {
      // Ignore corrupt localStorage data
    }
    return [];
  });
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [keystrokeSignal, setKeystrokeSignal] = useState(0);

  // Voice input & image attachments
  const speechRecognition = useSpeechRecognition((transcript: string) => {
    setInputValue((prev) => (prev ? prev + " " + transcript : transcript));
  });
  const imageAttachments = useImageAttachments();
  const [projectName, setProjectName] = useState(() => {
    const prompt = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prompt") : null;
    if (prompt) return deriveProjectName(prompt);
    return isNewProject ? "New Project" : "My Awesome App";
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [moreMenuMsgId, setMoreMenuMsgId] = useState<string | null>(null);
  const [taskCardTabs, setTaskCardTabs] = useState<Record<string, TaskCardTab>>({});
  const [collapsedTaskCards, setCollapsedTaskCards] = useState<Set<string>>(new Set());
  const [splitPos, setSplitPos] = useState(35); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set<string>()
  );
  const [showCreditsBar, setShowCreditsBar] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<ActiveTab[]>(() => loadPinnedItems());
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // ─── Toolbar dialog/modal state ────────────────────────────
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Share dialog state
  const [projectVisibility, setProjectVisibility] = useState<"public" | "private">("public");
  const [shareCopied, setShareCopied] = useState<string | null>(null);

  // Publish modal state
  const [publishStatus, setPublishStatus] = useState<"idle" | "building" | "deploying" | "success" | "error">("idle");
  const [publishEnv, setPublishEnv] = useState<"production" | "preview">("production");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishBuildLog, setPublishBuildLog] = useState<string | null>(null);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);

  // Duplicate state
  const [isDuplicating, setIsDuplicating] = useState(false);

  // ─── Live status for AI activity ─────────────────────────
  const [liveStatus, setLiveStatus] = useState<string>("");
  // Track first generation to show loading overlay instead of default template
  const [isFirstGeneration, setIsFirstGeneration] = useState(false);
  const previewRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chunkBufferRef = useRef("");
  const rafIdRef = useRef<number | null>(null);
  const autoSentRef = useRef(false);
  const scaffoldInitRef = useRef(false);

  // ─── Replace URL from /editor/new to /editor/{id} to prevent re-scaffold on refresh ─
  useEffect(() => {
    if (isNewProject && resolvedProjectId) {
      const newUrl = `/editor/${resolvedProjectId}${window.location.search}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [isNewProject, resolvedProjectId]);

  // ─── Fetch workspace_id from project ──────────────────────
  useEffect(() => {
    if (!resolvedProjectId) return;
    apiGetProject(resolvedProjectId)
      .then((res) => setWorkspaceId(res.data.workspace_id))
      .catch(console.error);
  }, [resolvedProjectId]);

  // ─── Fetch effective AI config for enforcement + user prefs ─
  useEffect(() => {
    if (!workspaceId) return;
    apiGetEffectiveAiConfig(workspaceId)
      .then((res) => setEffectiveAiConfig(res.data))
      .catch(console.error);
  }, [workspaceId]);

  // ─── Apply AI enforcement or server-side user preferences ──
  useEffect(() => {
    if (!effectiveAiConfig) return;
    if (effectiveAiConfig.enforce_ai) {
      // Enforced — override all model selection state
      setSelectedModelId(effectiveAiConfig.enforced_model ?? "");
      setSelectedProviderId(effectiveAiConfig.enforced_provider_id ?? null);
      setSelectedCopilotAccountId(effectiveAiConfig.enforced_copilot_account_id ?? null);
    } else {
      // Not enforced — use server-side user preferences as source of truth if available
      if (effectiveAiConfig.user_model) {
        setSelectedModelId(effectiveAiConfig.user_model);
        localStorage.setItem("doable_selected_model", effectiveAiConfig.user_model);
      }
      if (effectiveAiConfig.user_provider_id) {
        setSelectedProviderId(effectiveAiConfig.user_provider_id);
        localStorage.setItem("doable_selected_provider_id", effectiveAiConfig.user_provider_id);
      }
      if (effectiveAiConfig.user_copilot_account_id) {
        setSelectedCopilotAccountId(effectiveAiConfig.user_copilot_account_id);
        localStorage.setItem("doable_selected_copilot_account", effectiveAiConfig.user_copilot_account_id);
      }
    }
  }, [effectiveAiConfig]);

  // ─── Scaffold + preview URL on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setScaffoldStatus("scaffolding");
      setScaffoldError(null);

      try {
        const scaffoldUrl = await scaffoldProject(resolvedProjectId);
        if (cancelled) return;

        if (scaffoldUrl) {
          // Scaffold returned the preview URL directly
          setPreviewUrl(scaffoldUrl);
          setScaffoldStatus("ready");
        } else {
          // No URL from scaffold — poll for the preview URL
          setScaffoldStatus("starting");
          let url: string | null = null;
          let attempts = 0;
          const maxAttempts = 30;
          while (!url && attempts < maxAttempts && !cancelled) {
            try {
              url = await fetchPreviewUrl(resolvedProjectId);
            } catch {
              // ignore and retry
            }
            if (!url) {
              attempts++;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          if (cancelled) return;

          if (url) {
            setPreviewUrl(url);
            setScaffoldStatus("ready");
          } else {
            throw new Error("Dev server did not start in time. Please try refreshing.");
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to scaffold project";
        setScaffoldError(msg);
        setScaffoldStatus("error");
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [resolvedProjectId]);

  // ─── Update project name from prompt on mount ───────────────
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (!prompt) return;
    const derived = deriveProjectName(prompt);
    setProjectName(derived);
    setNameInput(derived);
    // Fire-and-forget update to the API
    apiUpdateProject(resolvedProjectId, { name: derived }).catch(() => {
      // Silently ignore — name will still be shown locally
    });
  }, [resolvedProjectId, searchParams]);

  // ─── Load file tree once scaffold is ready ────────────────
  const loadFileTree = useCallback(async () => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const paths = await fetchFileList(resolvedProjectId);
      const tree = buildFileTree(paths);
      setFileTree(tree);
      // Auto-expand top-level folders
      const topFolders = tree
        .filter((n) => n.type === "folder")
        .map((n) => n.path);
      setExpandedFolders((prev) => new Set([...prev, ...topFolders]));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load files";
      setFileTreeError(msg);
    } finally {
      setFileTreeLoading(false);
    }
  }, [resolvedProjectId]);

  useEffect(() => {
    if (scaffoldStatus === "ready") {
      loadFileTree();
    }
  }, [scaffoldStatus, loadFileTree]);

  // ─── Load file content when a file is selected ────────────
  const loadFileContent = useCallback(
    async (filePath: string) => {
      // Check the cache first (for unsaved edits)
      const cached = fileContentsCache.current[filePath];
      if (cached !== undefined) {
        setFileContent(cached);
        setFileContentLoading(false);
        setFileContentError(null);
        return;
      }

      setFileContentLoading(true);
      setFileContentError(null);
      setFileContent(null);
      try {
        const content = await fetchFileContent(resolvedProjectId, filePath);
        setFileContent(content);
        fileContentsCache.current[filePath] = content;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load file";
        setFileContentError(msg);
      } finally {
        setFileContentLoading(false);
      }
    },
    [resolvedProjectId],
  );

  // ─── Open a file in a tab ────────────────────────────────
  const openFileInTab = useCallback(
    (filePath: string) => {
      setSelectedFile(filePath);
      const filename = filePath.split("/").pop() ?? filePath;
      const language = detectLanguage(filename);

      setOpenFileTabs((prev) => {
        const exists = prev.find((t) => t.path === filePath);
        if (exists) return prev;
        return [...prev, { path: filePath, name: filename, language, isDirty: false }];
      });
    },
    [],
  );

  // ─── Close a file tab ────────────────────────────────────
  const closeFileTab = useCallback(
    (filePath: string) => {
      delete fileContentsCache.current[filePath];
      setOpenFileTabs((prev) => {
        const filtered = prev.filter((t) => t.path !== filePath);
        // If we closed the active tab, switch to the last remaining tab
        if (selectedFile === filePath) {
          if (filtered.length > 0) {
            const newActive = filtered[filtered.length - 1]!.path;
            setSelectedFile(newActive);
            const cached = fileContentsCache.current[newActive];
            if (cached !== undefined) {
              setFileContent(cached);
            } else {
              loadFileContent(newActive);
            }
          } else {
            setSelectedFile(null);
            setFileContent(null);
          }
        }
        return filtered;
      });
    },
    [selectedFile, loadFileContent],
  );

  // ─── Mark tab dirty/clean ────────────────────────────────
  const markTabDirty = useCallback(
    (filePath: string, dirty: boolean) => {
      setOpenFileTabs((prev) =>
        prev.map((t) => (t.path === filePath ? { ...t, isDirty: dirty } : t)),
      );
    },
    [],
  );

  // ─── Handle editor content change (with autosave) ────────
  const handleMonacoChange = useCallback(
    (newValue: string) => {
      if (!selectedFile) return;

      setFileContent(newValue);
      fileContentsCache.current[selectedFile] = newValue;
      markTabDirty(selectedFile, true);

      // Debounced autosave
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        if (selectedFile) {
          const content = fileContentsCache.current[selectedFile];
          if (content !== undefined) {
            saveFileContent(resolvedProjectId, selectedFile, content)
              .then(() => markTabDirty(selectedFile, false))
              .catch((err) => console.error("Autosave failed:", err));
          }
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [selectedFile, resolvedProjectId, markTabDirty],
  );

  // ─── Handle explicit save (Ctrl+S) ──────────────────────
  const handleMonacoSave = useCallback(
    (value: string) => {
      if (!selectedFile) return;

      // Cancel pending autosave
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      fileContentsCache.current[selectedFile] = value;
      saveFileContent(resolvedProjectId, selectedFile, value)
        .then(() => markTabDirty(selectedFile, false))
        .catch((err) => console.error("Save failed:", err));
    },
    [selectedFile, resolvedProjectId, markTabDirty],
  );

  useEffect(() => {
    if (selectedFile && scaffoldStatus === "ready") {
      loadFileContent(selectedFile);
    }
  }, [selectedFile, scaffoldStatus, loadFileContent]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      if (previewRefreshTimer.current) {
        clearTimeout(previewRefreshTimer.current);
      }
    };
  }, []);

  // ─── Preview Error Listener ──────────────────────────────
  // Listen for runtime errors reported by the preview iframe via postMessage.
  // Automatically triggers a fix request to the AI when errors are detected.
  const autoFixInFlightRef = useRef(false);
  const lastAutoFixTimeRef = useRef(0);

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;

      // Handle preview error reports
      if (event.data.type === "doable-preview-error") {
        const errors = event.data.errors as Array<{
          message: string;
          source?: string;
          stack?: string;
        }>;
        if (!errors || errors.length === 0) return;

        // Debounce: don't auto-fix more than once every 10 seconds
        const now = Date.now();
        if (now - lastAutoFixTimeRef.current < 10_000) return;
        // Don't auto-fix if already streaming or fix in flight
        if (isStreaming || autoFixInFlightRef.current) return;

        lastAutoFixTimeRef.current = now;
        autoFixInFlightRef.current = true;

        // Collect unique error messages (max 3)
        const uniqueErrors = [...new Set(errors.map((e) => e.message))].slice(0, 3);
        const errorSummary = uniqueErrors.join("\n");

        console.log("[Doable] Preview error detected, auto-fixing:", errorSummary);

        // Show status immediately
        setLiveStatus("Found a preview issue — fixing it...");

        // Auto-send fix request via the fix-error endpoint
        const { accessToken } = getStoredTokens();
        fetch(`${API_URL}/projects/${resolvedProjectId}/chat/fix-error`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            error: errorSummary,
            context: errors[0]?.stack?.slice(0, 500) || "",
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              console.warn("[Doable] Auto-fix request failed:", res.status);
              autoFixInFlightRef.current = false;
              setLiveStatus("");
              return;
            }

            // Create an assistant message for the fix
            const fixId = `fix-${Date.now()}`;
            const fixMsg: ChatMsg = {
              id: fixId,
              role: "assistant",
              content: "",
              timestamp: nowTimestamp(),
              isStreaming: true,
            };
            setMessages((prev) => [...prev, fixMsg]);
            setIsStreaming(true);
            setLiveStatus("Fixing preview issue...");

            // Stream the fix response
            const reader = res.body?.getReader();
            if (!reader) {
              autoFixInFlightRef.current = false;
              setIsStreaming(false);
              setLiveStatus("");
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith("data: ")) continue;
                  const payload = trimmed.slice(6);
                  if (payload === "[DONE]") break;

                  try {
                    const parsed = JSON.parse(payload) as Record<string, unknown>;
                    // Handle text
                    if (parsed.type === "text_delta") {
                      const text = typeof parsed.data === "string" ? parsed.data : "";
                      if (text) {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === fixId ? { ...m, content: m.content + text } : m
                          )
                        );
                      }
                    }
                    // Handle status from auto-fix
                    if (parsed.type === "status") {
                      const d = parsed.data as Record<string, unknown>;
                      const msg = (d?.message as string) ?? "";
                      if (msg) setLiveStatus(msg);
                    }
                    // Handle tool completion — refresh preview
                    if (parsed.type === "tool_result" || parsed.type === "tool_call") {
                      const d = parsed.data as Record<string, unknown>;
                      const friendly = (d?.friendlyMessage as string) ?? "";
                      if (friendly) setLiveStatus(friendly);
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            } catch {
              // Stream error — ignore
            }

            // Mark message as done — remove it entirely if it has no visible content
            setMessages((prev) => {
              const msg = prev.find((m) => m.id === fixId);
              if (msg && !msg.content.trim()) {
                // No text content was produced — drop the blank message
                return prev.filter((m) => m.id !== fixId);
              }
              return prev.map((m) =>
                m.id === fixId ? { ...m, isStreaming: false } : m
              );
            });
            setIsStreaming(false);
            setLiveStatus("");
            autoFixInFlightRef.current = false;

            // Refresh preview + file tree after fix
            loadFileTree();
            if (selectedFile) {
              delete fileContentsCache.current[selectedFile];
              loadFileContent(selectedFile);
            }
            setTimeout(() => {
              if (iframeRef.current) {
                try {
                  iframeRef.current.contentWindow?.postMessage({ type: "doable-refresh" }, "*");
                } catch {
                  if (previewUrl) {
                    iframeRef.current.src = previewUrl + "?t=" + Date.now();
                  }
                }
              }
            }, 800);
          })
          .catch(() => {
            autoFixInFlightRef.current = false;
            setLiveStatus("");
          });
      }

      // Handle preview loaded event
      if (event.data.type === "doable-preview-loaded") {
        // Preview loaded successfully — clear any error status
        if (liveStatus.includes("issue") || liveStatus.includes("error") || liveStatus.includes("Fixing")) {
          setLiveStatus("");
        }
      }
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [resolvedProjectId, isStreaming, liveStatus, loadFileTree, selectedFile, loadFileContent, previewUrl]);

  // Ctrl+W to close current tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w" && activeTab === "code") {
        e.preventDefault();
        if (selectedFile) {
          closeFileTab(selectedFile);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFile, activeTab, closeFileTab]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist chat messages to localStorage so they survive page reloads
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(
        `doable_chat_${resolvedProjectId}`,
        JSON.stringify(messages),
      );
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [messages, resolvedProjectId]);

  // Load chat history from API (database-backed) on mount
  useEffect(() => {
    const loadFromApi = async () => {
      try {
        const json = await apiFetch<{ data: any[] }>(`/projects/${resolvedProjectId}/chat/history`);
        if (Array.isArray(json.data) && json.data.length > 0) {
          const currentUserId = authUser?.id;
          const apiMessages: ChatMsg[] = json.data
            .filter((m: any) => m.role === "user" || m.role === "assistant")
            .map((m: any) => {
              // Build senderInfo for user messages from other collaborators
              let senderInfo: ChatMsg["senderInfo"] = undefined;
              if (m.role === "user" && m.sent_by_user_id && m.sent_by_user_id !== currentUserId) {
                const colors = ["#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6","#4FC3F7","#4DD0E1","#4DB6AC","#81C784","#AED581","#FFD54F","#FFB74D","#FF8A65","#A1887F","#90A4AE"];
                let hash = 0;
                for (let i = 0; i < m.sent_by_user_id.length; i++) hash = (hash * 31 + m.sent_by_user_id.charCodeAt(i)) | 0;
                senderInfo = {
                  userId: m.sent_by_user_id,
                  displayName: m.display_name || "Collaborator",
                  color: m.user_color || colors[Math.abs(hash) % colors.length],
                  isRemote: true,
                };
              }
              return {
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content || "",
                timestamp: new Date(m.created_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                }),
                isStreaming: false,
                toolActions: m.tool_actions || undefined,
                suggestions: m.suggestions || undefined,
                senderInfo,
              };
            });
          setMessages(apiMessages);
          // Also update suggestions from the last assistant message
          const lastAssistant = [...apiMessages].reverse().find(m => m.role === "assistant");
          if (lastAssistant?.suggestions && lastAssistant.suggestions.length > 0) {
            setAiSuggestions(lastAssistant.suggestions);
          }
        }
      } catch {
        // API load failed — localStorage fallback already loaded
      }
    };
    loadFromApi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedProjectId]);

  // Auto-send prompt from dashboard navigation.
  // Reads from sessionStorage (primary) or URL query param (fallback).
  // The backend auto-scaffolds on chat, so we don't need to wait for
  // frontend scaffold status — just send once the component is mounted.
  useEffect(() => {
    if (autoSentRef.current) return;
    autoSentRef.current = true;
    // Read from sessionStorage first (most reliable), then fall back to URL
    const storageKey = `doable_initial_prompt_${resolvedProjectId}`;
    const stored = sessionStorage.getItem(storageKey);
    const fromUrl = new URLSearchParams(window.location.search).get("prompt");
    if (stored) sessionStorage.removeItem(storageKey);

    // Parse stored value — may be JSON { prompt, attachments } or plain string
    let prompt: string | null = null;
    let storedAttachments: ImageAttachment[] | undefined;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && "prompt" in parsed) {
          prompt = parsed.prompt;
          storedAttachments = parsed.attachments;
        } else {
          prompt = stored; // plain string fallback
        }
      } catch {
        prompt = stored; // not JSON, use as-is
      }
    }
    if (!prompt) prompt = fromUrl;
    if (!prompt) return;
    // Don't auto-send if messages already exist (page was refreshed with localStorage history)
    if (messages.length > 0) return;
    // Small delay so the UI renders the chat panel first
    setTimeout(() => {
      sendMessage(prompt!, storedAttachments);
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle panel resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.max(25, Math.min(75, pct)));
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  // Close "More" menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  // Toggle pin for a toolbar item
  const togglePin = useCallback((tab: ActiveTab) => {
    setPinnedItems((prev) => {
      const next = prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab];
      savePinnedItems(next);
      return next;
    });
  }, []);

  // Close panel handler — go back to chat
  const handlePanelClose = useCallback(() => {
    setActiveTab("chat");
  }, []);

  // Whether the current tab is a full panel view
  const isPanelView = PANEL_TABS.includes(activeTab);

  // ─── Handle tool started — add "running" card + update live status ──
  const handleToolStarted = useCallback(
    (toolName: string, _args: Record<string, unknown>) => {
      // Update live status with human-friendly description
      const description = describeToolAction(toolName, _args);
      setLiveStatus(description);

      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return prev;
        const filePath = typeof (_args?.path ?? _args?.filePath ?? _args?.file) === "string"
            ? (_args?.path ?? _args?.filePath ?? _args?.file) as string
            : undefined;
        const action: ToolAction = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName,
          description,
          isExpanded: false,
          isBookmarked: false,
          filePath,
          status: "running",
        };
        return prev.map((m) =>
          m.id === lastAssistant.id
            ? { ...m, toolActions: [...(m.toolActions ?? []), action] }
            : m,
        );
      });
    },
    [],
  );

  // ─── Handle tool completion — refresh files + update card ─
  const handleToolCompleted = useCallback(
    (toolName: string, _args: Record<string, unknown>) => {
      // Update the running tool action card to "completed", or add a new completed card
      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return prev;

        // Try to find a running action with this tool name to mark as completed
        const runningAction = lastAssistant.toolActions?.find(
          (a) => a.toolName === toolName && a.status === "running"
        );

        if (runningAction) {
          // Update existing running card to completed
          return prev.map((m) =>
            m.id === lastAssistant.id
              ? {
                  ...m,
                  toolActions: m.toolActions?.map((a) =>
                    a.id === runningAction.id
                      ? { ...a, status: "completed" as const }
                      : a
                  ),
                }
              : m,
          );
        }

        // No running card found — add a new completed card (fallback)
        const filePath = typeof (_args?.path ?? _args?.filePath ?? _args?.file) === "string"
            ? (_args?.path ?? _args?.filePath ?? _args?.file) as string
            : undefined;
        const action: ToolAction = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName,
          description: describeToolAction(toolName, _args),
          isExpanded: false,
          isBookmarked: false,
          filePath,
          status: "completed",
        };
        return prev.map((m) =>
          m.id === lastAssistant.id
            ? { ...m, toolActions: [...(m.toolActions ?? []), action] }
            : m,
        );
      });

      // File-modifying tools: refresh the file tree and optionally reload current file
      const fileTools = [
        "create_file",
        "write_file",
        "edit_file",
        "delete_file",
        "rename_file",
        "create_or_update_file",
        "write",
        "create",
        "update",
        "patch",
      ];
      const isFileOp = fileTools.some(
        (t) => toolName.toLowerCase().includes(t) || t.includes(toolName.toLowerCase()),
      );

      if (isFileOp || !toolName) {
        // Always refresh file tree on any tool completion for safety
        loadFileTree();

        // If the currently selected file was modified, reload it from API
        // Clear the cache first so loadFileContent fetches fresh content
        if (selectedFile) {
          delete fileContentsCache.current[selectedFile];
          loadFileContent(selectedFile);
        }

        // Debounced preview refresh — coalesce rapid file changes into one reload
        if (previewRefreshTimer.current) {
          clearTimeout(previewRefreshTimer.current);
        }
        previewRefreshTimer.current = setTimeout(() => {
          previewRefreshTimer.current = null;
          if (iframeRef.current) {
            try {
              // Use postMessage to trigger reload via injected doable-refresh listener
              // This works cross-origin (Cloudflare tunnel) without a full src reset
              iframeRef.current.contentWindow?.postMessage({ type: "doable-refresh" }, "*");
            } catch {
              // Final fallback: reset src with cache-bust
              if (previewUrl) {
                iframeRef.current.src = previewUrl + (previewUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
              }
            }
          }
        }, 300);
      }
    },
    [loadFileTree, selectedFile, loadFileContent, previewUrl],
  );

  // ─── Send message to real API ──────────────────────────────
  const sendMessage = useCallback(
    (text: string, msgAttachments?: ImageAttachment[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      // Add user message
      const userMsg: ChatMsg = {
        id: Date.now().toString(),
        role: "user",
        content: trimmed,
        timestamp: nowTimestamp(),
        ...(msgAttachments?.length ? { attachments: msgAttachments } : {}),
      };

      // Add placeholder assistant message for streaming
      const assistantId = (Date.now() + 1).toString();
      const assistantMsg: ChatMsg = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: nowTimestamp(),
        isStreaming: true,
      };

      // If this is the very first message, show loading overlay over preview
      setMessages((prev) => {
        if (prev.length === 0) {
          setIsFirstGeneration(true);
        }
        return [...prev, userMsg, assistantMsg];
      });
      setInputValue("");
      setIsStreaming(true);
      setLiveStatus("Understanding your request...");

      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Auto-detect visual edit mode from [Visual Edit] prefix
      const effectiveMode: ChatMode = trimmed.startsWith("[Visual Edit]") ? "visual-edit" : chatMode;

      streamChat(
        resolvedProjectId,
        trimmed,
        effectiveMode,
        // onChunk — append text to the streaming assistant message (RAF-batched)
        (chunk: string) => {
          // Only set status once when text first starts flowing
          if (!chunkBufferRef.current && rafIdRef.current === null) {
            setLiveStatus("Writing response...");
          }
          chunkBufferRef.current += chunk;
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
              const buffered = chunkBufferRef.current;
              chunkBufferRef.current = "";
              rafIdRef.current = null;
              if (buffered) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + buffered }
                      : m
                  )
                );
              }
            });
          }
        },
        // onDone
        () => {
          // Flush any remaining buffered chunks before marking done
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          if (chunkBufferRef.current) {
            const remaining = chunkBufferRef.current;
            chunkBufferRef.current = "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + remaining }
                  : m
              )
            );
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false }
                : m
            )
          );
          setIsStreaming(false);
          setLiveStatus("");
          setIsFirstGeneration(false);
          // Refresh file tree after AI response completes (may have created files)
          loadFileTree();
          if (selectedFile) {
            delete fileContentsCache.current[selectedFile];
            loadFileContent(selectedFile);
          }
          // Final preview refresh after AI makes changes
          if (previewRefreshTimer.current) {
            clearTimeout(previewRefreshTimer.current);
          }
          previewRefreshTimer.current = setTimeout(() => {
            previewRefreshTimer.current = null;
            if (iframeRef.current) {
              try {
                iframeRef.current.contentWindow?.postMessage({ type: "doable-refresh" }, "*");
              } catch {
                if (previewUrl) {
                  iframeRef.current.src = previewUrl + (previewUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
                }
              }
            }
          }, 500);

          // Fetch AI-powered suggestions based on what was just built
          setAiSuggestions(FALLBACK_SUGGESTIONS); // Show fallback immediately
          // Read current assistant content from state via updater
          setMessages((prev) => {
            const lastAssistant = prev.find((m) => m.id === assistantId);
            if (lastAssistant?.content) {
              fetchAISuggestions(
                resolvedProjectId,
                trimmed,
                lastAssistant.content,
              ).then((s) => {
                setAiSuggestions(s);
                // Also persist suggestions on the assistant message
                if (s.length > 0) {
                  setMessages((prev2) =>
                    prev2.map((m) =>
                      m.id === assistantId ? { ...m, suggestions: s } : m
                    )
                  );
                }
              });
            }
            return prev; // Don't modify state
          });
        },
        // onError
        (error: string) => {
          // Flush RAF buffer on error
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          chunkBufferRef.current = "";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: error,
                    isStreaming: false,
                    isError: true,
                  }
                : m
            )
          );
          setIsStreaming(false);
          setLiveStatus("");
          setIsFirstGeneration(false);
        },
        // onToolCompleted
        handleToolCompleted,
        // onToolStarted
        handleToolStarted,
        controller.signal,
        // onThinking — convert AI thinking to human-friendly status
        (thinkingText: string) => {
          // Accumulate thinking content into the assistant message for inline display
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, thinkingContent: (m.thinkingContent || "") + thinkingText }
                : m
            )
          );
          // If it already looks like a friendly message (e.g. from friendlyMessage), use directly
          if (thinkingText.length < 60 && !thinkingText.includes("\n")) {
            setLiveStatus(thinkingText);
            return;
          }
          // Otherwise humanize the raw thinking text
          const humanized = humanizeThinking(thinkingText);
          if (humanized) {
            setLiveStatus(humanized);
          }
        },
        // onStatusChange — backend auto-fix status updates
        (status: string) => {
          if (status) {
            setLiveStatus(status);
          }
        },
        msgAttachments,
        selectedModelId || undefined,
        selectedProviderId,
        selectedCopilotAccountId,
      );
    },
    [isStreaming, resolvedProjectId, chatMode, handleToolCompleted, handleToolStarted, loadFileTree, selectedFile, loadFileContent, previewUrl, selectedModelId, selectedProviderId, selectedCopilotAccountId]
  );

  // Send message handler (from input)
  const handleSend = useCallback(() => {
    const text = inputValue.trim() || (imageAttachments.attachments.length > 0 ? "See attached image(s)" : "");
    if (!text) return;
    sendMessage(text, imageAttachments.attachments.length > 0 ? imageAttachments.attachments : undefined);
    imageAttachments.clearAll();
  }, [inputValue, sendMessage, imageAttachments]);

  // ─── Visual Edit Hook ─────────────────────────────────────
  const isDesignMode = activeTab === "design";
  const visualEdit = useVisualEdit({ iframeRef, projectId: resolvedProjectId, onSendMessage: sendMessage });

  // Auto-activate visual edit when entering design mode
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === "design" && prevActiveTabRef.current !== "design") {
      visualEdit.activateVisualEdit();
    }
    if (activeTab !== "design" && prevActiveTabRef.current === "design") {
      visualEdit.deactivateVisualEdit();
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, visualEdit.activateVisualEdit, visualEdit.deactivateVisualEdit]);

  // Get iframe rect for floating toolbar positioning
  const [iframeRect, setIframeRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!isDesignMode || !iframeRef.current) {
      setIframeRect(null);
      return;
    }
    const updateRect = () => {
      if (iframeRef.current) {
        setIframeRect(iframeRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    const interval = setInterval(updateRect, 500);
    window.addEventListener("resize", updateRect);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", updateRect);
    };
  }, [isDesignMode]);

  // Stop streaming handler
  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, isStreaming: false, content: m.content || "(Stopped by user)" }
          : m
      )
    );
    setIsStreaming(false);
    setLiveStatus("");
  }, []);

  // Toggle feedback on a message
  const handleFeedback = useCallback((msgId: string, type: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, feedbackGiven: m.feedbackGiven === type ? null : type }
          : m
      )
    );
  }, []);

  // Toggle bookmark on a tool action
  const handleToggleBookmark = useCallback((msgId: string, actionId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              toolActions: m.toolActions?.map((a) =>
                a.id === actionId ? { ...a, isBookmarked: !a.isBookmarked } : a
              ),
            }
          : m
      )
    );
  }, []);

  // Toggle task card collapse
  const toggleTaskCardCollapse = useCallback((msgId: string) => {
    setCollapsedTaskCards((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  // Revert to a specific message point
  const handleRevertToPoint = useCallback((msgId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      return prev.slice(0, idx + 1);
    });
    setMoreMenuMsgId(null);
  }, []);

  // Close more menu when clicking outside
  useEffect(() => {
    if (!moreMenuMsgId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-more-menu]")) {
        setMoreMenuMsgId(null);
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [moreMenuMsgId]);

  // Toggle folder
  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Render file tree
  const renderTree = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const isFolder = node.type === "folder";
      const isExpanded = expandedFolders.has(node.path);
      const isSelected = selectedFile === node.path;

      return (
        <div key={node.path}>
          <button
            onClick={() => {
              if (isFolder) toggleFolder(node.path);
              else openFileInTab(node.path);
            }}
            className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-white/5 transition-colors ${
              isSelected && !isFolder
                ? "bg-brand-500/10 text-brand-300"
                : "text-zinc-400"
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {isFolder ? (
              <>
                <ChevronRight
                  className={`h-3 w-3 flex-shrink-0 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <Folder className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
              </>
            ) : (
              <>
                <span className="w-3" />
                <File className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isFolder && isExpanded && node.children && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  // Use the memoized static formatContent (defined outside component)
  // This avoids re-creating the function on every render

  // Retry scaffold
  const retryScaffold = useCallback(() => {
    scaffoldInitRef.current = false;
    setScaffoldStatus("idle");
    setScaffoldError(null);
    setPreviewUrl(null);
    // Re-trigger by resetting the ref and forcing re-render
    scaffoldInitRef.current = false;
    // We need to re-run the effect — simplest is to just call init inline
    const init = async () => {
      setScaffoldStatus("scaffolding");
      try {
        const scaffoldUrl = await scaffoldProject(resolvedProjectId);
        if (scaffoldUrl) {
          setPreviewUrl(scaffoldUrl);
          setScaffoldStatus("ready");
        } else {
          setScaffoldStatus("starting");
          let url: string | null = null;
          let attempts = 0;
          while (!url && attempts < 30) {
            try {
              url = await fetchPreviewUrl(resolvedProjectId);
            } catch {
              // retry
            }
            if (!url) {
              attempts++;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          if (url) {
            setPreviewUrl(url);
            setScaffoldStatus("ready");
          } else {
            throw new Error("Dev server did not start in time.");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to scaffold project";
        setScaffoldError(msg);
        setScaffoldStatus("error");
      }
    };
    init();
  }, [resolvedProjectId]);

  // ─── Toolbar action handlers ────────────────────────────────

  // Download project as ZIP (client-side: fetch all files and create ZIP)
  const handleDownloadZip = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/projects/${resolvedProjectId}/files`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch file list");
      const json = (await res.json()) as { data: string[] };
      const paths = json.data;

      // Fetch all file contents
      const files: { path: string; content: string }[] = [];
      for (const p of paths) {
        try {
          const fRes = await fetch(
            `${API_URL}/projects/${resolvedProjectId}/files/${encodeURIComponent(p)}`,
            { headers: authHeaders() },
          );
          if (fRes.ok) {
            const fJson = (await fRes.json()) as { data: { path: string; content: string } };
            files.push({ path: fJson.data.path, content: fJson.data.content });
          }
        } catch {
          // skip files that fail
        }
      }

      // Create a simple ZIP-like download (TAR as text, or individual files)
      // For simplicity, create a combined text file. For real ZIP, we'd use JSZip.
      // Instead, trigger a download of each file packaged as a single blob
      const boundary = "---FILE_BOUNDARY---";
      let combined = `# ${projectName} - Project Export\n# Generated by Doable\n\n`;
      for (const f of files) {
        combined += `${boundary}\n# File: ${f.path}\n${boundary}\n${f.content}\n\n`;
      }

      const blob = new Blob([combined], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/[^a-zA-Z0-9]/g, "_")}_export.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [resolvedProjectId, projectName]);

  // Duplicate project
  const handleDuplicateProject = useCallback(async () => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      const result = await apiDuplicateProject(resolvedProjectId);
      // Navigate to the new project's editor
      router.push(`/editor/${result.data.id}`);
    } catch (err) {
      console.error("Duplicate failed:", err);
    } finally {
      setIsDuplicating(false);
    }
  }, [resolvedProjectId, isDuplicating, router]);

  // Delete project
  const handleDeleteProject = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await apiDeleteProject(resolvedProjectId);
      setDeleteConfirmOpen(false);
      router.push("/dashboard");
    } catch (err) {
      console.error("Delete failed:", err);
      setIsDeleting(false);
    }
  }, [resolvedProjectId, isDeleting, router]);

  // Copy project link
  const handleCopyProjectLink = useCallback(() => {
    const link = `${window.location.origin}/editor/${resolvedProjectId}`;
    navigator.clipboard.writeText(link).then(() => {
      // Visual feedback handled inline
    });
  }, [resolvedProjectId]);

  // Copy preview URL
  const handleCopyPreviewUrl = useCallback(() => {
    if (previewUrl) {
      navigator.clipboard.writeText(previewUrl).then(() => {
        setShareCopied("preview");
        setTimeout(() => setShareCopied(null), 2000);
      });
    }
  }, [previewUrl]);

  // Copy embed code
  const handleCopyEmbedCode = useCallback(() => {
    if (previewUrl) {
      const embedCode = `<iframe src="${previewUrl}" width="100%" height="600" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>`;
      navigator.clipboard.writeText(embedCode).then(() => {
        setShareCopied("embed");
        setTimeout(() => setShareCopied(null), 2000);
      });
    }
  }, [previewUrl]);

  // Toggle project visibility
  const handleToggleVisibility = useCallback(async () => {
    const newVisibility = projectVisibility === "public" ? "private" : "public";
    setProjectVisibility(newVisibility);
    try {
      await apiUpdateProject(resolvedProjectId, { visibility: newVisibility });
    } catch {
      // Revert on failure
      setProjectVisibility(projectVisibility);
    }
  }, [resolvedProjectId, projectVisibility]);

  // Publish project
  const handlePublish = useCallback(async () => {
    setPublishStatus("building");
    setPublishError(null);
    setPublishBuildLog(null);
    setPublishedUrl(null);

    try {
      const endpoint = publishEnv === "production"
        ? `${API_URL}/deploy/${resolvedProjectId}/publish`
        : `${API_URL}/deploy/${resolvedProjectId}/publish/preview`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ adapter: "doable-cloud" }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: "Publish failed" })) as {
          error?: string;
          data?: { buildLog?: string; errorMessage?: string };
        };
        setPublishError(errJson.data?.errorMessage ?? errJson.error ?? "Publish failed");
        setPublishBuildLog(errJson.data?.buildLog ?? null);
        setPublishStatus("error");
        return;
      }

      const json = (await res.json()) as {
        data: { deploymentId: string; url: string; status: string; durationMs: number };
      };
      setPublishedUrl(json.data.url);
      setPublishStatus("success");
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Publish failed");
      setPublishStatus("error");
    }
  }, [resolvedProjectId, publishEnv]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd + / — toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShowSidebar((v) => !v);
      }
      // Ctrl/Cmd + B — toggle code view
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setActiveTab((t) => (t === "code" ? "chat" : "code"));
      }
      // Ctrl/Cmd + P — toggle preview (only without Shift)
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setActiveTab((t) => (t === "preview" ? "chat" : "preview"));
      }
      // Ctrl/Cmd + Shift + P — open publish
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPublishStatus("idle");
        setPublishError(null);
        setPublishedUrl(null);
        setPublishModalOpen(true);
      }
      // F11 — fullscreen
      if (e.key === "F11") {
        e.preventDefault();
        handleToggleFullscreen();
      }
      // Escape — close any open dialog
      if (e.key === "Escape") {
        if (shareDialogOpen) setShareDialogOpen(false);
        if (publishModalOpen && publishStatus !== "building" && publishStatus !== "deploying") setPublishModalOpen(false);
        if (deleteConfirmOpen && !isDeleting) setDeleteConfirmOpen(false);
        if (githubDialogOpen) setGithubDialogOpen(false);
        if (shortcutsDialogOpen) setShortcutsDialogOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleToggleFullscreen, shareDialogOpen, publishModalOpen, publishStatus, deleteConfirmOpen, isDeleting, githubDialogOpen, shortcutsDialogOpen]);

  // Determine what panels to show based on active tab
  const showChat = activeTab === "chat" || activeTab === "preview" || activeTab === "history" || activeTab === "team" || isPanelView || isDesignMode;
  const showCode = activeTab === "code";
  const showPreview = ((activeTab === "preview" || activeTab === "chat" || activeTab === "history" || activeTab === "team") && !isPanelView) || isDesignMode;

  // ─── Scaffold loading overlay ─────────────────────────────
  const renderScaffoldOverlay = () => {
    if (scaffoldStatus === "ready") return null;

    if (scaffoldStatus === "error") {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600/10 mb-4">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <h3 className="text-sm font-medium text-red-300 mb-2">
            Failed to start project
          </h3>
          <p className="text-[13px] text-zinc-500 max-w-sm mb-4">
            {scaffoldError}
          </p>
          <button
            onClick={retryScaffold}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      );
    }

    // Loading states with friendly messaging
    const statusMsg =
      scaffoldStatus === "scaffolding"
        ? "Setting up your workspace..."
        : scaffoldStatus === "starting"
          ? "Preparing live preview..."
          : "Getting things ready...";

    const subtitleMsg =
      scaffoldStatus === "scaffolding"
        ? "Installing tools and configuring your project"
        : "Starting the live preview so you can see changes instantly";

    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="relative mb-5">
          <div className="h-10 w-10 rounded-full border-2 border-zinc-700 border-t-brand-400 animate-spin" />
          <Sparkles className="absolute inset-0 m-auto h-4 w-4 text-brand-400" />
        </div>
        <h3 className="text-sm font-medium text-zinc-300 mb-1.5">{statusMsg}</h3>
        <p className="text-[13px] text-zinc-600 max-w-[280px]">
          {subtitleMsg}
        </p>
      </div>
    );
  };

  // ─── Collaboration AI sync — show remote users' AI messages ──
  const remoteStreamIdsRef = useRef<Record<string, string>>({});

  const handleRemoteUserMessage = useCallback((data: { messageId: string; userId: string; displayName: string; content: string }) => {
    // Don't show our own messages (we already added them locally)
    if (data.userId === authUser?.id) return;

    // Deterministic color from userId
    const colors = ["#E57373","#F06292","#BA68C8","#9575CD","#7986CB","#64B5F6","#4FC3F7","#4DD0E1","#4DB6AC","#81C784","#AED581","#FFD54F","#FFB74D","#FF8A65","#A1887F","#90A4AE"];
    let hash = 0;
    for (let i = 0; i < data.userId.length; i++) hash = (hash * 31 + data.userId.charCodeAt(i)) | 0;
    const color = colors[Math.abs(hash) % colors.length] ?? "#64B5F6";

    const userMsgId = `remote_user_${data.messageId}`;
    const aiMsgId = `remote_ai_${data.messageId}`;
    remoteStreamIdsRef.current[data.messageId] = aiMsgId;

    setMessages((prev) => {
      const userMsg: ChatMsg = {
        id: userMsgId,
        role: "user" as const,
        content: data.content,
        timestamp: nowTimestamp(),
        senderInfo: { userId: data.userId, displayName: data.displayName, color, isRemote: true },
      };
      // If the assistant message was already auto-created by an early stream-chunk
      // or tool-event, just insert the user message before it instead of duplicating
      const existingIdx = prev.findIndex((m) => m.id === aiMsgId);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy.splice(existingIdx, 0, userMsg);
        return copy;
      }
      return [...prev, userMsg, {
        id: aiMsgId,
        role: "assistant" as const,
        content: "",
        timestamp: nowTimestamp(),
        isStreaming: true,
      }];
    });
  }, [authUser?.id]);

  const handleRemoteStreamChunk = useCallback((data: { messageId: string; chunk: string; isThinking: boolean }) => {
    let aiMsgId = remoteStreamIdsRef.current[data.messageId];

    // Auto-create assistant message if stream starts before ai:message-sent
    if (!aiMsgId) {
      aiMsgId = `remote_ai_${data.messageId}`;
      remoteStreamIdsRef.current[data.messageId] = aiMsgId;
      setMessages((prev) => {
        if (prev.some((m) => m.id === aiMsgId)) return prev;
        return [...prev, {
          id: aiMsgId!,
          role: "assistant" as const,
          content: "",
          timestamp: nowTimestamp(),
          isStreaming: true,
        }];
      });
    }

    if (data.isThinking) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, thinkingContent: (m.thinkingContent ?? "") + data.chunk }
            : m
        )
      );
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId ? { ...m, content: m.content + data.chunk } : m
        )
      );
    }
  }, []);

  const handleRemoteStreamEnd = useCallback((data: { messageId: string; finalContent?: string }) => {
    const aiMsgId = remoteStreamIdsRef.current[data.messageId];
    if (!aiMsgId) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, isStreaming: false } : m
      )
    );
    delete remoteStreamIdsRef.current[data.messageId];
  }, []);

  const handleRemoteToolEvent = useCallback((data: { messageId: string; event: "tool_call" | "tool_result"; toolName: string; args: Record<string, unknown>; friendlyMessage?: string }) => {
    let aiMsgId = remoteStreamIdsRef.current[data.messageId];

    // Auto-create assistant message if tool event arrives before ai:message-sent
    if (!aiMsgId) {
      aiMsgId = `remote_ai_${data.messageId}`;
      remoteStreamIdsRef.current[data.messageId] = aiMsgId;
      setMessages((prev) => {
        if (prev.some((m) => m.id === aiMsgId)) return prev;
        return [...prev, {
          id: aiMsgId!,
          role: "assistant" as const,
          content: "",
          timestamp: nowTimestamp(),
          isStreaming: true,
        }];
      });
    }

    if (data.event === "tool_call") {
      // Add a running tool action card
      const description = data.friendlyMessage || data.toolName.replace(/[_-]/g, " ");
      const filePath = typeof (data.args?.path ?? data.args?.filePath) === "string"
        ? (data.args?.path ?? data.args?.filePath) as string : undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, toolActions: [...(m.toolActions ?? []), {
                id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                toolName: data.toolName,
                description,
                isExpanded: false,
                filePath,
                status: "running" as const,
              }] }
            : m
        )
      );
    } else if (data.event === "tool_result") {
      // Mark the running tool action as completed
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== aiMsgId) return m;
          const runningAction = m.toolActions?.find(
            (a) => a.toolName === data.toolName && a.status === "running"
          );
          if (runningAction) {
            return {
              ...m,
              toolActions: m.toolActions?.map((a) =>
                a.id === runningAction.id ? { ...a, status: "completed" as const } : a
              ),
            };
          }
          return m;
        })
      );
      // Also refresh file tree and preview for file-modifying tools
      loadFileTree();
    }
  }, [loadFileTree]);

  const handleRemoteStatus = useCallback((data: { messageId: string; status: string }) => {
    const aiMsgId = remoteStreamIdsRef.current[data.messageId];
    if (!aiMsgId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, liveStatus: data.status } : m
      )
    );
    setLiveStatus(data.status);
  }, []);

  const handleRemoteError = useCallback((data: { messageId: string; error: string }) => {
    const aiMsgId = remoteStreamIdsRef.current[data.messageId];
    if (!aiMsgId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMsgId ? { ...m, content: `**Error:** ${data.error}`, isStreaming: false, isError: true } : m
      )
    );
  }, []);

  return (
    <CollaborationProvider
      projectId={resolvedProjectId}
      userId={authUser?.id ?? ""}
      displayName={authUser?.displayName ?? ""}
    >
    <>
    <CollabAiSync
      onRemoteUserMessage={handleRemoteUserMessage}
      onRemoteStreamChunk={handleRemoteStreamChunk}
      onRemoteStreamEnd={handleRemoteStreamEnd}
      onRemoteToolEvent={handleRemoteToolEvent}
      onRemoteStatus={handleRemoteStatus}
      onRemoteError={handleRemoteError}
    />
    <div className="flex h-screen flex-col bg-[#1C1C1C] text-zinc-200">
      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#1C1C1C] px-3">
        {/* Left: Logo + Back arrow + Project name with dropdown */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Doable logo icon */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm shadow-md shadow-brand-900/40 hover:from-brand-400 hover:to-brand-600 transition-all"
            title="Back to dashboard"
          >
            D
          </button>

          {/* Editable project name with dropdown chevron + status subtitle */}
          <div className="flex flex-col min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setProjectName(nameInput);
                      setIsEditingName(false);
                      apiUpdateProject(resolvedProjectId, { name: nameInput }).catch(() => {});
                    }
                    if (e.key === "Escape") {
                      setNameInput(projectName);
                      setIsEditingName(false);
                    }
                  }}
                  onBlur={() => {
                    setProjectName(nameInput);
                    setIsEditingName(false);
                    apiUpdateProject(resolvedProjectId, { name: nameInput }).catch(() => {});
                  }}
                  className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white outline-none focus:border-brand-500 w-48"
                />
                <button
                  onClick={() => {
                    setProjectName(nameInput);
                    setIsEditingName(false);
                    apiUpdateProject(resolvedProjectId, { name: nameInput }).catch(() => {});
                  }}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="group flex items-center gap-1 text-sm font-semibold text-white hover:text-white truncate"
              >
                {projectName}
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
              </button>
            )}
            {/* Preview status subtitle */}
            <span className="text-[11px] text-[#9b9a97] leading-tight truncate">
              {isStreaming && liveStatus
                ? liveStatus
                : scaffoldStatus === "ready"
                  ? "Previewing last saved version"
                  : scaffoldStatus === "error"
                    ? "Preview unavailable"
                    : "Loading Live Preview..."}
            </span>
          </div>

          {/* Scaffold status indicator */}
          {scaffoldStatus !== "ready" && scaffoldStatus !== "idle" && scaffoldStatus !== "error" && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 flex-shrink-0">
              <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
              {scaffoldStatus === "scaffolding" ? "Getting ready..." : "Starting..."}
            </div>
          )}
        </div>

        {/* Center: View toggle icon buttons (Lovable-style) */}
        <div className="flex items-center gap-0.5">
          {/* Core toolbar buttons */}
          {([
            { key: "history" as ActiveTab, icon: Clock, label: "History", isToggle: false },
            { key: "chat" as ActiveTab, icon: PanelLeftClose, label: "Toggle sidebar", isToggle: true },
            { key: "preview" as ActiveTab, icon: Globe, label: "Preview", isToggle: false },
            { key: "code" as ActiveTab, icon: Code2, label: "Code", isToggle: false },
            { key: "team" as ActiveTab, icon: Users, label: "Team", isToggle: false },
          ]).map(({ key, icon: Icon, label, isToggle }, idx) => {
            const isActive = !isToggle && activeTab === key;
            return (
              <button
                key={`${key}-${idx}`}
                onClick={() => {
                  if (isToggle) {
                    setShowSidebar((v) => !v);
                  } else {
                    setActiveTab(key);
                  }
                }}
                className={`flex items-center justify-center text-sm transition-all ${
                  isActive
                    ? "gap-1.5 rounded-md bg-[#1E52F1]/10 text-[#4D91FF] px-1.5 py-1"
                    : "rounded-md p-1 text-[#FCFBF8] hover:brightness-125"
                }`}
                style={isActive ? { border: "0.667px solid rgb(77, 145, 255)" } : { border: "0.667px solid rgba(252, 251, 248, 0.4)" }}
                title={label}
              >
                <Icon className="h-4 w-4" />
                {isActive && <span className="text-xs">{label}</span>}
              </button>
            );
          })}

          {/* Pinned items from More menu */}
          {pinnedItems.map((tabKey) => {
            const item = MORE_MENU_ITEMS.find((m) => m.key === tabKey);
            if (!item) return null;
            const IconComp = item.icon;
            const isActive = activeTab === tabKey;
            return (
              <button
                key={`pinned-${tabKey}`}
                onClick={() => setActiveTab(tabKey)}
                className={`flex items-center justify-center text-sm transition-all ${
                  isActive
                    ? "gap-1.5 rounded-md bg-[#1E52F1]/10 text-[#4D91FF] px-1.5 py-1"
                    : "rounded-md p-1 text-[#FCFBF8] hover:brightness-125"
                }`}
                style={isActive ? { border: "0.667px solid rgb(77, 145, 255)" } : { border: "0.667px solid rgba(252, 251, 248, 0.4)" }}
                title={item.label}
              >
                <IconComp className="h-4 w-4" />
                {isActive && <span className="text-xs">{item.label}</span>}
              </button>
            );
          })}

          {/* More menu (triple-dots) */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              className={`flex items-center justify-center text-sm transition-all rounded-md p-1 ${
                showMoreMenu
                  ? "bg-[#1E52F1]/10 text-[#4D91FF]"
                  : "text-[#FCFBF8] hover:brightness-125"
              }`}
              style={showMoreMenu ? { border: "0.667px solid rgb(77, 145, 255)" } : { border: "0.667px solid rgba(252, 251, 248, 0.4)" }}
              title="More views"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {/* Dropdown */}
            {showMoreMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 rounded-lg border border-zinc-700/60 bg-[#232322] shadow-xl shadow-black/40 py-1 z-50">
                {MORE_MENU_ITEMS.map(({ key, icon: MenuIcon, label }) => {
                  const isActive = activeTab === key;
                  const isPinned = pinnedItems.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                        isActive
                          ? "bg-[#1E52F1]/10 text-[#4D91FF]"
                          : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      <button
                        className="flex items-center gap-2.5 flex-1 min-w-0"
                        onClick={() => {
                          setActiveTab(key);
                          setShowMoreMenu(false);
                        }}
                      >
                        <MenuIcon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(key);
                        }}
                        className={`flex-shrink-0 p-1 rounded transition-colors ${
                          isPinned
                            ? "text-[#4D91FF] hover:text-blue-300"
                            : "text-zinc-600 hover:text-zinc-300"
                        }`}
                        title={isPinned ? "Unpin from toolbar" : "Pin to toolbar"}
                      >
                        {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Preview controls inline in top bar */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-full bg-[#272725] border border-zinc-700/40 px-2.5 py-1">
            <Globe className="h-3 w-3 text-zinc-500" />
            <span className="text-[11px] text-zinc-400 font-mono">/</span>
          </div>
          <div className="flex items-center rounded-full bg-[#272725] border border-zinc-700/40 p-0.5">
            {([
              { mode: "desktop" as DeviceMode, Icon: Monitor, label: "Desktop" },
              { mode: "tablet" as DeviceMode, Icon: Tablet, label: "Tablet (768px)" },
              { mode: "mobile" as DeviceMode, Icon: Smartphone, label: "Mobile (375px)" },
            ]).map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setDeviceMode(mode)}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                  deviceMode === mode
                    ? "bg-zinc-600 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={label}
              >
                <Icon className="h-3 w-3" />
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (iframeRef.current && previewUrl) {
                iframeRef.current.src = previewUrl;
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-[#272725] hover:text-zinc-300 transition-colors"
            title="Refresh preview"
            disabled={!previewUrl}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (previewUrl) window.open(previewUrl, "_blank");
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-[#272725] hover:text-zinc-300 transition-colors"
            title="Open in new tab"
            disabled={!previewUrl}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-[#272725] hover:text-zinc-300 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Right: Triple-dots + Share + GitHub + Upgrade + Publish */}
        <div className="flex items-center gap-1.5">
          {/* Triple-dots menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-7 w-7 items-center justify-center rounded-md bg-[#272725] text-[#FCFBF8] hover:brightness-125 transition-colors"
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-[#1C1C1C] border-zinc-700 text-zinc-200" align="end">
              <DropdownMenuItem
                className="gap-2 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                onClick={() => router.push(`/projects/${resolvedProjectId}/settings`)}
              >
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                onClick={handleDownloadZip}
              >
                <Download className="h-4 w-4" />
                Download project
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                onClick={handleDuplicateProject}
              >
                <CopyPlus className="h-4 w-4" />
                {isDuplicating ? "Duplicating..." : "Duplicate project"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                onClick={handleCopyProjectLink}
              >
                <Link className="h-4 w-4" />
                Copy project link
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                onClick={() => setShortcutsDialogOpen(true)}
              >
                <Keyboard className="h-4 w-4" />
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem
                className="gap-2 text-red-400 hover:bg-red-950/50 hover:text-red-300 cursor-pointer"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Collaboration presence avatars */}
          <CollabHeaderItems />

          {/* Share: pill with muted bg, h-7 */}
          <button
            onClick={() => setShareDialogOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-full bg-[#272725] px-2.5 text-sm text-[#FCFBF8] hover:bg-[#333] transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden lg:inline">Share</span>
          </button>
          {/* GitHub: rounded-md 6px, muted bg */}
          <button
            onClick={() => setGithubDialogOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#272725] text-[#FCFBF8] hover:brightness-125 transition-colors"
            title="Sync with GitHub"
          >
            <Github className="h-4 w-4" />
          </button>
          {/* Upgrade */}
          <button
            onClick={() => router.push("/billing")}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[#5337CD] px-2.5 text-sm text-[#F0F6FF] hover:brightness-110 transition-colors"
            style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(255,255,255,0.1) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
          >
            <Zap className="h-4 w-4" />
            Upgrade
          </button>
          {/* Publish */}
          <button
            onClick={() => {
              setPublishStatus("idle");
              setPublishError(null);
              setPublishedUrl(null);
              setPublishModalOpen(true);
            }}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[#1E52F1] px-2.5 text-sm text-[#F0F6FF] hover:brightness-110 transition-colors"
            style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(255,255,255,0.1) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
          >
            Publish
          </button>
        </div>
      </header>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* ─── Chat Panel ───────────────────────────────────── */}
        {showChat && (
          <div
            className="flex flex-col border-r border-zinc-800/60 bg-[#1C1C1C]"
            style={{
              width: (showPreview || isPanelView) ? `${splitPos}%` : "100%",
              minWidth: "320px",
            }}
          >
            {/* ─── Design Mode: Show DesignPanel ─────────────── */}
            {isDesignMode ? (
              <DesignPanel
                projectId={resolvedProjectId}
                onClose={handlePanelClose}
                onSendMessage={sendMessage}
                mode={visualEdit.mode}
                selectedElement={visualEdit.selectedElement}
                onActivate={visualEdit.activateVisualEdit}
                onDeactivate={visualEdit.deactivateVisualEdit}
                onSelectParent={visualEdit.selectParent}
                onDeselectElement={visualEdit.deselectElement}
                onApplyLiveStyle={visualEdit.applyLiveStyle}
                onApplyLiveText={visualEdit.applyLiveText}
                hasPendingChanges={visualEdit.hasPendingChanges}
                onCommitChanges={() => {
                  visualEdit.commitChanges();
                  setActiveTab("chat");
                }}
                onDiscardChanges={visualEdit.discardChanges}
                onDirectSave={visualEdit.directSave}
                isSaving={visualEdit.isSaving}
              />
            ) : activeTab === "team" ? (
              <CollabTeamChatWrapper currentUserId={authUser?.id ?? ""} />
            ) : (
            <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600/10 mb-4">
                    <Sparkles className="h-6 w-6 text-brand-400" />
                  </div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-1">
                    Start a conversation
                  </h3>
                  <p className="text-[13px] text-zinc-600 max-w-[280px]">
                    Describe what you want to build and Doable AI will generate
                    the code for you.
                  </p>
                  {/* Mode indicator in empty state */}
                  <div className="mt-4 flex items-center gap-2 rounded-full bg-zinc-800/60 px-3 py-1.5 text-[12px] text-zinc-500">
                    {chatMode === "agent" ? (
                      <>
                        <Bot className="h-3.5 w-3.5 text-brand-400" />
                        <span>Agent mode — generates code</span>
                      </>
                    ) : (
                      <>
                        <ClipboardList className="h-3.5 w-3.5 text-blue-400" />
                        <span>Plan mode — creates plans only</span>
                      </>
                    )}
                  </div>
                  {/* Prompt starter chips in empty state */}
                  <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-[360px]">
                    {[
                      "Build a SaaS landing page",
                      "Create a kanban task board",
                      "Make a recipe sharing app",
                      "Design a portfolio site",
                    ].map((starter) => (
                      <button
                        key={starter}
                        onClick={() => sendMessage(starter)}
                        className="rounded-full border border-zinc-700/50 bg-zinc-800/60 px-3.5 py-1.5 text-[13px] text-zinc-300 hover:bg-zinc-700/60 hover:text-white hover:border-zinc-600 transition-all"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, msgIdx) => (
                <div key={msg.id} className="group">
                  {msg.role === "user" ? (
                    msg.senderInfo?.isRemote ? (
                      /* ── Remote collaborator message: left-aligned with user color ── */
                      <div className="flex items-start gap-2.5">
                        <div
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white mt-0.5"
                          style={{ backgroundColor: msg.senderInfo.color }}
                        >
                          {msg.senderInfo.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="max-w-[85%]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium" style={{ color: msg.senderInfo.color }}>
                              {msg.senderInfo.displayName}
                            </span>
                            <span className="text-[10px] text-zinc-700">
                              {msg.timestamp}
                            </span>
                          </div>
                          <div
                            className="rounded-2xl rounded-tl-sm bg-zinc-800/60 px-4 py-2.5 text-[14px] leading-relaxed text-zinc-200"
                            style={{ borderLeft: `3px solid ${msg.senderInfo.color}` }}
                          >
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.attachments.map((att, ai) => (
                                  <img
                                    key={ai}
                                    src={att.data}
                                    alt={att.name}
                                    className="h-20 w-20 rounded-lg object-cover border border-zinc-600"
                                  />
                                ))}
                              </div>
                            )}
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ── Own message: right-aligned dark bubble (iMessage style) ── */
                      <div className="flex justify-end">
                        <div className="max-w-[85%]">
                          <div className="flex items-center justify-end gap-2 mb-1">
                            <span className="text-[10px] text-zinc-700">
                              {msg.timestamp}
                            </span>
                            <span className="text-xs font-medium text-zinc-400">
                              You
                            </span>
                          </div>
                          <div className="rounded-2xl rounded-br-sm bg-zinc-700/80 px-4 py-2.5 text-[14px] leading-relaxed text-zinc-100">
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.attachments.map((att, ai) => (
                                  <img
                                    key={ai}
                                    src={att.data}
                                    alt={att.name}
                                    className="h-20 w-20 rounded-lg object-cover border border-zinc-600"
                                  />
                                ))}
                              </div>
                            )}
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    /* ── Assistant message: left-aligned ── */
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/20 mt-0.5">
                        {msg.isError ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-medium ${
                              msg.isError
                                ? "text-red-400"
                                : "text-brand-400"
                            }`}
                          >
                            {msg.isError ? "Error" : "Doable AI"}
                          </span>
                          <span className="text-[10px] text-zinc-700">
                            {msg.timestamp}
                          </span>
                          {msg.isStreaming && !msg.content && (
                            <span className="flex items-center gap-1">
                              <span className="status-dot-1 h-1 w-1 rounded-full bg-brand-400" />
                              <span className="status-dot-2 h-1 w-1 rounded-full bg-brand-400" />
                              <span className="status-dot-3 h-1 w-1 rounded-full bg-brand-400" />
                            </span>
                          )}
                          {msg.isStreaming && msg.content && (
                            <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
                          )}
                        </div>

                        {/* ── Task Card: collapsible card with tool actions ── */}
                        {msg.toolActions && msg.toolActions.length > 0 && (
                          <div className="mb-3 rounded-xl border border-zinc-700/50 bg-zinc-800/40 overflow-hidden">
                            {/* Card header — clickable to collapse/expand */}
                            <button
                              onClick={() => toggleTaskCardCollapse(msg.id)}
                              className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-zinc-800/60 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600/20">
                                  <Wrench className="h-3.5 w-3.5 text-brand-400" />
                                </div>
                                <span className="text-[13px] font-medium text-zinc-200 truncate">
                                  {msg.toolActions.length === 1
                                    ? msg.toolActions[0]!.description
                                    : `${msg.toolActions.length} file changes`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[11px] text-zinc-600">
                                  {msg.toolActions.length} {msg.toolActions.length === 1 ? "action" : "actions"}
                                </span>
                                {collapsedTaskCards.has(msg.id) ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                                )}
                              </div>
                            </button>

                            {/* Card body — only shown when not collapsed */}
                            {!collapsedTaskCards.has(msg.id) && (
                              <div className="border-t border-zinc-700/30">
                                {/* Tabs: Details | Preview */}
                                <div className="flex border-b border-zinc-700/30">
                                  <button
                                    onClick={() => setTaskCardTabs((prev) => ({ ...prev, [msg.id]: "details" }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                      (taskCardTabs[msg.id] ?? "details") === "details"
                                        ? "text-brand-400 border-b-2 border-brand-400"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    <ListChecks className="h-3 w-3" />
                                    Details
                                  </button>
                                  <button
                                    onClick={() => setTaskCardTabs((prev) => ({ ...prev, [msg.id]: "preview" }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                      taskCardTabs[msg.id] === "preview"
                                        ? "text-brand-400 border-b-2 border-brand-400"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    <Eye className="h-3 w-3" />
                                    Preview
                                  </button>
                                </div>

                                {/* Tab content */}
                                {(taskCardTabs[msg.id] ?? "details") === "details" ? (
                                  <div className="p-2 space-y-1">
                                    {msg.toolActions.map((action) => (
                                      <div
                                        key={action.id}
                                        className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-zinc-700/30 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          {action.status === "running" ? (
                                            <div className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-blue-400 animate-pulse" />
                                          ) : (
                                            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                                              action.toolName.toLowerCase().includes("create") || action.toolName.toLowerCase().includes("write")
                                                ? "bg-emerald-400"
                                                : action.toolName.toLowerCase().includes("edit") || action.toolName.toLowerCase().includes("update")
                                                  ? "bg-amber-400"
                                                  : action.toolName.toLowerCase().includes("delete")
                                                    ? "bg-red-400"
                                                    : "bg-zinc-400"
                                            }`} />
                                          )}
                                          <span className="text-zinc-300 truncate">
                                            {action.description}
                                            {action.status === "running" && (
                                              <span className="ml-1.5 text-[11px] text-brand-400/70 animate-pulse">in progress</span>
                                            )}
                                          </span>
                                          {action.filePath && (
                                            <span className="text-[11px] text-zinc-600 truncate hidden sm:inline">
                                              {action.filePath}
                                            </span>
                                          )}
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleBookmark(msg.id, action.id);
                                          }}
                                          className="flex-shrink-0 p-1 rounded hover:bg-zinc-700/50 transition-colors"
                                          title={action.isBookmarked ? "Remove bookmark" : "Bookmark this version"}
                                        >
                                          {action.isBookmarked ? (
                                            <BookmarkCheck className="h-3.5 w-3.5 text-brand-400" />
                                          ) : (
                                            <Bookmark className="h-3.5 w-3.5 text-zinc-600 hover:text-zinc-400" />
                                          )}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  /* Preview tab — shows a mini preview placeholder */
                                  <div className="p-4 flex items-center justify-center">
                                    <div className="text-center">
                                      <div className="flex h-16 w-24 mx-auto items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-900/40 mb-2">
                                        <Eye className="h-5 w-5 text-zinc-600" />
                                      </div>
                                      <p className="text-[11px] text-zinc-600">
                                        Preview updates in the right panel
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Inline thinking indicator */}
                        {msg.thinkingContent && msg.isStreaming && (
                          <details className="mb-2 rounded-lg border border-zinc-700/40 bg-zinc-900/30 text-[13px]">
                            <summary className="cursor-pointer select-none px-3 py-1.5 text-zinc-500 hover:text-zinc-400 flex items-center gap-2">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
                              Thinking...
                            </summary>
                            <div className="px-3 pb-2 text-zinc-500 whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {msg.thinkingContent}
                            </div>
                          </details>
                        )}

                        <div
                          className={`text-[14px] leading-relaxed ${
                            msg.isError
                              ? "text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2"
                              : "text-zinc-300"
                          }`}
                        >
                          {msg.content
                            ? <MemoizedMessageContent content={msg.content} />
                            : msg.isStreaming && (
                                <div className="status-shimmer-bg rounded-lg px-3 py-2.5 -mx-1">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                      <span className="status-dot-1 h-1.5 w-1.5 rounded-full bg-brand-400" />
                                      <span className="status-dot-2 h-1.5 w-1.5 rounded-full bg-brand-400" />
                                      <span className="status-dot-3 h-1.5 w-1.5 rounded-full bg-brand-400" />
                                    </div>
                                    <span key={liveStatus || "default"} className="status-text-enter text-[13px] text-zinc-400">
                                      {liveStatus || "Understanding your request..."}
                                    </span>
                                  </div>
                                </div>
                              )}
                          {msg.isStreaming && msg.content && (
                            <span className="inline-block w-1.5 h-4 bg-brand-400 animate-pulse ml-0.5 align-middle rounded-sm" />
                          )}
                        </div>

                        {/* ── Message Actions: feedback + copy + more menu ── */}
                        {!msg.isStreaming && !msg.isError && msg.content && (
                          <div className="mt-2 flex items-center gap-0.5">
                            {/* Thumbs Up */}
                            <button
                              onClick={() => handleFeedback(msg.id, "up")}
                              className={`rounded-md p-1.5 transition-colors ${
                                msg.feedbackGiven === "up"
                                  ? "bg-emerald-900/30 text-emerald-400"
                                  : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                              }`}
                              title="Good response"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            {/* Thumbs Down */}
                            <button
                              onClick={() => handleFeedback(msg.id, "down")}
                              className={`rounded-md p-1.5 transition-colors ${
                                msg.feedbackGiven === "down"
                                  ? "bg-red-900/30 text-red-400"
                                  : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                              }`}
                              title="Bad response"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                            {/* Copy */}
                            <button
                              className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                              title="Copy message"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content).then(() => {
                                  setCopiedMsgId(msg.id);
                                  setTimeout(() => setCopiedMsgId(null), 2000);
                                });
                              }}
                            >
                              {copiedMsgId === msg.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {/* More (...) with dropdown */}
                            <div className="relative" data-more-menu>
                              <button
                                onClick={() => setMoreMenuMsgId(moreMenuMsgId === msg.id ? null : msg.id)}
                                className={`rounded-md p-1.5 transition-colors ${
                                  moreMenuMsgId === msg.id
                                    ? "bg-zinc-800 text-zinc-300"
                                    : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                                }`}
                                title="More actions"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                              {/* Dropdown menu */}
                              {moreMenuMsgId === msg.id && (
                                <div className="absolute left-0 top-full mt-1 z-50 w-48 rounded-lg border border-zinc-700/60 bg-zinc-800 py-1 shadow-xl shadow-black/40">
                                  <button
                                    onClick={() => {
                                      setMoreMenuMsgId(null);
                                      // Copy to clipboard as "edit" prompt
                                      setInputValue(`Edit: ${msg.content.slice(0, 100)}`);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                    Edit message
                                  </button>
                                  <button
                                    onClick={() => handleRevertToPoint(msg.id)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                                  >
                                    <Undo2 className="h-3.5 w-3.5 text-zinc-500" />
                                    Revert to this point
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Suggestion Chips: scrollable row after last AI response ── */}
                        {!msg.isStreaming &&
                          !msg.isError &&
                          msg.content &&
                          !isStreaming &&
                          (msgIdx === messages.length - 1 || (msg.suggestions && msg.suggestions.length > 0)) && (
                            <div className="mt-3 -mx-1">
                              <div className="flex flex-wrap gap-2 px-1 pb-1">
                                {(msgIdx === messages.length - 1 && aiSuggestions.length > 0 ? aiSuggestions : (msg.suggestions || [])).map((suggestion) => (
                                  <button
                                    key={suggestion}
                                    onClick={() => sendMessage(suggestion)}
                                    className="rounded-full border border-zinc-700/50 bg-zinc-800/60 px-3.5 py-1.5 text-[13px] text-zinc-300 hover:bg-zinc-700/60 hover:text-white hover:border-zinc-600 transition-all"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* "Back to Chat" link when viewing a panel */}
            {isPanelView && (
              <button
                onClick={handlePanelClose}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:text-white border-t border-zinc-800/40 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Chat
              </button>
            )}

            {/* ── Stop Generation Button (floating above input) ── */}
            {isStreaming && (
              <div className="flex justify-center px-4 -mb-1">
                <button
                  onClick={handleStopStreaming}
                  className="flex items-center gap-2 rounded-full border border-zinc-600/60 bg-zinc-800/90 px-4 py-2 text-[13px] font-medium text-zinc-200 shadow-lg shadow-black/30 hover:bg-zinc-700/90 hover:border-zinc-500/60 transition-all backdrop-blur-sm"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop Doable
                </button>
              </div>
            )}

            {/* Typing indicator from collaborators */}
            <CollabChatTyping keystrokeSignal={keystrokeSignal} />

            {/* Input area */}
            <div className="border-t border-zinc-800/60">
              {/* Credits bar */}
              {showCreditsBar && (
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/40">
                  <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    <span>5 credits remaining</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push("/billing")}
                      className="text-[12px] font-medium text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      Add credits
                    </button>
                    <button
                      onClick={() => setShowCreditsBar(false)}
                      className="p-0.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Chat input toolbar */}
              <div className="px-2 py-2">
                <div className="rounded-3xl bg-[#272725] border border-[#40403F] p-3 focus-within:border-brand-500/50 focus-within:ring-1 focus-within:ring-brand-500/20 transition-all">
                  {/* Textarea */}
                  <textarea
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setKeystrokeSignal((s) => s + 1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask Doable..."
                    rows={2}
                    disabled={isStreaming}
                    className="w-full resize-none bg-transparent px-1 pt-0 pb-1 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none disabled:opacity-50"
                  />

                  {/* Image preview thumbnails */}
                  {imageAttachments.attachments.length > 0 && (
                    <div className="flex items-center gap-2 px-1 pb-2">
                      {imageAttachments.attachments.map((att, i) => (
                        <div key={i} className="relative group/thumb">
                          <img
                            src={att.data}
                            alt={att.name}
                            className="h-16 w-16 rounded-lg object-cover border border-zinc-600"
                          />
                          <button
                            onClick={() => imageAttachments.removeImage(i)}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white hover:bg-red-600 hover:border-red-600 transition-colors opacity-0 group-hover/thumb:opacity-100"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hidden file input for image attachments */}
                  <input
                    ref={imageAttachments.fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={imageAttachments.handleFileChange}
                  />

                  {/* Bottom toolbar row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {/* + button (rounded-full) */}
                      <button
                        onClick={imageAttachments.openFilePicker}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600/40 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
                        title="Attach image"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      {/* Visual edits button (pill) */}
                      <button
                        onClick={() => setActiveTab("design")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[13px] transition-colors",
                          isDesignMode
                            ? "border-brand-500/50 bg-brand-500/10 text-brand-300"
                            : "border-zinc-600/40 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                        )}
                        title="Visual edits"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Visual edits</span>
                      </button>

                      {/* Model selector — hidden unless admin enables it */}
                      {(effectiveAiConfig?.show_model_selector ?? false) && (
                        <EditorModelSelector
                          selectedModelId={selectedModelId}
                          selectedProviderId={selectedProviderId}
                          selectedCopilotAccountId={selectedCopilotAccountId}
                          onSelect={handleModelSelect}
                          models={availableModels}
                          disabled={effectiveAiConfig?.enforce_ai ?? false}
                          enforcedLabel={effectiveAiConfig?.enforce_ai ? `Enforced: ${effectiveAiConfig.enforced_model ?? 'Default'}` : undefined}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* ── Agent / Plan Mode Toggle ── */}
                      <div className="flex items-center rounded-full border border-zinc-600/40 overflow-hidden">
                        <button
                          onClick={() => setChatMode("agent")}
                          className={`flex items-center gap-1 px-2 h-7 text-[12px] font-medium transition-all ${
                            chatMode === "agent"
                              ? "bg-brand-600/20 text-brand-300"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                          title="Agent mode — generates code"
                        >
                          <Bot className="h-3 w-3" />
                          <span className="hidden sm:inline">Agent</span>
                        </button>
                        <div className="w-px h-4 bg-zinc-600/40" />
                        <button
                          onClick={() => setChatMode("plan")}
                          className={`flex items-center gap-1 px-2 h-7 text-[12px] font-medium transition-all ${
                            chatMode === "plan"
                              ? "bg-blue-600/20 text-blue-300"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                          title="Plan mode — creates plans only"
                        >
                          <ClipboardList className="h-3 w-3" />
                          <span className="hidden sm:inline">Plan</span>
                        </button>
                      </div>

                      {/* Mic button (rounded-full) — hidden on unsupported browsers */}
                      {speechRecognition.isSupported && (
                        <button
                          onClick={speechRecognition.toggle}
                          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                            speechRecognition.isListening
                              ? "text-red-400 bg-red-500/10 animate-pulse"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50"
                          }`}
                          title={speechRecognition.isListening ? "Stop recording" : "Voice input"}
                        >
                          <Mic className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Send / Stop button */}
                      {isStreaming ? (
                        <button
                          onClick={handleStopStreaming}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-600/80 text-white transition-all hover:bg-red-500"
                          title="Stop generation"
                        >
                          <Square className="h-3 w-3 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={handleSend}
                          disabled={!inputValue.trim() && imageAttachments.attachments.length === 0}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#FCFBF8] text-[#1C1C1C] transition-all hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── "Back to Chat" link when on non-chat tabs ── */}
              {activeTab !== "chat" && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={() => setActiveTab("chat")}
                    className="flex items-center gap-1.5 text-[12px] text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Back to Chat
                  </button>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}

        {/* ─── Code Panel ───────────────────────────────────── */}
        {showCode && (
          <div className="flex flex-1 overflow-hidden bg-[#1C1C1C]">
            {/* File tree sidebar */}
            <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-zinc-800/60 bg-[#1a1917] py-2">
              <div className="mb-1 px-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                  Explorer
                </span>
                {fileTreeLoading && (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />
                )}
              </div>
              {scaffoldStatus !== "ready" ? (
                <div className="px-3 py-4 text-center">
                  {scaffoldStatus === "error" ? (
                    <p className="text-[12px] text-red-400">Failed to load</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
                      <p className="text-[12px] text-zinc-600">Loading files...</p>
                    </div>
                  )}
                </div>
              ) : fileTreeError ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-[12px] text-red-400 mb-2">{fileTreeError}</p>
                  <button
                    onClick={loadFileTree}
                    className="text-[11px] text-brand-400 hover:text-brand-300"
                  >
                    Retry
                  </button>
                </div>
              ) : fileTree.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-[12px] text-zinc-600">No files yet</p>
                  <p className="text-[11px] text-zinc-700 mt-1">
                    Ask the AI to create some files
                  </p>
                </div>
              ) : (
                renderTree(fileTree)
              )}
            </div>

            {/* Code display with Monaco editor */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Multi-tab bar */}
              <div className="flex h-9 items-center overflow-x-auto border-b border-zinc-800/60 bg-[#252526]">
                {openFileTabs.length > 0 ? (
                  openFileTabs.map((tab) => {
                    const isActiveTab = tab.path === selectedFile;
                    return (
                      <div
                        key={tab.path}
                        className={`group flex h-full items-center gap-1.5 border-r border-zinc-800/40 px-3 text-xs cursor-pointer select-none transition-colors ${
                          isActiveTab
                            ? "bg-[#1e1e1e] text-zinc-200"
                            : "text-zinc-500 hover:bg-[#2a2a2b] hover:text-zinc-300"
                        }`}
                        onClick={() => {
                          setSelectedFile(tab.path);
                          const cached = fileContentsCache.current[tab.path];
                          if (cached !== undefined) {
                            setFileContent(cached);
                          } else {
                            loadFileContent(tab.path);
                          }
                        }}
                      >
                        <FileCode2 className="h-3 w-3 flex-none text-zinc-500" />
                        <span className="truncate max-w-[120px]">{tab.name}</span>
                        <FileTabPresenceDots filePath={tab.path} currentUserId={authUser?.id ?? ""} />
                        {tab.isDirty && (
                          <Circle className="h-2 w-2 flex-none fill-current text-brand-400" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeFileTab(tab.path);
                          }}
                          className="flex h-4 w-4 flex-none items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
                          title="Close (Ctrl+W)"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-1.5 text-[12px] text-zinc-600">
                    No file selected
                  </div>
                )}

                {/* Minimap toggle */}
                <div className="ml-auto flex items-center gap-1 px-2">
                  <button
                    onClick={() => setShowMinimap((v) => !v)}
                    className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                      showMinimap
                        ? "text-brand-400 bg-zinc-800"
                        : "text-zinc-600 hover:text-zinc-400"
                    }`}
                    title={showMinimap ? "Hide minimap" : "Show minimap"}
                  >
                    <Map className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Breadcrumb */}
              {selectedFile && (
                <div className="flex h-6 items-center border-b border-zinc-800/40 bg-[#1e1e1e] px-3">
                  <span className="text-[11px] text-zinc-600 font-mono truncate">
                    {selectedFile}
                  </span>
                </div>
              )}

              {/* Editor content */}
              {!selectedFile ? (
                <div className="flex flex-1 items-center justify-center bg-[#1e1e1e]">
                  <div className="text-center px-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/60 mx-auto mb-3">
                      <Code2 className="h-6 w-6 text-zinc-600" />
                    </div>
                    <p className="text-sm text-zinc-500 mb-1">
                      Select a file from the explorer
                    </p>
                    <p className="text-xs text-zinc-700">
                      Click on any file to view its content
                    </p>
                    <div className="mt-4 flex flex-col gap-1 text-[11px] text-zinc-700">
                      <span>Ctrl+S to save</span>
                      <span>Ctrl+F to search</span>
                      <span>Ctrl+H to replace</span>
                      <span>Ctrl+W to close tab</span>
                    </div>
                  </div>
                </div>
              ) : fileContentLoading ? (
                <div className="flex flex-1 items-center justify-center bg-[#1e1e1e]">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
                    <p className="text-sm text-zinc-500">Loading file...</p>
                  </div>
                </div>
              ) : fileContentError ? (
                <div className="flex flex-1 items-center justify-center bg-[#1e1e1e]">
                  <div className="text-center px-8">
                    <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                    <p className="text-sm text-red-300 mb-2">{fileContentError}</p>
                    <button
                      onClick={() => loadFileContent(selectedFile)}
                      className="text-sm text-brand-400 hover:text-brand-300"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : fileContent !== null ? (
                <div className="flex-1 overflow-hidden">
                  <CollaborativeMonacoWrapper
                    EditorComponent={MonacoEditorWrapper}
                    value={fileContent}
                    language={detectLanguage(selectedFile.split("/").pop() ?? "")}
                    filePath={selectedFile}
                    readOnly={false}
                    onChange={handleMonacoChange}
                    onSave={handleMonacoSave}
                    showMinimap={showMinimap}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center bg-[#1e1e1e]">
                  <div className="text-center px-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/60 mx-auto mb-3">
                      <Code2 className="h-6 w-6 text-zinc-600" />
                    </div>
                    <p className="text-sm text-zinc-500 mb-1">
                      Code will appear here as the AI generates files
                    </p>
                    <p className="text-xs text-zinc-700">
                      Start a conversation in the Chat tab to generate your
                      project
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Resize Handle ────────────────────────────────── */}
        {showChat && (showPreview || isPanelView) && (
          <div
            className="group relative z-20 w-1 flex-shrink-0 cursor-col-resize"
            onMouseDown={handleMouseDown}
          >
            <div
              className={`absolute inset-y-0 -left-px w-[3px] transition-colors ${
                isDragging
                  ? "bg-brand-500"
                  : "bg-transparent group-hover:bg-brand-500/40"
              }`}
            />
          </div>
        )}

        {/* ─── Preview Panel ────────────────────────────────── */}
        {showPreview && !showCode && (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#1C1C1C]">
            {/* Preview iframe or loading state */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#141412] p-2">
              {scaffoldStatus !== "ready" || !previewUrl ? (
                renderScaffoldOverlay()
              ) : (
                <div
                  className={`h-full overflow-hidden bg-white transition-all duration-300 ${
                    deviceMode === "mobile"
                      ? "w-[375px] rounded-[24px] shadow-2xl shadow-black/40"
                      : deviceMode === "tablet"
                        ? "w-[768px] rounded-2xl shadow-xl shadow-black/30"
                        : "w-full rounded-2xl"
                  }`}
                  style={
                    deviceMode === "mobile"
                      ? {
                          maxHeight: "calc(100% - 16px)",
                          border: "4px solid #1e1e2e",
                        }
                      : deviceMode === "tablet"
                        ? {
                            maxWidth: "100%",
                            border: "3px solid #1e1e2e",
                          }
                        : {}
                  }
                >
                  {/* Mobile notch mockup */}
                  {deviceMode === "mobile" && (
                    <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2">
                      <div className="h-[22px] w-[120px] rounded-b-xl bg-[#1e1e2e]" />
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    className="h-full w-full border-0"
                    title="App Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              )}
              {/* ─── First Generation Loading Overlay ──────────── */}
              {isFirstGeneration && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#141412]">
                  <div className="relative mb-6">
                    <div className="h-12 w-12 rounded-full border-2 border-zinc-700 border-t-brand-400 animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-brand-400" />
                  </div>
                  <h3 className="text-base font-medium text-zinc-200 mb-2">Building your app...</h3>
                  <p className="text-sm text-zinc-500 max-w-[280px] text-center mb-4">
                    {liveStatus || "Setting things up"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot-1 h-1.5 w-1.5 rounded-full bg-brand-400" />
                    <span className="status-dot-2 h-1.5 w-1.5 rounded-full bg-brand-400" />
                    <span className="status-dot-3 h-1.5 w-1.5 rounded-full bg-brand-400" />
                  </div>
                </div>
              )}
              {/* ─── Visual Edit Floating Toolbar ────────────── */}
              {isDesignMode && visualEdit.selectedElement && (
                <VisualEditToolbar
                  elementRect={visualEdit.selectedElement.boundingRect}
                  iframeRect={iframeRect}
                  hasPendingChanges={visualEdit.hasPendingChanges}
                  onSubmitPrompt={(prompt) => {
                    visualEdit.sendElementPrompt(prompt);
                    // Switch to chat so user sees the AI working
                    setActiveTab("chat");
                  }}
                  onSelectParent={visualEdit.selectParent}
                  onViewCode={() => {
                    setActiveTab("code");
                  }}
                  onDelete={() => {
                    visualEdit.deleteElement();
                    // Switch to chat so user sees the AI working
                    setActiveTab("chat");
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ─── Full Panel Views (Cloud, Analytics, Files, Security, Speed) ── */}
        {isPanelView && (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#1C1C1C]">
            {activeTab === "cloud" && (
              <CloudPanel projectId={resolvedProjectId} onClose={handlePanelClose} />
            )}
            {activeTab === "analytics" && (
              <AnalyticsPanel projectId={resolvedProjectId} onClose={handlePanelClose} />
            )}
            {activeTab === "files" && (
              <FilesPanel projectId={resolvedProjectId} onClose={handlePanelClose} />
            )}
            {activeTab === "security" && (
              <SecurityPanel projectId={resolvedProjectId} onClose={handlePanelClose} />
            )}
            {activeTab === "speed" && (
              <SpeedPanel projectId={resolvedProjectId} onClose={handlePanelClose} onSendMessage={sendMessage} />
            )}
            {activeTab === "connectors" && (
              <ConnectorsPanel workspaceId={typeof window !== "undefined" ? localStorage.getItem("doable_active_workspace_id") ?? "" : ""} />
            )}
            {activeTab === "skills" && (
              <SkillsPanel workspaceId={typeof window !== "undefined" ? localStorage.getItem("doable_active_workspace_id") ?? "" : ""} projectId={resolvedProjectId} />
            )}
          </div>
        )}
      </div>

      {/* ─── Share Dialog ──────────────────────────────────────── */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="bg-[#1C1C1C] border-zinc-700 text-zinc-200 max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-white">Share Project</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Share your project with others or embed it on your website.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Preview URL */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Preview URL</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-400 font-mono truncate">
                  {previewUrl ?? "Not available yet"}
                </div>
                <button
                  onClick={handleCopyPreviewUrl}
                  disabled={!previewUrl}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  title="Copy URL"
                >
                  {shareCopied === "preview" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Visibility Toggle */}
            <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
              <div className="flex items-center gap-3">
                {projectVisibility === "public" ? (
                  <Eye className="h-4 w-4 text-emerald-400" />
                ) : (
                  <EyeOff className="h-4 w-4 text-zinc-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {projectVisibility === "public" ? "Public" : "Private"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {projectVisibility === "public"
                      ? "Anyone with the link can view"
                      : "Only you can access this project"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleVisibility}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  projectVisibility === "public" ? "bg-emerald-600" : "bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    projectVisibility === "public" ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Embed Code */}
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Embed Code</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-400 font-mono truncate">
                  {previewUrl
                    ? `<iframe src="${previewUrl}" ...>`
                    : "Preview not available yet"}
                </div>
                <button
                  onClick={handleCopyEmbedCode}
                  disabled={!previewUrl}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  title="Copy embed code"
                >
                  {shareCopied === "embed" ? <Check className="h-4 w-4 text-emerald-400" /> : <Code className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button
              onClick={() => setShareDialogOpen(false)}
              className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Publish Modal ─────────────────────────────────────── */}
      <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <DialogContent className="bg-[#1C1C1C] border-zinc-700 text-zinc-200 max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Rocket className="h-5 w-5 text-blue-400" />
              Publish Project
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Deploy your project to make it live on the web.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Environment selection */}
            {publishStatus === "idle" && (
              <>
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Environment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPublishEnv("production")}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 text-sm transition-all ${
                        publishEnv === "production"
                          ? "border-blue-500 bg-blue-500/10 text-blue-300"
                          : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <Globe className="h-5 w-5" />
                      <span className="font-medium">Live</span>
                      <span className="text-xs opacity-70">Production deploy</span>
                    </button>
                    <button
                      onClick={() => setPublishEnv("preview")}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 text-sm transition-all ${
                        publishEnv === "preview"
                          ? "border-blue-500 bg-blue-500/10 text-blue-300"
                          : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      <Eye className="h-5 w-5" />
                      <span className="font-medium">Test</span>
                      <span className="text-xs opacity-70">Preview deploy</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handlePublish}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-[#1E52F1] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-colors"
                >
                  <Rocket className="h-4 w-4" />
                  Publish to {publishEnv === "production" ? "Live" : "Test"}
                </button>
              </>
            )}

            {/* Building / Deploying progress */}
            {(publishStatus === "building" || publishStatus === "deploying") && (
              <div className="flex flex-col items-center py-8 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-400 mb-4" />
                <h3 className="text-sm font-medium text-zinc-200 mb-1">
                  {publishStatus === "building" ? "Building project..." : "Deploying..."}
                </h3>
                <p className="text-xs text-zinc-500">
                  This may take a moment. Please don&apos;t close this dialog.
                </p>
                {/* Progress steps */}
                <div className="mt-6 w-full max-w-xs space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-zinc-300">Preparing files</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {publishStatus === "building" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span className={publishStatus === "building" ? "text-blue-300" : "text-zinc-300"}>
                      Building project
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {publishStatus === "deploying" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-zinc-600" />
                    )}
                    <span className={publishStatus === "deploying" ? "text-blue-300" : "text-zinc-600"}>
                      Deploying to {publishEnv === "production" ? "production" : "preview"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Success state */}
            {publishStatus === "success" && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">Published successfully!</h3>
                <p className="text-xs text-zinc-500 mb-4">
                  Your project is now live at:
                </p>
                {publishedUrl && (
                  <div className="flex items-center gap-2 w-full">
                    <div className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-blue-400 font-mono truncate">
                      {publishedUrl}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publishedUrl);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                      title="Copy URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => window.open(publishedUrl, "_blank")}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error state */}
            {publishStatus === "error" && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 mb-4">
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="text-sm font-semibold text-red-300 mb-1">Publish failed</h3>
                <p className="text-xs text-zinc-500 mb-4 max-w-sm">
                  {publishError ?? "Something went wrong during deployment."}
                </p>
                {publishBuildLog && (
                  <details className="w-full text-left mb-4">
                    <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                      View build log
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-zinc-900 border border-zinc-700 p-3 text-[11px] text-zinc-400 font-mono">
                      {publishBuildLog}
                    </pre>
                  </details>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPublishStatus("idle");
                      setPublishError(null);
                    }}
                    className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => {
                      setPublishModalOpen(false);
                      sendMessage("The publish/deploy failed with this error: " + (publishError ?? "unknown error") + ". Please help me fix it.");
                    }}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
                  >
                    Try to Fix
                  </button>
                </div>
              </div>
            )}
          </div>

          {(publishStatus === "idle" || publishStatus === "success") && (
            <DialogFooter className="mt-4">
              <button
                onClick={() => setPublishModalOpen(false)}
                className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {publishStatus === "success" ? "Done" : "Cancel"}
              </button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ────────────────────────── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#1C1C1C] border-zinc-700 text-zinc-200 max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Delete Project
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete <strong className="text-zinc-200">{projectName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 flex gap-2">
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
              className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                "Delete"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── GitHub Connect Dialog ─────────────────────────────── */}
      {githubDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setGithubDialogOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-[#1C1C1C] shadow-xl">
            {/* Header */}
            <div className="border-b border-zinc-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Github className="h-5 w-5" />
                Connect to GitHub
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Link this project to a GitHub repository for version control.
              </p>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-sm text-zinc-400 text-center py-8">
                GitHub integration is coming soon. Connect your GitHub account in{" "}
                <button
                  onClick={() => {
                    setGithubDialogOpen(false);
                    router.push(`/projects/${resolvedProjectId}/settings`);
                  }}
                  className="text-brand-400 hover:text-brand-300 underline"
                >
                  project settings
                </button>
                {" "}to get started.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-zinc-700 px-6 py-4">
              <button
                className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                onClick={() => setGithubDialogOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Keyboard Shortcuts Dialog ─────────────────────────── */}
      <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
        <DialogContent className="bg-[#1C1C1C] border-zinc-700 text-zinc-200 max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-zinc-400" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-1">
            {[
              { keys: "Enter", desc: "Send message" },
              { keys: "Shift + Enter", desc: "New line in chat" },
              { keys: "Ctrl + /", desc: "Toggle sidebar" },
              { keys: "Ctrl + B", desc: "Toggle code view" },
              { keys: "Ctrl + P", desc: "Toggle preview" },
              { keys: "Ctrl + Shift + P", desc: "Publish project" },
              { keys: "F11", desc: "Toggle fullscreen" },
              { keys: "Esc", desc: "Close dialog" },
            ].map(({ keys, desc }) => (
              <div key={keys} className="flex items-center justify-between py-2 px-1">
                <span className="text-sm text-zinc-400">{desc}</span>
                <div className="flex items-center gap-1">
                  {keys.split(" + ").map((k) => (
                    <kbd
                      key={k}
                      className="rounded bg-zinc-800 border border-zinc-600 px-2 py-0.5 text-xs font-mono text-zinc-300"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4">
            <button
              onClick={() => setShortcutsDialogOpen(false)}
              className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <CollabPresenceSync activeTab={activeTab} selectedFile={selectedFile} />
    <CollabFileTabSync openFilePaths={openFileTabs.map((t: any) => t.path)} />
    <CollabActivityOverlay />
    </>
    </CollaborationProvider>
  );
}
