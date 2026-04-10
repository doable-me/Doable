"use client";

import { memo, useCallback, useState, useMemo, useRef, useEffect } from "react";
import { Bot, User, Copy, Check, Loader2, Brain, Wrench, ListChecks, Undo2 } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../hooks/use-editor-store";
import { useEditorStore } from "../hooks/use-editor-store";
import { MessageAttachments } from "./attachment-preview";
import { TokenCounter } from "./token-counter";
import { apiFetch } from "@/lib/api";

// ─── Simple Markdown Renderer ───────────────────────────────
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (must be before line-level rules)
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre class="code-block ${lang ?? ""}" data-lang="${lang ?? ""}"><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="inline-code">$1</code>'
  );

  // Bold (before italic so **bold** isn't caught by *italic*)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headings (# to ####) — must be at start of line
  html = html.replace(/^#### (.+)$/gm, '<h4 class="chat-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="chat-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="chat-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="chat-h1">$1</h1>');

  // Unordered lists: lines starting with - or *
  html = html.replace(/^[*-] (.+)$/gm, '<li class="chat-li">$1</li>');

  // Ordered lists: lines starting with 1. 2. etc.
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="chat-li-ol">$1</li>');

  // Wrap consecutive <li> runs in <ul>/<ol>
  html = html.replace(
    /((?:<li class="chat-li">[\s\S]*?<\/li>\s*)+)/g,
    '<ul class="chat-ul">$1</ul>'
  );
  html = html.replace(
    /((?:<li class="chat-li-ol">[\s\S]*?<\/li>\s*)+)/g,
    '<ol class="chat-ol">$1</ol>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="chat-hr" />');

  // Line breaks (skip inside <pre> blocks — handled by CSS white-space)
  html = html.replace(/\n/g, "<br />");

  // Clean up: remove <br /> right after block elements
  html = html.replace(/<\/(h[1-4]|li|ul|ol|pre|hr)><br \/>/g, "</$1>");
  html = html.replace(/<hr class="chat-hr" \/><br \/>/g, '<hr class="chat-hr" />');

  return html;
}

// ─── Code Block with Copy ───────────────────────────────────
function CodeBlockCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ─── Tool Activity Summary (shown for history messages) ─────
function ToolActivitySummary({ toolCalls }: { toolCalls: Array<{ name: string; arguments?: unknown }> }) {
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    const name = tc.name ?? "unknown";
    counts[name] = (counts[name] ?? 0) + 1;
  }

  const friendlyName = (name: string, count: number): string => {
    switch (name) {
      case "create_file": return `Created ${count} file${count > 1 ? "s" : ""}`;
      case "edit_file": return `Edited ${count} file${count > 1 ? "s" : ""}`;
      case "read_file": return `Read ${count} file${count > 1 ? "s" : ""}`;
      case "list_files": return "Explored project structure";
      case "install_package": return `Installed ${count} package${count > 1 ? "s" : ""}`;
      case "search_files": return `Searched ${count} time${count > 1 ? "s" : ""}`;
      case "run_terminal_command": return `Ran ${count} command${count > 1 ? "s" : ""}`;
      default: return `${name} (${count})`;
    }
  };

  const writeTools = ["create_file", "edit_file", "install_package", "run_terminal_command"];
  const writeEntries = Object.entries(counts).filter(([name]) => writeTools.includes(name));
  const entries = writeEntries.length > 0 ? writeEntries : Object.entries(counts);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Wrench className="h-3 w-3 text-blue-400" />
      {entries.map(([name, count], i) => (
        <span key={name}>
          {friendlyName(name, count)}
          {i < entries.length - 1 ? " · " : ""}
        </span>
      ))}
    </div>
  );
}

// ─── Streaming Status Indicator ─────────────────────────────
function StreamingStatus({ status }: { status?: string }) {
  if (!status) return null;

  // Known prefixed formats: "type:friendly message"
  const KNOWN_PREFIXES = new Set(["plan", "tool_call", "tool_result", "status"]);
  const colonIdx = status.indexOf(":");
  const maybeType = colonIdx > 0 ? status.slice(0, colonIdx) : "";
  const isPrefixed = KNOWN_PREFIXES.has(maybeType);

  const statusType = isPrefixed ? maybeType : "";
  const friendlyMsg = isPrefixed ? status.slice(colonIdx + 1) : "";

  // If it's literally "thinking" (old format) or unprefixed text, treat as thinking
  const isThinking = status === "thinking" || (!isPrefixed && statusType === "");
  const isPlan = statusType === "plan";
  const isToolCall = statusType === "tool_call";
  const isToolResult = statusType === "tool_result";

  const icon = isThinking ? (
    <Brain className="h-3 w-3 text-brand-400 animate-pulse" />
  ) : isPlan ? (
    <ListChecks className="h-3 w-3 text-brand-400 animate-pulse" />
  ) : isToolCall ? (
    <Wrench className="h-3 w-3 text-blue-400 animate-spin" />
  ) : isToolResult ? (
    <Check className="h-3 w-3 text-green-500" />
  ) : (
    <Loader2 className="h-3 w-3 text-brand-400 animate-spin" />
  );

  const label = isThinking
    ? (status === "thinking" ? "Thinking\u2026" : status)
    : isPlan
      ? friendlyMsg || "Planning\u2026"
      : isToolCall
        ? friendlyMsg || "Working on it\u2026"
        : isToolResult
          ? friendlyMsg || "Done"
          : status;

  return (
    <div className={`flex items-center gap-1.5 text-xs mb-1.5 ${
      isToolResult ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
    }`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ─── Waiting Indicator (shown before any content arrives) ───
function WaitingIndicator({ status }: { status?: string }) {
  // Parse prefixed status like "tool_call:Reading package.json"
  const colonIdx = status ? status.indexOf(":") : -1;
  const KNOWN_PREFIXES = new Set(["plan", "tool_call", "tool_result", "status"]);
  const maybeType = colonIdx > 0 ? status!.slice(0, colonIdx) : "";
  const isPrefixed = KNOWN_PREFIXES.has(maybeType);
  const statusType = isPrefixed ? maybeType : "";
  const friendlyMsg = isPrefixed ? status!.slice(colonIdx + 1) : "";

  const isToolCall = statusType === "tool_call";
  const isToolResult = statusType === "tool_result";
  const isPlan = statusType === "plan";

  // Pick icon and label based on what the AI is doing
  let icon: React.ReactNode;
  let label: string;
  let sublabel: string | null = null;

  if (isToolCall) {
    icon = <Wrench className="h-4 w-4 text-blue-400 animate-spin" />;
    label = friendlyMsg || "Working on it\u2026";
  } else if (isToolResult) {
    icon = <Check className="h-4 w-4 text-green-500" />;
    label = friendlyMsg || "Done";
  } else if (isPlan) {
    icon = <ListChecks className="h-4 w-4 text-brand-400 animate-pulse" />;
    label = friendlyMsg || "Planning\u2026";
  } else {
    icon = <Brain className="h-4 w-4 text-brand-400 animate-pulse" />;
    label = "Thinking\u2026";
    sublabel = "Analyzing your request";
  }

  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1">
      {icon}
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted-foreground/60">{sublabel}</span>
        )}
      </div>
      <span className="inline-flex items-center gap-[3px] ml-1">
        <span className="status-dot-1 inline-block h-1 w-1 rounded-full bg-brand-400" />
        <span className="status-dot-2 inline-block h-1 w-1 rounded-full bg-brand-400" />
        <span className="status-dot-3 inline-block h-1 w-1 rounded-full bg-brand-400" />
      </span>
    </div>
  );
}

// ─── Thinking Section (live-streaming, auto-scroll) ─────────
function ThinkingSection({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);

  // Auto-open when streaming starts
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) setIsOpen(true);
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-scroll to bottom as new content streams in
  useEffect(() => {
    if (isOpen && isStreaming && scrollRef.current) {
      const el = scrollRef.current;
      // Only auto-scroll if user hasn't scrolled up manually
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [content, isOpen, isStreaming]);

  return (
    <div className="mb-2 rounded-md border border-border/50 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="w-full cursor-pointer select-none px-2.5 py-1.5 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
      >
        <Brain className={`h-3 w-3 text-brand-400 ${isStreaming ? "animate-pulse" : ""}`} />
        <span className="flex-1 text-left">
          {isStreaming ? "Thinking\u2026" : "Thought process"}
        </span>
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div
          ref={scrollRef}
          className="px-2.5 pb-2 text-muted-foreground/80 whitespace-pre-wrap max-h-72 overflow-y-auto text-[11px] leading-relaxed scroll-smooth"
        >
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-brand-400/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Message Component ──────────────────────────────────────
interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = memo(function ChatMessage({
  message,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasThinking = !!message.thinkingContent;
  const isWaiting = message.isStreaming && !message.content && !hasThinking;
  const isActivelyStreaming = message.isStreaming && !!(message.content || hasThinking);
  const [undoing, setUndoing] = useState(false);
  const { projectId, updateMessageFields } = useEditorStore();

  const canUndo =
    !isUser &&
    !message.isStreaming &&
    message.versionSha &&
    !message.undone;

  const handleUndo = useCallback(async () => {
    if (!projectId || !message.versionSha || undoing) return;
    setUndoing(true);
    try {
      await apiFetch(`/projects/${projectId}/versions/undo`, {
        method: "POST",
        body: JSON.stringify({ messageId: message.id }),
      });
      updateMessageFields(message.id, { undone: true });
    } catch (err) {
      console.error("[Chat] Undo failed:", err);
    } finally {
      setUndoing(false);
    }
  }, [projectId, message.versionSha, message.id, undoing, updateMessageFields]);

  // Memoize rendered markdown — only recompute when content changes
  // Strip trailing colon during streaming (LLM often emits ":" before tool calls)
  const renderedHtml = useMemo(() => {
    if (!message.content) return "";
    const content = isActivelyStreaming ? message.content.replace(/:\s*$/, "") : message.content;
    return renderMarkdown(content);
  }, [message.content, isActivelyStreaming]);

  return (
    <div
      className={`flex gap-3 px-4 py-3 ${
        isUser ? "" : "bg-muted/30"
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-brand-500 to-brand-300 text-white"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            {isUser ? "You" : "Doable AI"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {(isActivelyStreaming || (message.isStreaming && hasThinking)) && (
            <Loader2 className="h-3 w-3 animate-spin text-brand-500" />
          )}
        </div>

        {/* Attachments — show for user messages */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}

        {/* Thinking content — live-streaming with auto-scroll */}
        {message.thinkingContent && (
          <ThinkingSection content={message.thinkingContent} isStreaming={!!message.isStreaming} />
        )}

        {/* Live status indicator — hidden during waiting state since WaitingIndicator handles it */}
        {message.isStreaming && !isWaiting && <StreamingStatus status={message.liveStatus} />}

        {/* Undone badge */}
        {message.undone && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Undo2 className="h-3 w-3" />
            <span className="font-medium">Changes undone</span>
          </div>
        )}

        {isWaiting ? (
          <WaitingIndicator status={message.liveStatus} />
        ) : message.content ? (
          <div className={`prose-editor text-sm leading-relaxed ${message.undone ? "text-muted-foreground opacity-60" : "text-foreground"}`}>
            <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            {isActivelyStreaming && (
              <span className="streaming-caret inline-flex items-center ml-1 align-middle gap-[3px]">
                <span className="status-dot-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span className="status-dot-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span className="status-dot-3 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
            )}
          </div>
        ) : null}

        {/* Tool activity summary — shown for history messages with tool calls */}
        {!isUser && !message.isStreaming && !message.content && message.hadToolCalls && message.toolCallDetails && (
          <ToolActivitySummary toolCalls={message.toolCallDetails} />
        )}
        {!isUser && !message.isStreaming && message.content && message.hadToolCalls && message.toolCallDetails && (
          <div className="mt-1.5">
            <ToolActivitySummary toolCalls={message.toolCallDetails} />
          </div>
        )}

        {/* Per-message usage display (tokens, cost, duration) */}
        {!isUser && !message.isStreaming && message.usage && (
          <TokenCounter usage={message.usage} />
        )}

        {/* Undo button for AI messages that made file changes */}
        {canUndo && (
          <button
            onClick={handleUndo}
            disabled={undoing}
            className="mt-2 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          >
            {undoing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Undo2 className="h-3 w-3" />
            )}
            {undoing ? "Undoing..." : "Undo changes"}
          </button>
        )}
      </div>
    </div>
  );
});
