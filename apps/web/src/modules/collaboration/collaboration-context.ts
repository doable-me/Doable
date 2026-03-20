"use client";

import { createContext, useContext } from "react";

export interface PresenceUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "idle" | "away";
  currentFile: string | null;
  currentView: "code" | "preview" | "chat" | "team";
  joinedAt: string;
  lastActiveAt: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  userId: string | null;
  displayName: string | null;
  content: string;
  messageType: "user" | "system";
  mentions: string[];
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  userId: string;
  displayName: string | null;
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface CollaborationContextValue {
  // Connection
  connectionState: "connecting" | "connected" | "disconnected" | "reconnecting";
  joined: boolean;

  // Presence
  members: PresenceUser[];
  updateFile: (filePath: string | null) => void;
  updateView: (view: "code" | "preview" | "chat" | "team") => void;

  // Team Chat
  messages: ChatMessage[];
  typingUsers: Set<string>;
  sendMessage: (content: string, mentions?: string[]) => void;
  sendTyping: () => void;

  // Activity
  events: ActivityEvent[];
  toasts: ActivityEvent[];
  dismissToast: (id: string) => void;

  // File Awareness
  filesOpen: Record<string, string[]>;
  sendFileOpen: (filePath: string) => void;
  sendFileClose: (filePath: string) => void;
}

export const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export function useCollaboration(): CollaborationContextValue {
  const ctx = useContext(CollaborationContext);
  if (!ctx) {
    // Return a no-op context for components rendered outside the provider
    return {
      connectionState: "disconnected",
      joined: false,
      members: [],
      updateFile: () => {},
      updateView: () => {},
      messages: [],
      typingUsers: new Set(),
      sendMessage: () => {},
      sendTyping: () => {},
      events: [],
      toasts: [],
      dismissToast: () => {},
      filesOpen: {},
      sendFileOpen: () => {},
      sendFileClose: () => {},
    };
  }
  return ctx;
}
