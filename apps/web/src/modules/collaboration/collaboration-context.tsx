"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProjectRoom } from "./hooks/use-project-room";
import { usePresence } from "./hooks/use-presence";
import { useTeamChat } from "./hooks/use-team-chat";
import { useActivity } from "./hooks/use-activity";
import { useRemoteCursors } from "./cursors";
import type { PresenceUser } from "@doable/shared";

interface CollaborationContextValue {
  // Presence
  members: PresenceUser[];
  joined: boolean;
  updateFile: (filePath: string | null) => void;
  updateView: (view: "code" | "preview" | "chat" | "team") => void;
  // Team chat
  messages: ReturnType<typeof useTeamChat>["messages"];
  typingUsers: ReturnType<typeof useTeamChat>["typingUsers"];
  sendMessage: ReturnType<typeof useTeamChat>["sendMessage"];
  sendTyping: ReturnType<typeof useTeamChat>["sendTyping"];
  // Activity
  toasts: ReturnType<typeof useActivity>["toasts"];
  dismissToast: ReturnType<typeof useActivity>["dismissToast"];
  // Connection
  connectionState: string;
  // Cursors
  cursors: Map<string, any>;
  sendCursorMove: (filePath: string, line: number, column: number) => void;
  subscribe: (handler: (msg: any) => void) => () => void;
  send: (msg: Record<string, unknown>) => void;
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

interface ProviderProps {
  projectId: string;
  userId: string;
  displayName: string;
  children: ReactNode;
}

export function CollaborationProvider({ projectId, userId, children }: ProviderProps) {
  const room = useProjectRoom(projectId || null);
  const presence = usePresence(room.send, room.joined);
  const chat = useTeamChat(room.subscribe, room.send, room.joined);
  const activity = useActivity(room.subscribe, room.joined, userId);
  const { cursors, sendCursorMove } = useRemoteCursors(room.subscribe, room.send, room.joined, userId);

  const value: CollaborationContextValue = {
    members: room.members as PresenceUser[],
    joined: room.joined,
    updateFile: presence.updateFile,
    updateView: presence.updateView,
    messages: chat.messages,
    typingUsers: chat.typingUsers,
    sendMessage: chat.sendMessage,
    sendTyping: chat.sendTyping,
    toasts: activity.toasts,
    dismissToast: activity.dismissToast,
    connectionState: room.connectionState,
    cursors,
    sendCursorMove,
    subscribe: room.subscribe,
    send: room.send,
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}

export function useCollaboration(): CollaborationContextValue {
  const ctx = useContext(CollaborationContext);
  if (!ctx) {
    throw new Error("useCollaboration must be used within a CollaborationProvider");
  }
  return ctx;
}
