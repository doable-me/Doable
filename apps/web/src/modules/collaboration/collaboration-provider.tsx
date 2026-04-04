"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { CollaborationContext, type CollaborationContextValue } from "./collaboration-context";
import { useProjectRoom } from "./hooks/use-project-room";
import { usePresence } from "./hooks/use-presence";
import { useTeamChat } from "./hooks/use-team-chat";
import { useActivity } from "./hooks/use-activity";
import { useRemoteCursors } from "./cursors";
import { YjsWsProvider } from "./crdt";

interface Props {
  projectId: string | null;
  userId: string;
  displayName: string;
  children: React.ReactNode;
}

export function CollaborationProvider({ projectId, userId, displayName, children }: Props) {
  const { members, joined, send, subscribe, connectionState } = useProjectRoom(projectId);
  const { updateFile, updateView } = usePresence(send, joined);
  const { messages, typingUsers, sendMessage, sendTyping, unreadCount, markAsRead, setChatVisible } = useTeamChat(subscribe, send, joined);
  const [chatPopoutOpen, setChatPopoutOpen] = useState(false);
  const { events, toasts, dismissToast } = useActivity(subscribe, joined, userId);

  // Remote cursors
  const { cursors, sendCursorMove } = useRemoteCursors(subscribe, send, joined, userId);

  // ─── CRDT (Yjs) — always-on when joined ────────────────
  // CRDT must be active even with a single user so AI writes propagate
  const [yjsProvider, setYjsProvider] = useState<YjsWsProvider | null>(null);
  const yjsProviderRef = useRef<YjsWsProvider | null>(null);

  useEffect(() => {
    if (joined && !yjsProviderRef.current) {
      const provider = new YjsWsProvider(send, subscribe);
      yjsProviderRef.current = provider;
      setYjsProvider(provider);
    }

    if (!joined && yjsProviderRef.current) {
      yjsProviderRef.current.destroy();
      yjsProviderRef.current = null;
      setYjsProvider(null);
    }
  }, [joined, send, subscribe]);

  // Separate unmount-only cleanup to avoid React Strict Mode double-mount
  // destroying the provider between mount cycles
  useEffect(() => {
    return () => {
      yjsProviderRef.current?.destroy();
      yjsProviderRef.current = null;
    };
  }, []);

  // File awareness state
  const [filesOpen, setFilesOpen] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!joined) return;
    const unsub = subscribe((msg: any) => {
      if (msg.type === "awareness:files_open") {
        setFilesOpen(msg.data);
      }
    });
    return unsub;
  }, [joined, subscribe]);

  const sendFileOpen = useCallback((filePath: string) => {
    if (joined) send({ type: "awareness:file_open", filePath });
  }, [joined, send]);

  const sendFileClose = useCallback((filePath: string) => {
    if (joined) send({ type: "awareness:file_close", filePath });
  }, [joined, send]);

  // ─── AI stream events (Phase B) ────────────────────────
  const [aiStreamChunks, setAiStreamChunks] = useState<Map<string, string>>(new Map());
  const [aiTypingUsers, setAiTypingUsers] = useState<Map<string, string>>(new Map());
  const [aiQueue, setAiQueue] = useState<Array<{ id: string; userId: string; displayName: string; content: string; position: number }>>([]);

  useEffect(() => {
    if (!joined) return;
    const unsub = subscribe((msg: any) => {
      switch (msg.type) {
        case "ai:stream-chunk": {
          setAiStreamChunks(prev => {
            const next = new Map(prev);
            const current = next.get(msg.messageId) ?? "";
            next.set(msg.messageId, current + msg.chunk);
            return next;
          });
          break;
        }
        case "ai:stream-end": {
          setAiStreamChunks(prev => {
            const next = new Map(prev);
            next.delete(msg.messageId);
            return next;
          });
          break;
        }
        case "ai:typing": {
          setAiTypingUsers(prev => {
            const next = new Map(prev);
            if (msg.isTyping) {
              next.set(msg.userId, msg.displayName);
            } else {
              next.delete(msg.userId);
            }
            return next;
          });
          break;
        }
        case "ai:queue-update": {
          setAiQueue(msg.queue ?? []);
          break;
        }
        case "ai:message-sent": {
          // When a user sends an AI message, they stopped typing
          setAiTypingUsers(prev => {
            if (!prev.has(msg.userId)) return prev;
            const next = new Map(prev);
            next.delete(msg.userId);
            return next;
          });
          break;
        }
      }
    });
    return unsub;
  }, [joined, subscribe]);

  // ─── Visual edit collaboration (Phase C) ───────────────
  const [remoteSelections, setRemoteSelections] = useState<Map<string, {
    userId: string;
    displayName: string;
    color: string;
    selector: string;
    boundingRect: { x: number; y: number; width: number; height: number };
  }>>(new Map());

  const [remoteVisualCursors, setRemoteVisualCursors] = useState<Map<string, {
    displayName: string;
    color: string;
    x: number;
    y: number;
  }>>(new Map());

  useEffect(() => {
    if (!joined) return;
    const unsub = subscribe((msg: any) => {
      switch (msg.type) {
        case "visual-edit:select": {
          setRemoteSelections(prev => {
            const next = new Map(prev);
            next.set(msg.userId, {
              userId: msg.userId,
              displayName: msg.displayName,
              color: msg.color,
              selector: msg.selector,
              boundingRect: msg.boundingRect,
            });
            return next;
          });
          break;
        }
        case "visual-edit:deselect": {
          setRemoteSelections(prev => {
            const next = new Map(prev);
            next.delete(msg.userId);
            return next;
          });
          break;
        }
        case "visual-edit:cursor-move": {
          setRemoteVisualCursors(prev => {
            const next = new Map(prev);
            next.set(msg.userId, {
              displayName: msg.displayName,
              color: msg.color,
              x: msg.x,
              y: msg.y,
            });
            return next;
          });
          break;
        }
      }
    });
    return unsub;
  }, [joined, subscribe]);

  // Broadcast own visual edit actions
  const sendVisualEditSelect = useCallback((selector: string, boundingRect: { x: number; y: number; width: number; height: number }) => {
    if (joined) send({ type: "visual-edit:select", selector, boundingRect });
  }, [joined, send]);

  const sendVisualEditDeselect = useCallback(() => {
    if (joined) send({ type: "visual-edit:deselect" });
  }, [joined, send]);

  const sendVisualEditStyleChange = useCallback((selector: string, property: string, value: string) => {
    if (joined) send({ type: "visual-edit:style-change", selector, property, value });
  }, [joined, send]);

  const sendVisualEditTextChange = useCallback((selector: string, newText: string) => {
    if (joined) send({ type: "visual-edit:text-change", selector, newText });
  }, [joined, send]);

  const sendVisualEditCursorMove = useCallback((x: number, y: number) => {
    if (joined) send({ type: "visual-edit:cursor-move", x, y });
  }, [joined, send]);

  // AI typing broadcast
  const sendAiTyping = useCallback((isTyping: boolean) => {
    if (joined) send({ type: "ai:typing", isTyping });
  }, [joined, send]);

  const value = useMemo<CollaborationContextValue>(() => ({
    connectionState,
    joined,
    members,
    updateFile,
    updateView,
    messages,
    typingUsers,
    sendMessage,
    sendTyping,
    unreadCount,
    markAsRead,
    setChatVisible,
    chatPopoutOpen,
    setChatPopoutOpen,
    events,
    toasts,
    dismissToast,
    filesOpen,
    sendFileOpen,
    sendFileClose,
    cursors,
    sendCursorMove,
    subscribe,
    send,
    yjsProvider,
    // Phase B: AI collaboration
    aiStreamChunks,
    aiTypingUsers,
    aiQueue,
    sendAiTyping,
    // Phase C: Visual edit collaboration
    remoteSelections,
    remoteVisualCursors,
    sendVisualEditSelect,
    sendVisualEditDeselect,
    sendVisualEditStyleChange,
    sendVisualEditTextChange,
    sendVisualEditCursorMove,
  }), [
    connectionState, joined, members, updateFile, updateView,
    messages, typingUsers, sendMessage, sendTyping, unreadCount, markAsRead, setChatVisible, chatPopoutOpen, setChatPopoutOpen,
    events, toasts, dismissToast, filesOpen, sendFileOpen, sendFileClose,
    cursors, sendCursorMove, subscribe, send, yjsProvider,
    aiStreamChunks, aiTypingUsers, aiQueue, sendAiTyping,
    remoteSelections, remoteVisualCursors,
    sendVisualEditSelect, sendVisualEditDeselect,
    sendVisualEditStyleChange, sendVisualEditTextChange, sendVisualEditCursorMove,
  ]);

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}
