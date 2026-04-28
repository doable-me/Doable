"use client";

import { useCallback, useRef, useState } from "react";
import { MessageCircle, Eye, EyeOff } from "lucide-react";
import { useCollaboration } from "@/modules/collaboration/collaboration-context";
import { useAuth } from "@/hooks/use-auth";
import { useDesignComments } from "./use-design-comments";
import {
  DesignCommentsOverlay,
  NewCommentInput,
  CommentPlacementCursor,
} from "./design-comments";

interface DesignCommentsLayerProps {
  projectId: string;
  /** Ref to the preview wrapper div (the one containing the iframe) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether design mode is active */
  active: boolean;
}

/**
 * Self-contained layer that manages design comments.
 * Renders comment pins, placement cursor, and thread popovers
 * over the preview iframe.
 */
export function DesignCommentsLayer({
  projectId,
  containerRef,
  active,
}: DesignCommentsLayerProps) {
  const { user } = useAuth();
  const { subscribe, send, joined } = useCollaboration();
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const dc = useDesignComments({
    projectId,
    userId: user?.id ?? "",
    displayName: user?.displayName ?? "",
    subscribe,
    send,
    joined,
  });

  // ─── Handle click on the preview area to place a comment ──
  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      if (!dc.commentMode || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const xPercent = (x / rect.width) * 100;
      const yPercent = (y / rect.height) * 100;
      dc.setPlacementPos({ x, y, xPercent, yPercent });
      dc.setActiveCommentId(null);
    },
    [dc.commentMode, containerRef],
  );

  // ─── Track cursor for placement mode ──────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dc.commentMode) return;
      setCursorPos({ x: e.clientX, y: e.clientY });
    },
    [dc.commentMode],
  );

  const handleMouseLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  if (!active) return null;

  const commentCount = dc.comments.filter((c) => !c.parentId && !c.resolved).length;

  return (
    <>
      {/* ─── Comment Controls (top-right of preview area) ─── */}
      <div className="absolute top-2 right-2 z-[9997] flex items-center gap-1">
        {/* Toggle comment visibility */}
        {dc.comments.length > 0 && (
          <button
            type="button"
            onClick={() => dc.setShowResolved(!dc.showResolved)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all backdrop-blur-sm ${
              dc.showResolved
                ? "bg-muted/80 text-foreground"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
            title={dc.showResolved ? "Hide resolved" : "Show resolved"}
          >
            {dc.showResolved ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        )}

        {/* Add comment button */}
        <button
          type="button"
          onClick={dc.toggleCommentMode}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all backdrop-blur-sm ${
            dc.commentMode
              ? "bg-brand-500 text-white shadow-md"
              : "bg-muted/80 text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title={dc.commentMode ? "Cancel (Esc)" : "Add comment"}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{dc.commentMode ? "Click to place" : commentCount > 0 ? `${commentCount}` : "Comment"}</span>
        </button>
      </div>

      {/* ─── Click capture layer for comment placement ─── */}
      {dc.commentMode && (
        <div
          className="absolute inset-0 z-[9996] cursor-crosshair"
          onClick={handlePreviewClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              dc.setCommentMode(false);
              dc.setPlacementPos(null);
            }
          }}
          tabIndex={-1}
        />
      )}

      {/* ─── Placement cursor ─── */}
      {dc.commentMode && cursorPos && !dc.placementPos && (
        <CommentPlacementCursor x={cursorPos.x} y={cursorPos.y} />
      )}

      {/* ─── New comment input ─── */}
      {dc.placementPos && (
        <NewCommentInput
          x={dc.placementPos.x}
          y={dc.placementPos.y}
          onSubmit={(content) => {
            dc.addComment(content, dc.placementPos!.xPercent, dc.placementPos!.yPercent);
          }}
          onCancel={() => {
            dc.setPlacementPos(null);
            dc.setCommentMode(false);
          }}
        />
      )}

      {/* ─── Comment pins + threads ─── */}
      {!dc.commentMode && dc.comments.length > 0 && (
        <DesignCommentsOverlay
          comments={dc.comments}
          activeCommentId={dc.activeCommentId}
          onPinClick={(id) => dc.setActiveCommentId(dc.activeCommentId === id ? null : id)}
          onClose={() => dc.setActiveCommentId(null)}
          onReply={dc.replyToComment}
          onResolve={dc.resolveComment}
          onUnresolve={dc.unresolveComment}
          onDelete={dc.deleteComment}
          currentUserId={user?.id ?? ""}
          showResolved={dc.showResolved}
          containerRef={containerRef}
        />
      )}
    </>
  );
}
