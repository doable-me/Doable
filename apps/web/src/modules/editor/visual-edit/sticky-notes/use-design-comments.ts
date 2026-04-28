"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import type { DesignComment } from "./design-comments";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface UseDesignCommentsOptions {
  projectId: string;
  userId: string;
  displayName: string;
  /** Subscribe to WS messages */
  subscribe: (handler: (msg: any) => void) => () => void;
  /** Send a WS message */
  send: (msg: Record<string, unknown>) => void;
  /** Whether we're joined to the WS room */
  joined: boolean;
}

export function useDesignComments({
  projectId,
  userId,
  displayName,
  subscribe,
  send,
  joined,
}: UseDesignCommentsOptions) {
  const [comments, setComments] = useState<DesignComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [placementPos, setPlacementPos] = useState<{ x: number; y: number; xPercent: number; yPercent: number } | null>(null);
  const loadedRef = useRef(false);

  // ─── Load comments from API ───────────────────────────────
  useEffect(() => {
    if (!projectId || loadedRef.current) return;
    loadedRef.current = true;

    apiFetch<{ data: any[] }>(`/design-comments/${projectId}`)
      .then((res) => {
        const mapped: DesignComment[] = res.data.map((r: any) => ({
          id: r.id,
          projectId: r.project_id,
          userId: r.user_id,
          displayName: r.display_name,
          userColor: r.user_color,
          xPercent: r.x_percent,
          yPercent: r.y_percent,
          selector: r.selector,
          pagePath: r.page_path,
          content: r.content,
          parentId: r.parent_id,
          resolved: r.resolved,
          createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
        }));
        setComments(mapped);
      })
      .catch((err) => console.error("[design-comments] Failed to load:", err));
  }, [projectId]);

  // ─── Listen for WS messages ───────────────────────────────
  useEffect(() => {
    if (!joined) return;
    const unsub = subscribe((msg: any) => {
      switch (msg.type) {
        case "design-comment:added": {
          const c = msg.comment as DesignComment;
          setComments((prev) => {
            // Avoid duplicates
            if (prev.some((p) => p.id === c.id)) return prev;
            return [...prev, c];
          });
          break;
        }
        case "design-comment:resolved": {
          setComments((prev) =>
            prev.map((c) => c.id === msg.commentId ? { ...c, resolved: true } : c)
          );
          break;
        }
        case "design-comment:unresolved": {
          setComments((prev) =>
            prev.map((c) => c.id === msg.commentId ? { ...c, resolved: false } : c)
          );
          break;
        }
        case "design-comment:deleted": {
          setComments((prev) => prev.filter((c) => c.id !== msg.commentId && c.parentId !== msg.commentId));
          if (activeCommentId === msg.commentId) setActiveCommentId(null);
          break;
        }
      }
    });
    return unsub;
  }, [joined, subscribe, activeCommentId]);

  // ─── Actions ──────────────────────────────────────────────

  const addComment = useCallback(
    (content: string, xPercent: number, yPercent: number, parentId?: string | null) => {
      const id = crypto.randomUUID();
      if (joined) {
        send({
          type: "design-comment:add",
          data: {
            id,
            xPercent,
            yPercent,
            selector: null,
            pagePath: "index.html",
            content,
            parentId: parentId ?? null,
          },
        });
      } else {
        // Fallback: POST directly to API
        apiFetch(`/design-comments/${projectId}`, {
          method: "POST",
          body: JSON.stringify({
            displayName,
            xPercent,
            yPercent,
            pagePath: "index.html",
            content,
            parentId: parentId ?? null,
          }),
        })
          .then((res: any) => {
            const r = res.data;
            const c: DesignComment = {
              id: r.id,
              projectId: r.project_id,
              userId: r.user_id,
              displayName: r.display_name,
              userColor: r.user_color,
              xPercent: r.x_percent,
              yPercent: r.y_percent,
              selector: r.selector,
              pagePath: r.page_path,
              content: r.content,
              parentId: r.parent_id,
              resolved: r.resolved,
              createdAt: typeof r.created_at === "string" ? r.created_at : new Date(r.created_at).toISOString(),
            };
            setComments((prev) => [...prev, c]);
          })
          .catch((err) => console.error("[design-comments] Failed to create:", err));
      }

      setPlacementPos(null);
      setCommentMode(false);
    },
    [joined, send, projectId, displayName],
  );

  const resolveComment = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, resolved: true } : c));
      if (joined) {
        send({ type: "design-comment:resolve", commentId });
      }
      apiFetch(`/design-comments/${projectId}/${commentId}/resolve`, { method: "PATCH" }).catch(() => {});
    },
    [joined, send, projectId],
  );

  const unresolveComment = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, resolved: false } : c));
      if (joined) {
        send({ type: "design-comment:unresolve", commentId });
      }
      apiFetch(`/design-comments/${projectId}/${commentId}/unresolve`, { method: "PATCH" }).catch(() => {});
    },
    [joined, send, projectId],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId));
      if (commentId === activeCommentId) setActiveCommentId(null);
      if (joined) {
        send({ type: "design-comment:delete", commentId });
      }
      apiFetch(`/design-comments/${projectId}/${commentId}`, { method: "DELETE" }).catch(() => {});
    },
    [joined, send, projectId, activeCommentId],
  );

  const replyToComment = useCallback(
    (parentId: string, content: string) => {
      // Find the parent comment to use its position for the reply
      const parent = comments.find((c) => c.id === parentId);
      if (!parent) return;
      addComment(content, parent.xPercent, parent.yPercent, parentId);
    },
    [comments, addComment],
  );

  const toggleCommentMode = useCallback(() => {
    setCommentMode((prev) => !prev);
    setPlacementPos(null);
    setActiveCommentId(null);
  }, []);

  return {
    comments,
    activeCommentId,
    setActiveCommentId,
    commentMode,
    toggleCommentMode,
    setCommentMode,
    showResolved,
    setShowResolved,
    placementPos,
    setPlacementPos,
    addComment,
    resolveComment,
    unresolveComment,
    deleteComment,
    replyToComment,
  };
}
