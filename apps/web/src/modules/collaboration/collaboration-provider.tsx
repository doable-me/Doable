"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { CollaborationContext, type CollaborationContextValue } from "./collaboration-context";
import { useProjectRoom } from "./hooks/use-project-room";
import { usePresence } from "./hooks/use-presence";
import { useTeamChat } from "./hooks/use-team-chat";
import { useActivity } from "./hooks/use-activity";

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
  }), [
    connectionState, joined, members, updateFile, updateView,
    messages, typingUsers, sendMessage, sendTyping,
    events, toasts, dismissToast, filesOpen, sendFileOpen, sendFileClose,
  ]);

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}
