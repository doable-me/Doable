"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getStoredTokens, apiUpdateProject } from "@/lib/api";
import {
  ArrowUp,
  RefreshCw,
  Smartphone,
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
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
type ActiveTab = "chat" | "code" | "preview" | "history" | "design" | "cloud" | "analytics";
type ChatMode = "agent" | "plan";
type DeviceMode = "desktop" | "mobile";

interface ToolAction {
  id: string;
  toolName: string;
  description: string;
  isExpanded: boolean;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
  toolActions?: ToolAction[];
}

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
  const res = await fetch(`${API_URL}/projects/${projectId}/scaffold`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scaffold failed (${res.status}): ${text || "Unknown error"}`);
  }
  const json = (await res.json()) as { data: { previewUrl?: string | null } };
  return toAbsolutePreviewUrl(json.data.previewUrl ?? null);
}

async function fetchPreviewUrl(projectId: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/projects/${projectId}/preview-url`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get preview URL (${res.status}): ${text || "Unknown error"}`);
  }
  const json = (await res.json()) as { data: { url: string | null; running: boolean } };
  // Return null if the server isn't running yet — caller will retry
  if (!json.data.url || !json.data.running) return null;
  return toAbsolutePreviewUrl(json.data.url);
}

async function fetchFileList(projectId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to list files (${res.status}): ${text || "Unknown error"}`);
  }
  const json = (await res.json()) as { data: string[] };
  return json.data;
}

async function fetchFileContent(
  projectId: string,
  filePath: string,
): Promise<string> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to read file (${res.status}): ${text || "Unknown error"}`);
  }
  const json = (await res.json()) as { data: { path: string; content: string } };
  return json.data.content;
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
  signal?: AbortSignal,
) {
  const { accessToken } = getStoredTokens();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/projects/${projectId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ content: message, mode }),
      signal,
    });
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

          // Handle tool completion events — triggers file tree / content refresh
          if (parsed.type === "tool.completed" && onToolCompleted) {
            const toolName = parsed.name ?? (typeof parsed.data === "object" && parsed.data !== null ? (parsed.data as Record<string, unknown>).name as string : "");
            const toolArgs = parsed.args ?? (typeof parsed.data === "object" && parsed.data !== null ? (parsed.data as Record<string, unknown>).args as Record<string, unknown> : {});
            onToolCompleted(toolName ?? "", toolArgs ?? {});
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
    return shortName ? `Create ${shortName}` : "Create file";
  }
  if (toolName.toLowerCase().includes("edit") || toolName.toLowerCase().includes("update") || toolName.toLowerCase().includes("patch")) {
    return shortName ? `Edit ${shortName}` : "Edit file";
  }
  if (toolName.toLowerCase().includes("delete") || toolName.toLowerCase().includes("remove")) {
    return shortName ? `Delete ${shortName}` : "Delete file";
  }
  if (toolName.toLowerCase().includes("rename")) {
    return shortName ? `Rename ${shortName}` : "Rename file";
  }
  if (toolName.toLowerCase().includes("read")) {
    return shortName ? `Read ${shortName}` : "Read file";
  }
  return toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Default suggestion chips */
const DEFAULT_SUGGESTIONS = [
  "Add navigation",
  "Improve styling",
  "Add dark mode",
  "Add responsive design",
];

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

  // For "new" projects, generate a stable ID; otherwise use the URL param
  const [resolvedProjectId] = useState<string>(() =>
    rawProjectId === "new" ? generateProjectId() : rawProjectId
  );
  const isNewProject = rawProjectId === "new";

  // ─── Scaffold / preview state ─────────────────────────────
  const [scaffoldStatus, setScaffoldStatus] = useState<ScaffoldStatus>("idle");
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ─── File tree state ──────────────────────────────────────
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  // ─── File content state ───────────────────────────────────
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileContentError, setFileContentError] = useState<string | null>(null);

  // ─── UI state ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
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
  const [projectName, setProjectName] = useState(() => {
    const prompt = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("prompt") : null;
    if (prompt) return deriveProjectName(prompt);
    return isNewProject ? "New Project" : "My Awesome App";
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [splitPos, setSplitPos] = useState(35); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set<string>()
  );
  const [showCreditsBar, setShowCreditsBar] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);
  const scaffoldInitRef = useRef(false);

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
      setFileContentLoading(true);
      setFileContentError(null);
      setFileContent(null);
      try {
        const content = await fetchFileContent(resolvedProjectId, filePath);
        setFileContent(content);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load file";
        setFileContentError(msg);
      } finally {
        setFileContentLoading(false);
      }
    },
    [resolvedProjectId],
  );

  useEffect(() => {
    if (selectedFile && scaffoldStatus === "ready") {
      loadFileContent(selectedFile);
    }
  }, [selectedFile, scaffoldStatus, loadFileContent]);

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

  // Handle the "new project" flow — auto-send prompt from query params
  useEffect(() => {
    if (!isNewProject || autoSentRef.current) return;
    // Wait until scaffold is ready (or at least started) before sending
    if (scaffoldStatus !== "ready" && scaffoldStatus !== "starting") return;
    const prompt = searchParams.get("prompt");
    if (!prompt) return;
    autoSentRef.current = true;
    // Delay slightly so the UI renders first
    const timer = setTimeout(() => {
      sendMessage(prompt);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewProject, searchParams, scaffoldStatus]);

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

  // ─── Handle tool completion — refresh files + add tool card ─
  const handleToolCompleted = useCallback(
    (toolName: string, _args: Record<string, unknown>) => {
      // Add a tool action card to the currently streaming assistant message
      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return prev;
        const action: ToolAction = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName,
          description: describeToolAction(toolName, _args),
          isExpanded: false,
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

        // If the currently selected file was modified, reload it
        if (selectedFile) {
          loadFileContent(selectedFile);
        }
      }
    },
    [loadFileTree, selectedFile, loadFileContent],
  );

  // ─── Send message to real API ──────────────────────────────
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      // Add user message
      const userMsg: ChatMsg = {
        id: Date.now().toString(),
        role: "user",
        content: trimmed,
        timestamp: nowTimestamp(),
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

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInputValue("");
      setIsStreaming(true);

      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      streamChat(
        resolvedProjectId,
        trimmed,
        chatMode,
        // onChunk — append text to the streaming assistant message
        (chunk: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        },
        // onDone
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false }
                : m
            )
          );
          setIsStreaming(false);
          // Refresh file tree after AI response completes (may have created files)
          loadFileTree();
          if (selectedFile) loadFileContent(selectedFile);
        },
        // onError
        (error: string) => {
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
        },
        // onToolCompleted
        handleToolCompleted,
        controller.signal,
      );
    },
    [isStreaming, resolvedProjectId, chatMode, handleToolCompleted, loadFileTree, selectedFile, loadFileContent]
  );

  // Send message handler (from input)
  const handleSend = useCallback(() => {
    sendMessage(inputValue);
  }, [inputValue, sendMessage]);

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
              else setSelectedFile(node.path);
            }}
            className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-white/5 transition-colors ${
              isSelected && !isFolder
                ? "bg-purple-500/10 text-purple-300"
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

  // Format message content with markdown (bold, code blocks, inline code, lists)
  const formatContent = (content: string) => {
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

      // Process non-code-block text line by line to handle lists
      const textLines = part.split("\n");
      const elements: React.ReactNode[] = [];
      let listBuffer: { ordered: boolean; items: React.ReactNode[] } | null =
        null;

      const flushList = () => {
        if (!listBuffer) return;
        if (listBuffer.ordered) {
          elements.push(
            <ol
              key={`ol-${elements.length}`}
              className="my-1.5 ml-4 list-decimal space-y-0.5 text-zinc-300"
            >
              {listBuffer.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ol>
          );
        } else {
          elements.push(
            <ul
              key={`ul-${elements.length}`}
              className="my-1.5 ml-4 list-disc space-y-0.5 text-zinc-300"
            >
              {listBuffer.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          );
        }
        listBuffer = null;
      };

      for (let li = 0; li < textLines.length; li++) {
        const line = textLines[li]!;

        // Unordered list item: - or *
        const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
        // Ordered list item: 1. 2. etc.
        const olMatch = line.match(/^\s*\d+\.\s+(.*)/);

        if (ulMatch) {
          if (!listBuffer || listBuffer.ordered) {
            flushList();
            listBuffer = { ordered: false, items: [] };
          }
          listBuffer.items.push(formatInline(ulMatch[1] ?? ""));
        } else if (olMatch) {
          if (!listBuffer || !listBuffer.ordered) {
            flushList();
            listBuffer = { ordered: true, items: [] };
          }
          listBuffer.items.push(formatInline(olMatch[1] ?? ""));
        } else {
          flushList();
          elements.push(
            <span key={`line-${i}-${li}`} className="whitespace-pre-wrap">
              {formatInline(line)}
              {li < textLines.length - 1 ? "\n" : ""}
            </span>
          );
        }
      }
      flushList();

      return <span key={i}>{elements}</span>;
    });
  };

  // Inline markdown formatting: bold, inline code
  const formatInline = (text: string): React.ReactNode => {
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
            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] text-purple-300"
          >
            {seg.slice(1, -1)}
          </code>
        );
      }
      return seg;
    });
  };

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

  // Determine what panels to show based on active tab
  const showChat = activeTab === "chat" || activeTab === "preview" || activeTab === "history" || activeTab === "design" || activeTab === "cloud" || activeTab === "analytics";
  const showCode = activeTab === "code";
  const showPreview = activeTab === "preview" || activeTab === "chat" || activeTab === "history" || activeTab === "design" || activeTab === "cloud" || activeTab === "analytics";

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
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      );
    }

    // Loading states
    const statusMsg =
      scaffoldStatus === "scaffolding"
        ? "Getting ready..."
        : scaffoldStatus === "starting"
          ? "Starting dev server..."
          : "Getting ready...";

    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400 mb-4" />
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{statusMsg}</h3>
        <p className="text-[13px] text-zinc-600 max-w-[280px]">
          {scaffoldStatus === "scaffolding"
            ? "Installing dependencies and configuring the project"
            : "Waiting for the Vite dev server to start"}
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-[#1C1C1C] text-zinc-200">
      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#1C1C1C] px-3">
        {/* Left: Logo + Back arrow + Project name with dropdown */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Doable logo icon */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white font-bold text-sm shadow-md shadow-purple-900/40 hover:from-purple-400 hover:to-purple-600 transition-all"
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
                  className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white outline-none focus:border-purple-500 w-48"
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
              {scaffoldStatus === "ready"
                ? "Previewing last saved version"
                : scaffoldStatus === "error"
                  ? "Preview unavailable"
                  : "Loading Live Preview..."}
            </span>
          </div>

          {/* Scaffold status indicator */}
          {scaffoldStatus !== "ready" && scaffoldStatus !== "idle" && scaffoldStatus !== "error" && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 flex-shrink-0">
              <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
              {scaffoldStatus === "scaffolding" ? "Getting ready..." : "Starting..."}
            </div>
          )}
        </div>

        {/* Center: View toggle icon buttons (Lovable-style) */}
        <div className="flex items-center gap-0.5">
          {([
            { key: "history" as ActiveTab, icon: Clock, label: "History", isToggle: false, isMore: false },
            { key: "chat" as ActiveTab, icon: PanelLeftClose, label: "Toggle sidebar", isToggle: true, isMore: false },
            { key: "preview" as ActiveTab, icon: Globe, label: "Preview", isToggle: false, isMore: false },
            { key: "design" as ActiveTab, icon: Palette, label: "Design", isToggle: false, isMore: false },
            { key: "code" as ActiveTab, icon: Code2, label: "Code", isToggle: false, isMore: false },
            { key: "cloud" as ActiveTab, icon: Cloud, label: "Cloud", isToggle: false, isMore: false },
            { key: "analytics" as ActiveTab, icon: BarChart3, label: "Analytics", isToggle: false, isMore: false },
            { key: "chat" as ActiveTab, icon: MoreHorizontal, label: "More", isToggle: false, isMore: true },
          ]).map(({ key, icon: Icon, label, isToggle, isMore }, idx) => {
            const isActive = !isToggle && !isMore && activeTab === key;
            return (
              <button
                key={`${key}-${idx}`}
                onClick={() => {
                  if (isToggle) {
                    setShowSidebar((v) => !v);
                  } else if (!isMore) {
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
        </div>

        {/* Preview controls inline in top bar */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-full bg-[#272725] border border-zinc-700/40 px-2.5 py-1">
            <Globe className="h-3 w-3 text-zinc-500" />
            <span className="text-[11px] text-zinc-400 font-mono">/</span>
          </div>
          <button
            onClick={() => setDeviceMode(deviceMode === "desktop" ? "mobile" : "desktop")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-[#272725] hover:text-zinc-300 transition-colors"
            title={deviceMode === "desktop" ? "Switch to mobile" : "Switch to desktop"}
          >
            {deviceMode === "desktop" ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
          </button>
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
        </div>

        {/* Right: Share + GitHub + Upgrade + Publish — pixel-exact Lovable */}
        <div className="flex items-center gap-1.5">
          {/* Share: pill with muted bg, h-7 */}
          <button className="flex h-7 items-center gap-1.5 rounded-full bg-[#272725] px-2.5 text-sm text-[#FCFBF8] hover:bg-[#333] transition-colors">
            <UserPlus className="h-4 w-4" />
            <span className="hidden lg:inline">Share</span>
          </button>
          {/* GitHub: rounded-md 6px, muted bg — exact Lovable audit */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#272725] text-[#FCFBF8] hover:brightness-125 transition-colors"
            title="Sync with GitHub"
          >
            <Github className="h-4 w-4" />
          </button>
          {/* Upgrade: rounded-md 6px, #5337CD, px-2.5, inset shadow — exact Lovable */}
          <button
            onClick={() => router.push("/billing")}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[#5337CD] px-2.5 text-sm text-[#F0F6FF] hover:brightness-110 transition-colors"
            style={{ boxShadow: "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(255,255,255,0.1) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px" }}
          >
            <Zap className="h-4 w-4" />
            Upgrade
          </button>
          {/* Publish: rounded-md 6px, #1E52F1, px-2.5, inset shadow — exact Lovable */}
          <button
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
              width: showPreview ? `${splitPos}%` : "100%",
              minWidth: "320px",
            }}
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/10 mb-4">
                    <Sparkles className="h-6 w-6 text-purple-400" />
                  </div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-1">
                    Start a conversation
                  </h3>
                  <p className="text-[13px] text-zinc-600 max-w-[280px]">
                    Describe what you want to build and Doable AI will generate
                    the code for you.
                  </p>
                </div>
              )}

              {messages.map((msg, msgIdx) => (
                <div key={msg.id} className="group">
                  {msg.role === "user" ? (
                    /* ── User message: right-aligned dark bubble (iMessage style) ── */
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
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Assistant message: left-aligned ── */
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-600/20 mt-0.5">
                        {msg.isError ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-medium ${
                              msg.isError
                                ? "text-red-400"
                                : "text-purple-400"
                            }`}
                          >
                            {msg.isError ? "Error" : "Doable AI"}
                          </span>
                          <span className="text-[10px] text-zinc-700">
                            {msg.timestamp}
                          </span>
                          {msg.isStreaming && (
                            <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                          )}
                        </div>

                        {/* Tool action cards */}
                        {msg.toolActions && msg.toolActions.length > 0 && (
                          <div className="mb-2 space-y-1.5">
                            {msg.toolActions.map((action) => (
                              <div
                                key={action.id}
                                className="flex items-center justify-between rounded-lg border border-zinc-700/40 bg-zinc-800/50 px-3 py-2 text-[13px]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Wrench className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
                                  <span className="text-zinc-300 truncate">
                                    {action.description}
                                  </span>
                                </div>
                                <Bookmark className="h-3.5 w-3.5 flex-shrink-0 text-zinc-600 hover:text-zinc-400 cursor-pointer" />
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          className={`text-[14px] leading-relaxed ${
                            msg.isError
                              ? "text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2"
                              : "text-zinc-300"
                          }`}
                        >
                          {msg.content
                            ? formatContent(msg.content)
                            : msg.isStreaming && (
                                <span className="inline-flex items-center gap-1 text-zinc-500">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Thinking...
                                </span>
                              )}
                          {msg.isStreaming && msg.content && (
                            <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle rounded-sm" />
                          )}
                        </div>

                        {/* Feedback buttons below completed AI responses */}
                        {!msg.isStreaming && !msg.isError && msg.content && (
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                              title="Good response"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                              title="Bad response"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
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
                            <button
                              className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                              title="More"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Suggestion chips after the last completed AI response */}
                        {!msg.isStreaming &&
                          !msg.isError &&
                          msg.content &&
                          !isStreaming &&
                          msgIdx === messages.length - 1 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {DEFAULT_SUGGESTIONS.map((suggestion) => (
                                <button
                                  key={suggestion}
                                  onClick={() => sendMessage(suggestion)}
                                  className="rounded-md bg-[#272725] px-3 py-2 text-sm text-[#FCFBF8] hover:brightness-125 transition-all"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

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
                      className="text-[12px] font-medium text-purple-400 hover:text-purple-300 transition-colors"
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
                <div className="rounded-3xl bg-[#272725] border border-[#40403F] p-3 focus-within:border-purple-500/50 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
                  {/* Textarea */}
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
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

                  {/* Bottom toolbar row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {/* + button (rounded-full) */}
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#272725] text-[#FCFBF8] hover:brightness-125 transition-colors"
                        title="Attach"
                      >
                        <Plus className="h-4 w-4" />
                      </button>

                      {/* Visual edits button (pill) */}
                      <button
                        className="flex items-center gap-1.5 rounded-full bg-[#272725] px-2.5 h-7 text-sm text-[#FCFBF8] hover:brightness-125 transition-colors"
                        title="Visual edits"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Visual edits</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Chat mode toggle (single icon button like Lovable) */}
                      <button
                        onClick={() => setChatMode(chatMode === "agent" ? "plan" : "agent")}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[#FCFBF8] hover:brightness-125 transition-colors"
                        title={chatMode === "agent" ? "Switch to Plan mode" : "Switch to Chat mode"}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>

                      {/* Mic button (rounded-full) */}
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[#FCFBF8] hover:brightness-125 transition-colors"
                        title="Voice input"
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>

                      {/* Send button — ArrowUp icon */}
                      <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isStreaming}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#FCFBF8] text-[#1C1C1C] transition-all hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isStreaming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                    className="text-[11px] text-purple-400 hover:text-purple-300"
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

            {/* Code display */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center border-b border-zinc-800/60 bg-[#1C1C1C]">
                <div className="flex items-center gap-0.5 px-1 py-1">
                  {selectedFile ? (
                    <div className="flex items-center gap-1.5 rounded-md bg-zinc-800/50 px-3 py-1.5 text-[12px] text-zinc-300 border border-zinc-700/30">
                      <File className="h-3 w-3 text-zinc-500" />
                      {selectedFile.split("/").pop()}
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 text-[12px] text-zinc-600">
                      No file selected
                    </div>
                  )}
                </div>
              </div>

              {/* Code content */}
              {!selectedFile ? (
                <div className="flex flex-1 items-center justify-center">
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
                  </div>
                </div>
              ) : fileContentLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                    <p className="text-sm text-zinc-500">Loading file...</p>
                  </div>
                </div>
              ) : fileContentError ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center px-8">
                    <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                    <p className="text-sm text-red-300 mb-2">{fileContentError}</p>
                    <button
                      onClick={() => loadFileContent(selectedFile)}
                      className="text-sm text-purple-400 hover:text-purple-300"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : fileContent !== null ? (
                <div className="flex-1 overflow-auto">
                  <pre className="p-4 text-[13px] leading-relaxed text-zinc-300 font-mono">
                    <code>
                      {fileContent.split("\n").map((line, idx) => (
                        <div key={idx} className="flex hover:bg-white/[0.02]">
                          <span className="inline-block w-12 flex-shrink-0 select-none text-right pr-4 text-zinc-700">
                            {idx + 1}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap break-all">
                            {line || " "}
                          </span>
                        </div>
                      ))}
                    </code>
                  </pre>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center">
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
        {showChat && showPreview && (
          <div
            className="group relative z-20 w-1 flex-shrink-0 cursor-col-resize"
            onMouseDown={handleMouseDown}
          >
            <div
              className={`absolute inset-y-0 -left-px w-[3px] transition-colors ${
                isDragging
                  ? "bg-purple-500"
                  : "bg-transparent group-hover:bg-purple-500/40"
              }`}
            />
          </div>
        )}

        {/* ─── Preview Panel ────────────────────────────────── */}
        {showPreview && !showCode && (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#1C1C1C]">
            {/* Preview iframe or loading state */}
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-[#141412] p-2">
              {scaffoldStatus !== "ready" || !previewUrl ? (
                renderScaffoldOverlay()
              ) : (
                <div
                  className={`h-full overflow-hidden rounded-2xl border-none bg-white transition-all duration-300 ${
                    deviceMode === "mobile"
                      ? "w-[375px] shadow-2xl shadow-black/40"
                      : "w-full"
                  }`}
                  style={
                    deviceMode === "mobile"
                      ? {
                          maxHeight: "calc(100% - 16px)",
                          borderRadius: "24px",
                          border: "4px solid #1e1e2e",
                        }
                      : {}
                  }
                >
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    className="h-full w-full border-0"
                    title="App Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
