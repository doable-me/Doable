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
  const { messages, typingUsers, sendMessage, sendTyping } = useTeamChat(subscribe, send, joined);
  const { events, toasts, dismissToast } = useActivity(subscribe, joined, userId);

  // Remote cursors
  const { cursors, sendCursorMove } = useRemoteCursors(subscribe, send, joined, userId);

  // ─── CRDT (Yjs) ──────────────────────────────────────────
  const [yjsProvider, setYjsProvider] = useState<YjsWsProvider | null>(null);
  const yjsProviderRef = useRef<YjsWsProvider | null>(null);

  useEffect(() => {
    if (joined && members.length > 1 && !yjsProviderRef.current) {
      const provider = new YjsWsProvider(send, subscribe);
      yjsProviderRef.current = provider;
      setYjsProvider(provider);
    }

    if ((!joined || members.length <= 1) && yjsProviderRef.current) {
      yjsProviderRef.current.destroy();
      yjsProviderRef.current = null;
      setYjsProvider(null);
    }

    return () => {
      yjsProviderRef.current?.destroy();
      yjsProviderRef.current = null;
    };
  }, [joined, members.length, send, subscribe]);

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
  }), [
    connectionState, joined, members, updateFile, updateView,
    messages, typingUsers, sendMessage, sendTyping,
    events, toasts, dismissToast, filesOpen, sendFileOpen, sendFileClose,
    cursors, sendCursorMove, subscribe, send, yjsProvider,
  ]);

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}
