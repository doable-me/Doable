"use client";

import { memo, useCallback, useState, useMemo } from "react";
import { Bot, User, Copy, Check, Loader2, Brain, Wrench } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../hooks/use-editor-store";

// ─── Simple Markdown Renderer ───────────────────────────────
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
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

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br />");

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

  const icon = status === "thinking" ? (
    <Brain className="h-3 w-3 text-purple-400 animate-pulse" />
  ) : status === "tool_call" || status === "tool_result" ? (
    <Wrench className="h-3 w-3 text-blue-400 animate-spin" />
  ) : (
    <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />
  );

  const label = status === "thinking" ? "Thinking..." :
    status === "tool_call" ? "Running tool..." :
    status === "tool_result" ? "Processing result..." :
    status;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
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

  // Memoize rendered markdown — only recompute when content changes
  const renderedHtml = useMemo(
    () => (message.content ? renderMarkdown(message.content) : ""),
    [message.content]
  );

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
            : "bg-gradient-to-br from-purple-500 to-blue-500 text-white"
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
            <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
          )}
        </div>

        {/* Thinking content — show inline when AI is thinking */}
        {message.thinkingContent && message.isStreaming && (
          <details className="mb-2 rounded-md border border-border/50 bg-muted/20 text-xs">
            <summary className="cursor-pointer select-none px-2.5 py-1.5 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-purple-400 animate-pulse" />
              Thinking...
            </summary>
            <div className="px-2.5 pb-2 text-muted-foreground/70 whitespace-pre-wrap max-h-32 overflow-y-auto text-[11px] leading-relaxed">
              {message.thinkingContent}
            </div>
          </details>
        )}

        {/* Live status indicator */}
        {message.isStreaming && <StreamingStatus status={message.liveStatus} />}

        {isWaiting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Thinking...</span>
          </div>
        ) : message.content ? (
          <div className="prose-editor text-sm leading-relaxed text-foreground">
            <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            {isActivelyStreaming && (
              <span className="inline-block w-1.5 h-4 bg-purple-500 animate-pulse ml-0.5 align-middle rounded-sm" />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});
