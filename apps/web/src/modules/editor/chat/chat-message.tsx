"use client";

import { memo, useCallback, useState, useMemo } from "react";
import { Bot, User, Copy, Check, Loader2, Brain, Wrench, ListChecks, Undo2 } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../hooks/use-editor-store";
import { useEditorStore } from "../hooks/use-editor-store";
import { MessageAttachments } from "./attachment-preview";
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

// ─── Streaming Status Indicator ─────────────────────────────
function StreamingStatus({ status }: { status?: string }) {
  if (!status) return null;

  // Parse status — format is "type:friendly message" or just "type"
  const colonIdx = status.indexOf(":");
  const statusType = colonIdx > 0 ? status.slice(0, colonIdx) : status;
  const friendlyMsg = colonIdx > 0 ? status.slice(colonIdx + 1) : "";

  const isThinking = statusType === "thinking";
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
    ? "Thinking\u2026"
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

// ─── Message Component ──────────────────────────────────────
interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = memo(function ChatMessage({
  message,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isWaiting = message.isStreaming && !message.content;
  const isActivelyStreaming = message.isStreaming && !!message.content;
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
          {isActivelyStreaming && (
            <Loader2 className="h-3 w-3 animate-spin text-brand-500" />
          )}
        </div>

        {/* Attachments — show for user messages */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}

        {/* Thinking content — show inline when AI is thinking */}
        {message.thinkingContent && message.isStreaming && (
          <details className="mb-2 rounded-md border border-border/50 bg-muted/20 text-xs">
            <summary className="cursor-pointer select-none px-2.5 py-1.5 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-brand-400 animate-pulse" />
              Thinking...
            </summary>
            <div className="px-2.5 pb-2 text-muted-foreground/70 whitespace-pre-wrap max-h-32 overflow-y-auto text-[11px] leading-relaxed">
              {message.thinkingContent}
            </div>
          </details>
        )}

        {/* Live status indicator */}
        {message.isStreaming && <StreamingStatus status={message.liveStatus} />}

        {/* Undone badge */}
        {message.undone && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Undo2 className="h-3 w-3" />
            <span className="font-medium">Changes undone</span>
          </div>
        )}

        {isWaiting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Thinking...</span>
          </div>
        ) : message.content ? (
          <div className={`prose-editor text-sm leading-relaxed ${message.undone ? "text-muted-foreground opacity-60" : "text-foreground"}`}>
            <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            {isActivelyStreaming && (
              <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
                <span className="inline-block w-1 h-1 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
              </span>
            )}
          </div>
        ) : null}

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
