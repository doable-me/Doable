"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getStoredTokens } from "@/lib/api";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  Smartphone,
  Monitor,
  ExternalLink,
  Globe,
  MessageSquare,
  Code2,
  Eye,
  Share2,
  Sparkles,
  ChevronRight,
  File,
  Folder,
  Bot,
  User,
  Pencil,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
type ActiveTab = "chat" | "code" | "preview";
type ChatMode = "agent" | "plan";
type DeviceMode = "desktop" | "mobile";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
}

interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
}

// ─── Mock Data (kept for preview & file tree) ───────────────
const MOCK_FILE_TREE: FileTreeNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      { name: "App.tsx", type: "file" },
      { name: "index.tsx", type: "file" },
      { name: "index.css", type: "file" },
      {
        name: "components",
        type: "folder",
        children: [
          { name: "TodoList.tsx", type: "file" },
          { name: "TodoItem.tsx", type: "file" },
          { name: "AddTodo.tsx", type: "file" },
          { name: "DarkModeToggle.tsx", type: "file" },
          { name: "PriorityBadge.tsx", type: "file" },
        ],
      },
      {
        name: "hooks",
        type: "folder",
        children: [
          { name: "useTodos.ts", type: "file" },
          { name: "useDarkMode.ts", type: "file" },
        ],
      },
      {
        name: "types",
        type: "folder",
        children: [{ name: "index.ts", type: "file" }],
      },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
  { name: "tailwind.config.js", type: "file" },
];

const PREVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e5e5e5; min-height: 100vh; }
  .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
  .toggle { background: #1e1e2e; border: 1px solid #2a2a3e; border-radius: 20px; padding: 6px 16px; color: #a0a0b0; cursor: pointer; font-size: 13px; }
  .toggle:hover { background: #2a2a3e; }
  .add-form { display: flex; gap: 8px; margin-bottom: 20px; }
  .add-input { flex: 1; background: #12121a; border: 1px solid #2a2a3e; border-radius: 10px; padding: 12px 16px; color: #e5e5e5; font-size: 14px; outline: none; }
  .add-input:focus { border-color: #7c3aed; }
  .add-input::placeholder { color: #555; }
  .priority-select { background: #12121a; border: 1px solid #2a2a3e; border-radius: 10px; padding: 12px; color: #e5e5e5; font-size: 13px; outline: none; cursor: pointer; }
  .add-btn { background: #7c3aed; color: white; border: none; border-radius: 10px; padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .add-btn:hover { background: #6d28d9; }
  .filters { display: flex; gap: 6px; margin-bottom: 16px; }
  .filter-btn { background: #1e1e2e; border: 1px solid #2a2a3e; border-radius: 8px; padding: 6px 14px; color: #a0a0b0; cursor: pointer; font-size: 12px; font-weight: 500; }
  .filter-btn.active { background: #7c3aed; color: white; border-color: #7c3aed; }
  .todo-list { display: flex; flex-direction: column; gap: 8px; }
  .todo-item { display: flex; align-items: center; gap: 12px; background: #12121a; border: 1px solid #1e1e2e; border-radius: 10px; padding: 14px 16px; border-left: 3px solid; transition: all 0.15s; }
  .todo-item:hover { background: #16161f; }
  .todo-item.high { border-left-color: #ef4444; }
  .todo-item.medium { border-left-color: #f59e0b; }
  .todo-item.low { border-left-color: #22c55e; }
  .checkbox { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #3a3a4e; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .checkbox.checked { background: #7c3aed; border-color: #7c3aed; }
  .checkbox.checked::after { content: "\\2713"; color: white; font-size: 11px; }
  .todo-text { flex: 1; font-size: 14px; }
  .todo-text.done { text-decoration: line-through; opacity: 0.5; }
  .badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge.high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .badge.medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .badge.low { background: rgba(34,197,94,0.15); color: #22c55e; }
  .delete-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 16px; padding: 4px; border-radius: 4px; }
  .delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
  .empty { text-align: center; padding: 40px; color: #555; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
  <h1>My Todos <button class="toggle" onclick="document.body.style.background=document.body.style.background==='#f8fafc'?'#0a0a0f':'#f8fafc'">Toggle Theme</button></h1>
  <div class="add-form">
    <input class="add-input" placeholder="What needs to be done?" id="todoInput">
    <select class="priority-select" id="prioritySelect">
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="low">Low</option>
    </select>
    <button class="add-btn" onclick="addTodo()">Add</button>
  </div>
  <div class="filters">
    <button class="filter-btn active" onclick="filterTodos('all', this)">All</button>
    <button class="filter-btn" onclick="filterTodos('high', this)">High</button>
    <button class="filter-btn" onclick="filterTodos('medium', this)">Medium</button>
    <button class="filter-btn" onclick="filterTodos('low', this)">Low</button>
  </div>
  <div class="todo-list" id="todoList">
    <div class="todo-item high">
      <div class="checkbox" onclick="this.classList.toggle('checked');this.parentElement.querySelector('.todo-text').classList.toggle('done')"></div>
      <span class="todo-text">Deploy the new API endpoints</span>
      <span class="badge high">high</span>
      <button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>
    </div>
    <div class="todo-item medium">
      <div class="checkbox checked" onclick="this.classList.toggle('checked');this.parentElement.querySelector('.todo-text').classList.toggle('done')"></div>
      <span class="todo-text done">Set up CI/CD pipeline</span>
      <span class="badge medium">medium</span>
      <button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>
    </div>
    <div class="todo-item high">
      <div class="checkbox" onclick="this.classList.toggle('checked');this.parentElement.querySelector('.todo-text').classList.toggle('done')"></div>
      <span class="todo-text">Fix authentication bug on mobile</span>
      <span class="badge high">high</span>
      <button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>
    </div>
    <div class="todo-item low">
      <div class="checkbox" onclick="this.classList.toggle('checked');this.parentElement.querySelector('.todo-text').classList.toggle('done')"></div>
      <span class="todo-text">Update documentation</span>
      <span class="badge low">low</span>
      <button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>
    </div>
    <div class="todo-item medium">
      <div class="checkbox" onclick="this.classList.toggle('checked');this.parentElement.querySelector('.todo-text').classList.toggle('done')"></div>
      <span class="todo-text">Add priority color coding</span>
      <span class="badge medium">medium</span>
      <button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>
    </div>
  </div>
</div>
<script>
function addTodo() {
  const input = document.getElementById('todoInput');
  const priority = document.getElementById('prioritySelect').value;
  if (!input.value.trim()) return;
  const item = document.createElement('div');
  item.className = 'todo-item ' + priority;
  item.innerHTML = '<div class="checkbox" onclick="this.classList.toggle(\\'checked\\');this.parentElement.querySelector(\\'.todo-text\\').classList.toggle(\\'done\\')"></div><span class="todo-text">' + input.value + '</span><span class="badge ' + priority + '">' + priority + '</span><button class="delete-btn" onclick="this.parentElement.remove()">&times;</button>';
  document.getElementById('todoList').prepend(item);
  input.value = '';
}
function filterTodos(level, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.todo-item').forEach(item => {
    item.style.display = level === 'all' || item.classList.contains(level) ? 'flex' : 'none';
  });
}
document.getElementById('todoInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') addTodo(); });
</script>
</body>
</html>`;

// ─── SSE Chat Helper ────────────────────────────────────────
async function streamChat(
  projectId: string,
  message: string,
  mode: ChatMode,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
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
          const parsed = JSON.parse(payload) as { type?: string; data?: unknown; content?: string };
          // Extract text content from various SSE event shapes
          let text = "";
          if (parsed.type === "text_delta") {
            // Copilot SDK sends {type:"text_delta", data:"actual text"}
            text = typeof parsed.data === "string" ? parsed.data : "";
          } else if (parsed.type === "assistant.message") {
            // Full message event: {type:"assistant.message", data:{content:"..."}}
            const d = parsed.data as Record<string, unknown> | undefined;
            text = typeof d?.content === "string" ? d.content : "";
          } else if (typeof parsed.data === "string") {
            text = parsed.data;
          } else if (typeof parsed.content === "string") {
            text = parsed.content;
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
function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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

  // For "new" projects, generate a temp ID; otherwise use the URL param
  const [resolvedProjectId] = useState<string>(() =>
    rawProjectId === "new" ? generateTempId() : rawProjectId
  );
  const isNewProject = rawProjectId === "new";

  // State
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [projectName, setProjectName] = useState(
    isNewProject ? "New Project" : "My Awesome App"
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [splitPos, setSplitPos] = useState(40); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState("src/App.tsx");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["src", "src/components", "src/hooks", "src/types"])
  );

  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle the "new project" flow — auto-send prompt from query params
  useEffect(() => {
    if (!isNewProject || autoSentRef.current) return;
    const prompt = searchParams.get("prompt");
    if (!prompt) return;
    autoSentRef.current = true;
    // Delay slightly so the UI renders first
    const timer = setTimeout(() => {
      sendMessage(prompt);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewProject, searchParams]);

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
        controller.signal,
      );
    },
    [isStreaming, resolvedProjectId, chatMode]
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
  const renderTree = (nodes: FileTreeNode[], parentPath = "") => {
    return nodes.map((node) => {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;
      const isFolder = node.type === "folder";
      const isExpanded = expandedFolders.has(path);
      const isSelected = selectedFile === path;
      const depth = path.split("/").length - 1;

      return (
        <div key={path}>
          <button
            onClick={() => {
              if (isFolder) toggleFolder(path);
              else setSelectedFile(path);
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
            <div>{renderTree(node.children, path)}</div>
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

  // Determine what panels to show based on active tab
  const showChat = activeTab === "chat";
  const showCode = activeTab === "code";
  const showPreview = activeTab === "preview" || activeTab === "chat";

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] text-zinc-200">
      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0e0e16] px-3">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Editable project name */}
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
                  }
                  if (e.key === "Escape") {
                    setNameInput(projectName);
                    setIsEditingName(false);
                  }
                }}
                onBlur={() => {
                  setProjectName(nameInput);
                  setIsEditingName(false);
                }}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white outline-none focus:border-purple-500 w-48"
              />
              <button
                onClick={() => {
                  setProjectName(nameInput);
                  setIsEditingName(false);
                }}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="group flex items-center gap-1.5 text-sm font-medium text-zinc-200 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              {projectName}
              <Pencil className="h-3 w-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Center tabs */}
        <div className="flex items-center rounded-lg bg-zinc-900/80 border border-zinc-800/80 p-0.5">
          {(
            [
              { key: "chat", icon: MessageSquare, label: "Chat" },
              { key: "code", icon: Code2, label: "Code" },
              { key: "preview", icon: Eye, label: "Preview" },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === key
                  ? "bg-zinc-700/80 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Share2 className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/30">
            Publish
          </button>
        </div>
      </header>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* ─── Chat Panel ───────────────────────────────────── */}
        {showChat && (
          <div
            className="flex flex-col border-r border-zinc-800/60 bg-[#0c0c14]"
            style={{
              width: showPreview ? `${splitPos}%` : "100%",
              minWidth: "320px",
            }}
          >
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-zinc-300">
                  AI Assistant
                </span>
                {isStreaming && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                )}
              </div>
              <span className="text-[11px] text-zinc-600">
                {messages.length} messages
              </span>
            </div>

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

              {messages.map((msg) => (
                <div key={msg.id} className="group">
                  {msg.role === "user" ? (
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 mt-0.5">
                        <User className="h-3.5 w-3.5 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-zinc-400">
                            You
                          </span>
                          <span className="text-[10px] text-zinc-700">
                            {msg.timestamp}
                          </span>
                        </div>
                        <div className="rounded-xl rounded-tl-sm bg-zinc-800/60 border border-zinc-700/30 px-3.5 py-2.5 text-[14px] leading-relaxed text-zinc-200">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ) : (
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
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-zinc-800/60 p-3">
              {/* Mode toggle */}
              <div className="mb-2 flex items-center gap-1">
                {(["agent", "plan"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setChatMode(mode)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      chatMode === mode
                        ? "bg-purple-600/15 text-purple-400"
                        : "text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    chatMode === "agent"
                      ? "Ask Doable AI to build something..."
                      : "Describe what you want to plan..."
                  }
                  rows={2}
                  disabled={isStreaming}
                  className="flex-1 resize-none rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isStreaming}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 transition-colors"
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Code Panel ───────────────────────────────────── */}
        {showCode && (
          <div className="flex flex-1 overflow-hidden bg-[#0c0c14]">
            {/* File tree sidebar */}
            <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-zinc-800/60 bg-[#09090f] py-2">
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                Explorer
              </div>
              {renderTree(MOCK_FILE_TREE)}
            </div>

            {/* Code display */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center border-b border-zinc-800/60 bg-[#0a0a12]">
                <div className="flex items-center gap-0.5 px-1 py-1">
                  <div className="flex items-center gap-1.5 rounded-md bg-zinc-800/50 px-3 py-1.5 text-[12px] text-zinc-300 border border-zinc-700/30">
                    <File className="h-3 w-3 text-zinc-500" />
                    {selectedFile.split("/").pop()}
                  </div>
                </div>
              </div>

              {/* Placeholder: no real code yet */}
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
          <div className="flex flex-1 flex-col overflow-hidden bg-[#0c0c14]">
            {/* Preview toolbar */}
            <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-zinc-800/60 bg-[#0a0a12] px-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (iframeRef.current) {
                      iframeRef.current.srcdoc = PREVIEW_HTML;
                    }
                  }}
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1 rounded-md bg-zinc-900/80 border border-zinc-800/60 px-2.5 py-1">
                  <Globe className="h-3 w-3 text-zinc-600" />
                  <span className="text-[11px] text-zinc-500 font-mono">
                    preview.doable.app/{resolvedProjectId}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDeviceMode("desktop")}
                  className={`rounded-md p-1.5 transition-colors ${
                    deviceMode === "desktop"
                      ? "bg-zinc-800 text-zinc-200"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title="Desktop view"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeviceMode("mobile")}
                  className={`rounded-md p-1.5 transition-colors ${
                    deviceMode === "mobile"
                      ? "bg-zinc-800 text-zinc-200"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title="Mobile view"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
                <div className="mx-1 h-4 w-px bg-zinc-800" />
                <button
                  className="rounded-md p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Preview iframe */}
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-[#08080d] p-2">
              <div
                className={`h-full overflow-hidden rounded-lg border border-zinc-800/40 bg-white transition-all duration-300 ${
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
                  srcDoc={PREVIEW_HTML}
                  className="h-full w-full border-0"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
