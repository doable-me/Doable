"use client";

import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "./use-websocket";

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

export function useProjectRoom(projectId: string | null) {
  const { send, subscribe, connectionState } = useWebSocket();
  const [members, setMembers] = useState<PresenceUser[]>([]);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!projectId || connectionState !== "connected") return;

    send({ type: "room:join", projectId });

    const unsub = subscribe((msg: any) => {
      switch (msg.type) {
        case "room:joined":
          setMembers(msg.members);
          setJoined(true);
          break;
        case "presence:user_joined":
          setMembers((prev) => [...prev.filter((u) => u.userId !== msg.user.userId), msg.user]);
          break;
        case "presence:user_left":
          setMembers((prev) => prev.filter((u) => u.userId !== msg.userId));
          break;
        case "presence:user_updated":
          setMembers((prev) => prev.map((u) => u.userId === msg.user.userId ? msg.user : u));
          break;
        case "presence:sync":
          setMembers(msg.users);
          break;
      }
    });

    return () => {
      send({ type: "room:leave" });
      setJoined(false);
      setMembers([]);
      unsub();
    };
  }, [projectId, connectionState, send, subscribe]);

  // Heartbeat every 25s
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => send({ type: "heartbeat" }), 25_000);
    return () => clearInterval(interval);
  }, [joined, send]);

  return { members, joined, send, subscribe, connectionState };
}
