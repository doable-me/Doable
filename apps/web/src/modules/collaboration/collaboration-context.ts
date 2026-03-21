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

export interface RemoteVisualSelection {
  userId: string;
  displayName: string;
  color: string;
  selector: string;
  boundingRect: { x: number; y: number; width: number; height: number };
}

export interface RemoteVisualCursor {
  displayName: string;
  color: string;
  x: number;
  y: number;
}

export interface AiQueueItem {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  position: number;
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
  unreadCount: number;
  markAsRead: () => void;
  setChatVisible: (visible: boolean) => void;
  chatPopoutOpen: boolean;
  setChatPopoutOpen: (open: boolean) => void;

  // Activity
  events: ActivityEvent[];
  toasts: ActivityEvent[];
  dismissToast: (id: string) => void;

  // File Awareness
  filesOpen: Record<string, string[]>;
  sendFileOpen: (filePath: string) => void;
  sendFileClose: (filePath: string) => void;

  // Cursors
  cursors: Map<string, any>;
  sendCursorMove: (filePath: string, line: number, column: number) => void;
  subscribe: (handler: (msg: any) => void) => () => void;
  send: (msg: Record<string, unknown>) => void;

  // CRDT (Yjs)
  yjsProvider: any; // YjsWsProvider | null

  // Phase B: AI Collaboration
  aiStreamChunks: Map<string, string>;
  aiTypingUsers: Map<string, string>;
  aiQueue: AiQueueItem[];
  sendAiTyping: (isTyping: boolean) => void;

  // Phase C: Visual Edit Collaboration
  remoteSelections: Map<string, RemoteVisualSelection>;
  remoteVisualCursors: Map<string, RemoteVisualCursor>;
  sendVisualEditSelect: (selector: string, boundingRect: { x: number; y: number; width: number; height: number }) => void;
  sendVisualEditDeselect: () => void;
  sendVisualEditStyleChange: (selector: string, property: string, value: string) => void;
  sendVisualEditTextChange: (selector: string, newText: string) => void;
  sendVisualEditCursorMove: (x: number, y: number) => void;
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
      unreadCount: 0,
      markAsRead: () => {},
      setChatVisible: () => {},
      chatPopoutOpen: false,
      setChatPopoutOpen: () => {},
      events: [],
      toasts: [],
      dismissToast: () => {},
      filesOpen: {},
      sendFileOpen: () => {},
      sendFileClose: () => {},
      cursors: new Map(),
      sendCursorMove: () => {},
      subscribe: () => () => {},
      send: () => {},
      yjsProvider: null,
      // Phase B
      aiStreamChunks: new Map(),
      aiTypingUsers: new Map(),
      aiQueue: [],
      sendAiTyping: () => {},
      // Phase C
      remoteSelections: new Map(),
      remoteVisualCursors: new Map(),
      sendVisualEditSelect: () => {},
      sendVisualEditDeselect: () => {},
      sendVisualEditStyleChange: () => {},
      sendVisualEditTextChange: () => {},
      sendVisualEditCursorMove: () => {},
    };
  }
  return ctx;
}
