"use client";

import { memo, useCallback, useState, useMemo, useRef, useEffect } from "react";
import {
  Bot, User, Copy, Check, Loader2, Brain, Wrench, Sparkles,
  ListChecks, Undo2, AlertCircle, Terminal, Package, Search,
  FileEdit, FilePlus, Cpu, ChevronDown, XCircle,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../hooks/use-editor-store";
import { useEditorStore } from "../hooks/use-editor-store";
import { MessageAttachments } from "./attachment-preview";
import { TokenCounter } from "./token-counter";
import { apiFetch } from "@/lib/api";
import { ToolCallCard } from "./tool-call-card";
import { ErrorRecoveryCard } from "./error-recovery-card";
import { McpUiResourceCard } from "./mcp-ui-resource";
import { renderMarkdown, CodeBlockCopyButton, ToolActivitySummary } from "./chat-message-helpers";
import type { AgentPhase, AgentProgressState } from "../hooks/use-agent-progress";
import { PHASE_LABELS } from "../hooks/use-agent-progress";
import { InlineClarificationCard } from "./plan/inline-clarification";

// ─── Phase → Icon mapping ─────────────────────────────────────
function PhaseIcon({ phase, className = "" }: { phase: AgentPhase; className?: string }) {
  const base = `shrink-0 ${className}`;
  switch (phase) {
    case "thinking": return <Brain className={`${base} text-brand-400 animate-pulse`} />;
    case "planning": return <ListChecks className={`${base} text-brand-400 animate-pulse`} />;
    case "clarifying": return <Brain className={`${base} text-amber-400`} />;
    case "reading_files": return <Search className={`${base} text-blue-400`} />;
    case "writing_files": return <FileEdit className={`${base} text-blue-400 animate-pulse`} />;
    case "running_command": return <Terminal className={`${base} text-purple-400 animate-pulse`} />;
    case "installing": return <Package className={`${base} text-orange-400 animate-pulse`} />;
    case "testing": return <Cpu className={`${base} text-indigo-400 animate-pulse`} />;
    case "fixing": return <Wrench className={`${base} text-amber-400 animate-spin`} />;
    case "streaming_response": return <Loader2 className={`${base} text-brand-400 animate-spin`} />;
    case "completed": return <Check className={`${base} text-green-500`} />;
    case "failed": return <AlertCircle className={`${base} text-red-400`} />;
    case "cancelled": return <XCircle className={`${base} text-muted-foreground`} />;
    default: return <Loader2 className={`${base} text-brand-400 animate-spin`} />;
  }
}

// ─── Streaming Status Indicator ───────────────────────────────
// Shown inline beneath the message header while content is also streaming
function StreamingStatus({ progress }: { progress?: AgentProgressState }) {
  if (!progress || progress.phase === "streaming_response") return null;

  const isError = progress.phase === "failed";
  const isCancelled = progress.phase === "cancelled";

  return (
    <div className={`flex items-center gap-1.5 text-xs mb-1.5 ${isError ? "text-red-400" :
        isCancelled ? "text-muted-foreground" :
          "text-muted-foreground"
      }`}>
      <PhaseIcon phase={progress.phase} className="h-3 w-3" />
      <span>{progress.message}</span>
    </div>
  );
}

// ─── Glowing Progress Card (formerly WaitingIndicator) ──────────
// Shown during agent execution when no content has streamed yet, or while terminal commands run
function GlowingProgressCard({ progress }: { progress?: AgentProgressState }) {
  const phase = progress?.phase ?? "thinking";
  const message = progress?.message ?? "Thinking…";

  // Grab the agent timeline to show a cool checklist
  const agentTimeline = useEditorStore((s) => s.agentTimeline);

  const isError = phase === "failed";
  const isCancelled = phase === "cancelled";

  // Take the last 3 completed/in_progress events
  const visibleEvents = agentTimeline
    .filter(t => t.status !== "failed" && !t.message.includes("undefined"))
    .slice(-4);

  return (
    <div className="relative mt-2 mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-6 shadow-2xl">
      {/* Background radial glow */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand-600/10 to-transparent pointer-events-none" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-500/20 blur-[60px] pointer-events-none rounded-full" />

      {/* Orb */}
      <div className="flex flex-col items-center relative z-10">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-400/20 via-purple-500/20 to-transparent border border-white/10 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
          <Sparkles className="h-7 w-7 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-pulse" />
          {/* subtle rotating dashed border effect */}
          <div className="absolute inset-0 rounded-full border border-dashed border-white/20 animate-[spin_10s_linear_infinite]" />
        </div>

        {/* Title */}
        <h3 className="mt-4 text-sm font-semibold text-white tracking-wide">
          {message}
        </h3>

        {/* Dynamic Checklist */}
        <div className="mt-4 w-full flex flex-col gap-2 relative">
          {visibleEvents.map((evt, idx) => {
            const isLast = idx === visibleEvents.length - 1;
            const isSpinning = isLast && !isError && phase !== "completed";
            return (
              <div key={evt.id} className="flex items-center gap-2.5 animate-in slide-in-from-bottom-2 fade-in duration-300 transition-all">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/30">
                  {isSpinning ? (
                    <Loader2 className="h-3 w-3 text-brand-400 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 text-brand-400" />
                  )}
                </div>
                <span className={`text-[11px] font-medium truncate ${isSpinning ? "text-brand-100" : "text-muted-foreground"}`}>
                  {evt.message}
                </span>
              </div>
            );
          })}

          {visibleEvents.length === 0 && !isError && (
            <div className="flex items-center gap-2.5 opacity-60">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/10 border border-brand-500/20">
                <Loader2 className="h-3 w-3 text-brand-400 animate-spin" />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">Preparing workspace…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────
function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full h-0.5 bg-muted/50 rounded-full overflow-hidden my-1.5">
      <div
        className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

// ─── Thinking Section ──────────────────────────────────────────
function ThinkingSection({
  content,
  isStreaming,
  summaryLine,
}: {
  content: string;
  isStreaming: boolean;
  summaryLine?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);
  const wordCount = content ? content.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) setIsOpen(true);
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (isOpen && isStreaming && scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (isNearBottom) el.scrollTop = el.scrollHeight;
    }
  }, [content, isOpen, isStreaming]);

  // Derive a 1-line summary from the first meaningful sentence if not provided
  const displaySummary = summaryLine || (() => {
    if (!content) return "";
    const firstSentence = content.replace(/\n+/g, " ").trim().split(/[.!?]/)[0];
    if (!firstSentence) return "";
    return firstSentence.length > 80
      ? firstSentence.slice(0, 77) + "…"
      : firstSentence;
  })();

  return (
    <div className="mb-2 rounded-md border border-border/50 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="w-full cursor-pointer select-none px-2.5 py-1.5 text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
      >
        <Brain className={`h-3 w-3 text-brand-400 shrink-0 ${isStreaming ? "animate-pulse" : ""}`} />
        <span className="flex-1 text-left truncate">
          {isStreaming ? "Thinking…" : (displaySummary || "Thought process")}
        </span>
        <span className="text-[10px] text-muted-foreground/40 shrink-0">{wordCount}w</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div
          ref={scrollRef}
          className="px-2.5 pb-2 text-muted-foreground/80 whitespace-pre-wrap max-h-64 overflow-y-auto text-[11px] leading-relaxed scroll-smooth border-t border-border/30"
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

// ─── Main ChatMessage Component ────────────────────────────────
interface ChatMessageProps {
  message: ChatMessageType;
  /** Called when the user answers an inline clarification question so the parent
   * can forward the answer to the AI via sendMessage. */
  onClarificationAnswer?: (content: string) => void;
}

export const ChatMessage = memo(function ChatMessage({ message, onClarificationAnswer }: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasThinking = !!message.thinkingContent;

  // Derive progress — prefer new typed field, fall back to legacy liveStatus
  const agentProgress: AgentProgressState | undefined =
    message.agentProgress ??
    (message.liveStatus
      ? (() => {
        // Backward-compat: parse legacy colon-string format
        const colonIdx = message.liveStatus.indexOf(":");
        const KNOWN = new Set(["plan", "tool_call", "tool_result", "status"]);
        const maybeType = colonIdx > 0 ? message.liveStatus.slice(0, colonIdx) : "";
        const isPrefixed = KNOWN.has(maybeType);
        const msg = isPrefixed ? message.liveStatus.slice(colonIdx + 1) : message.liveStatus;
        const phase: AgentPhase =
          maybeType === "tool_call" ? "writing_files" :
            maybeType === "tool_result" ? "completed" :
              maybeType === "plan" ? "planning" :
                "thinking";
        return { phase, message: msg || PHASE_LABELS[phase] };
      })()
      : undefined);

  const isWaiting = message.isStreaming && !message.content && !hasThinking;
  const isActivelyStreaming = message.isStreaming && !!(message.content || hasThinking);
  const isTerminal =
    agentProgress?.phase === "failed" ||
    agentProgress?.phase === "cancelled";

  const [undoing, setUndoing] = useState(false);
  const [userMsgExpanded, setUserMsgExpanded] = useState(false);
  const { projectId, updateMessageFields } = useEditorStore();

  // ─── Inline clarification send ────────────────────────────────
  const handleClarificationAnswer = useCallback(
    (questionId: string, answer: string) => {
      // Update local UI state to mark the question as answered
      updateMessageFields(message.id, {
        clarificationQuestion: message.clarificationQuestion
          ? { ...message.clarificationQuestion, answered: true, answer }
          : undefined,
      });
      // Build the outgoing content
      const content =
        answer === "__skipped__"
          ? `[Skipped: "${message.clarificationQuestion?.question ?? "question"}"]`
          : answer;
      // Add a visible user message in the chat store
      useEditorStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      });
      // Forward to parent (chat-panel) which calls sendMessage to reach the API
      onClarificationAnswer?.(content);
    },
    [message.id, message.clarificationQuestion, updateMessageFields, onClarificationAnswer]
  );

  const handleClarificationSkip = useCallback(
    (questionId: string) => {
      handleClarificationAnswer(questionId, "__skipped__");
    },
    [handleClarificationAnswer]
  );

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

  // Memoize rendered markdown
  const renderedHtml = useMemo(() => {
    if (!message.content) return "";
    const content =
      isActivelyStreaming
        ? message.content.replace(/:\s*$/, "")
        : message.content;
    return renderMarkdown(content);
  }, [message.content, isActivelyStreaming]);

  // Live tool call cards (from liveToolCalls array)
  const liveToolCalls = message.liveToolCalls ?? [];
  // Show cards only during streaming or if they recently completed (< 30s)
  const visibleToolCalls = isActivelyStreaming || isWaiting
    ? liveToolCalls
    : liveToolCalls.filter((tc) => tc.status !== "running");

  // Progress percent (for plan step tracking)
  const progressPercent = agentProgress?.percent;

  return (
    <div
      className={`flex gap-3 px-4 py-3 ${isUser ? "" : "bg-muted/30"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${isUser
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
        {/* Header row */}
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

        {/* Attachments (user messages) */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}

        {/* Project file attachments (user messages) */}
        {isUser && message.projectFiles && message.projectFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {message.projectFiles.map((filePath) => (
              <span
                key={filePath}
                className="inline-flex items-center gap-1 rounded-md bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 text-[10px] text-brand-400"
              >
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {filePath.split("/").pop()}
              </span>
            ))}
          </div>
        )}

        {/* Thinking section */}
        {message.thinkingContent && (
          <ThinkingSection
            content={message.thinkingContent}
            isStreaming={!!message.isStreaming}
          />
        )}

        {/* Progress bar when plan step position is known */}
        {progressPercent !== undefined && message.isStreaming && (
          <ProgressBar percent={progressPercent} />
        )}

        {/* Live tool call cards */}
        {visibleToolCalls.length > 0 && (
          <div className="mb-1.5 space-y-0.5">
            {visibleToolCalls.map((tc) => (
              <ToolCallCard key={tc.id} {...tc} />
            ))}
          </div>
        )}

        {/* Inline status (only when content is also streaming — not waiting state) */}
        {message.isStreaming && !isWaiting && (
          <StreamingStatus progress={agentProgress} />
        )}

        {/* Undone badge */}
        {message.undone && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Undo2 className="h-3 w-3" />
            <span className="font-medium">Changes undone</span>
          </div>
        )}

        {/* Main content */}
        {isWaiting ? (
          <GlowingProgressCard progress={agentProgress} />
        ) : message.content ? (
          <div
            className={`prose-editor text-sm leading-relaxed ${message.undone ? "text-muted-foreground opacity-60" : "text-foreground"
              } ${isActivelyStreaming ? "streaming-bubble" : ""}`}
          >
            {/* Collapse long user messages (>500 chars) to avoid overwhelming the chat */}
            {isUser && message.content.length > 500 && !userMsgExpanded ? (
              <>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content.slice(0, 500) + "…") }} />
                <button
                  onClick={() => setUserMsgExpanded(true)}
                  className="mt-1 text-xs text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1"
                >
                  <ChevronDown className="h-3 w-3" />
                  Show full prompt ({Math.ceil(message.content.length / 1000)}k chars)
                </button>
              </>
            ) : (
              <>
                <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                {isUser && message.content.length > 500 && userMsgExpanded && (
                  <button
                    onClick={() => setUserMsgExpanded(false)}
                    className="mt-1 text-xs text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1"
                  >
                    <ChevronDown className="h-3 w-3 rotate-180" />
                    Collapse
                  </button>
                )}
              </>
            )}
            {isActivelyStreaming && (
              <span className="streaming-caret inline-flex items-center ml-1 align-middle gap-[3px]">
                <span className="status-dot-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span className="status-dot-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span className="status-dot-3 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
            )}
          </div>
        ) : isTerminal && !isWaiting ? (
          agentProgress?.phase === "failed" ? (
            <ErrorRecoveryCard
              kind="generic"
              message={agentProgress.message}
            />
          ) : (
            <GlowingProgressCard progress={agentProgress} />
          )
        ) : null}
        
                {/* Inline clarification question card */}
        {!isUser && message.clarificationQuestion && (
          <InlineClarificationCard
            questionId={message.clarificationQuestion.id}
            question={message.clarificationQuestion.question}
            options={message.clarificationQuestion.options}
            context={message.clarificationQuestion.context}
            answered={message.clarificationQuestion.answered}
            answer={message.clarificationQuestion.answer}
            onAnswer={handleClarificationAnswer}
            onSkip={handleClarificationSkip}
          />
        )}

        {/* MCP-Apps interactive UI resources — sandboxed iframes */}
        {!isUser && projectId && message.mcpResources && Object.values(message.mcpResources).length > 0 && (
          <div className="space-y-1">
            {Object.values(message.mcpResources).map((res) => (
              <McpUiResourceCard
                key={res.toolCallId}
                resource={res}
                projectId={projectId}
                onResource={(newRes) => {
                  updateMessageFields(message.id, {
                    mcpResources: {
                      ...(message.mcpResources ?? {}),
                      [newRes.toolCallId]: newRes,
                    },
                  });
                }}
              />
            ))}
          </div>
        )}

        {/* Tool activity summary — shown for history messages with tool calls */}
        {!isUser && !message.isStreaming && !message.content && message.hadToolCalls && message.toolCallDetails && (
          <ToolActivitySummary toolCalls={message.toolCallDetails} />
        )}
        {!isUser && !message.isStreaming && message.content && message.hadToolCalls && message.toolCallDetails && (
          <div className="mt-1.5">
            <ToolActivitySummary toolCalls={message.toolCallDetails} />
          </div>
        )}

        {/* Token counter */}
        {!isUser && !message.isStreaming && message.usage && (
          <TokenCounter usage={message.usage} />
        )}

        {/* Undo button */}
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

        {/* ─── Suggestion Pills ────────────────────────────────────────── */}
        {!isUser && !message.isStreaming && message.content && isTerminal && !message.clarificationQuestion && !message.undone && (
          <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
            {["Make the stats pop more", "Add a dark / light toggle", "Improve the activity table", "Add more animations"].map((sugg) => (
              <button
                key={sugg}
                onClick={() => {
                  const chatInput = document.querySelector<HTMLTextAreaElement>('textarea');
                  if (chatInput) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                    nativeInputValueSetter?.call(chatInput, sugg);
                    chatInput.dispatchEvent(new Event("input", { bubbles: true }));
                    chatInput.focus();
                  }
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all duration-200"
              >
                {sugg}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
