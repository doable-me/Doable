"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageCircle, Check, X, Send, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

export interface DesignComment {
  id: string;
  projectId: string;
  userId: string;
  displayName: string | null;
  userColor: string | null;
  xPercent: number;
  yPercent: number;
  selector: string | null;
  pagePath: string;
  content: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
}

// ─── Comment Pin (the dot on the canvas) ────────────────────

interface CommentPinProps {
  comment: DesignComment;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

export function CommentPin({ comment, index, isActive, onClick }: CommentPinProps) {
  const color = comment.userColor ?? "#64B5F6";

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute z-[9998] flex items-center justify-center rounded-full border-2 shadow-lg transition-all duration-150 cursor-pointer hover:scale-110 ${
        isActive
          ? "w-8 h-8 -translate-x-4 -translate-y-4 ring-2 ring-white/50"
          : comment.resolved
            ? "w-6 h-6 -translate-x-3 -translate-y-3 opacity-50"
            : "w-7 h-7 -translate-x-3.5 -translate-y-3.5"
      }`}
      style={{
        left: `${comment.xPercent}%`,
        top: `${comment.yPercent}%`,
        backgroundColor: color,
        borderColor: isActive ? "white" : "rgba(255,255,255,0.7)",
      }}
      title={`${comment.displayName ?? "User"}: ${comment.content.slice(0, 60)}`}
    >
      <span className="text-[10px] font-bold text-white leading-none">
        {index + 1}
      </span>
    </button>
  );
}

// ─── Comment Thread Popover ─────────────────────────────────

interface CommentThreadProps {
  comment: DesignComment;
  replies: DesignComment[];
  onClose: () => void;
  onReply: (content: string) => void;
  onResolve: () => void;
  onUnresolve: () => void;
  onDelete: (commentId: string) => void;
  currentUserId: string;
  /** Position relative to the iframe container */
  anchorX: number;
  anchorY: number;
}

export function CommentThread({
  comment,
  replies,
  onClose,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  currentUserId,
  anchorX,
  anchorY,
}: CommentThreadProps) {
  const [replyText, setReplyText] = useState("");
  const [showReplies, setShowReplies] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(trimmed);
    setReplyText("");
  }, [replyText, onReply]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  }, [handleSubmit, onClose]);

  // Position the popover so it stays within viewport
  const style: React.CSSProperties = {
    position: "absolute",
    left: anchorX + 20,
    top: anchorY - 10,
    maxWidth: 320,
    minWidth: 260,
  };

  return (
    <div
      ref={containerRef}
      className="z-[9999] rounded-xl border border-border bg-popover shadow-xl backdrop-blur-md"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: comment.userColor ?? "#64B5F6" }}
          >
            {(comment.displayName ?? "U")[0]?.toUpperCase()}
          </div>
          <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
            {comment.displayName ?? "User"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTimeAgo(comment.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {comment.resolved ? (
            <button
              type="button"
              onClick={onUnresolve}
              className="p-1 rounded text-green-400 hover:bg-muted transition-colors"
              title="Re-open comment"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onResolve}
              className="p-1 rounded text-muted-foreground hover:text-green-400 hover:bg-muted transition-colors"
              title="Resolve comment"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {comment.userId === currentUserId && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-muted transition-colors"
              title="Delete comment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main comment content */}
      <div className="px-3 py-2">
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{comment.content}</p>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>
          {showReplies && (
            <div className="max-h-[200px] overflow-y-auto">
              {replies.map((reply) => (
                <div key={reply.id} className="px-3 py-1.5 border-t border-border/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                      style={{ backgroundColor: reply.userColor ?? "#64B5F6" }}
                    >
                      {(reply.displayName ?? "U")[0]?.toUpperCase()}
                    </div>
                    <span className="text-[11px] font-medium text-foreground">{reply.displayName ?? "User"}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTimeAgo(reply.createdAt)}</span>
                    {reply.userId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => onDelete(reply.id)}
                        className="ml-auto p-0.5 rounded text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete reply"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words pl-5.5">{reply.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply input */}
      {!comment.resolved && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply..."
              rows={1}
              className="flex-1 resize-none rounded-lg bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:bg-muted transition-colors"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!replyText.trim()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-brand-400 disabled:opacity-30"
              title="Send reply"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comment Placement Cursor ───────────────────────────────

interface CommentPlacementCursorProps {
  x: number;
  y: number;
}

export function CommentPlacementCursor({ x, y }: CommentPlacementCursorProps) {
  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{ left: x - 12, top: y - 12 }}
    >
      <div className="relative">
        <MessageCircle className="w-6 h-6 text-brand-400 fill-brand-400/20" />
        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-400 border border-white" />
      </div>
    </div>
  );
}

// ─── New Comment Input (after clicking to place) ────────────

interface NewCommentInputProps {
  x: number;
  y: number;
  onSubmit: (content: string) => void;
  onCancel: () => void;
}

export function NewCommentInput({ x, y, onSubmit, onCancel }: NewCommentInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }, [text, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  return (
    <div
      className="absolute z-[9999] rounded-xl border border-border bg-popover shadow-xl backdrop-blur-md"
      style={{ left: x + 16, top: y - 8, minWidth: 240, maxWidth: 300 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <MessageCircle className="w-3.5 h-3.5 text-brand-400" />
        <span className="text-xs font-medium text-foreground">Add comment</span>
      </div>
      <div className="px-3 py-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leave a comment..."
          rows={2}
          className="w-full resize-none rounded-lg bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:bg-muted transition-colors"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5 px-3 py-1.5 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-brand-400 text-white hover:bg-brand-500 disabled:opacity-40 transition-colors"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

// ─── Comment Overlay (wraps all pins + thread on the preview) ──

export interface DesignCommentsOverlayProps {
  comments: DesignComment[];
  activeCommentId: string | null;
  onPinClick: (commentId: string) => void;
  onClose: () => void;
  onReply: (parentId: string, content: string) => void;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  currentUserId: string;
  showResolved: boolean;
  /** The iframe container ref to compute positions */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function DesignCommentsOverlay({
  comments,
  activeCommentId,
  onPinClick,
  onClose,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  currentUserId,
  showResolved,
  containerRef,
}: DesignCommentsOverlayProps) {
  // Separate top-level comments and replies
  const topLevel = comments.filter((c) => !c.parentId && (showResolved || !c.resolved));
  const repliesByParent = new Map<string, DesignComment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }

  const activeComment = activeCommentId ? topLevel.find((c) => c.id === activeCommentId) : null;
  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <>
      {/* Comment pins */}
      {topLevel.map((comment, i) => (
        <CommentPin
          key={comment.id}
          comment={comment}
          index={i}
          isActive={comment.id === activeCommentId}
          onClick={() => onPinClick(comment.id)}
        />
      ))}

      {/* Active comment thread */}
      {activeComment && containerRect && (
        <CommentThread
          comment={activeComment}
          replies={repliesByParent.get(activeComment.id) ?? []}
          onClose={onClose}
          onReply={(content) => onReply(activeComment.id, content)}
          onResolve={() => onResolve(activeComment.id)}
          onUnresolve={() => onUnresolve(activeComment.id)}
          onDelete={onDelete}
          currentUserId={currentUserId}
          anchorX={(activeComment.xPercent / 100) * containerRect.width}
          anchorY={(activeComment.yPercent / 100) * containerRect.height}
        />
      )}
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
