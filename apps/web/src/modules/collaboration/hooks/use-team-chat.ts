"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ChatMessage {
  id: string;
  userId: string | null;
  displayName: string | null;
  content: string;
  messageType: "user" | "system";
  mentions: string[];
  createdAt: string;
}

export function useTeamChat(
  subscribe: (handler: (msg: any) => void) => () => void,
  send: (msg: Record<string, unknown>) => void,
  joined: boolean
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const chatVisibleRef = useRef(false);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!joined) return;

    const unsub = subscribe((msg: any) => {
      if (msg.type === "chat:message") {
        setMessages((prev) => [...prev, msg.message]);
        if (!chatVisibleRef.current) {
          setUnreadCount((c) => c + 1);
        }
      }
      if (msg.type === "chat:history") {
        setMessages(msg.messages);
      }
      if (msg.type === "chat:user_typing") {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (msg.typing) {
            next.add(msg.userId);
            // Auto-clear after 4s
            const existing = typingTimers.current.get(msg.userId);
            if (existing) clearTimeout(existing);
            typingTimers.current.set(
              msg.userId,
              setTimeout(() => {
                setTypingUsers((p) => {
                  const n = new Set(p);
                  n.delete(msg.userId);
                  return n;
                });
              }, 4000)
            );
          } else {
            next.delete(msg.userId);
          }
          return next;
        });
      }
    });

    return unsub;
  }, [joined, subscribe]);

  const sendMessage = useCallback(
    (content: string, mentions?: string[]) => {
      send({ type: "chat:send", data: { content, mentions } });
      send({ type: "chat:typing", typing: false });
    },
    [send]
  );

  const sendTyping = useCallback(() => {
    send({ type: "chat:typing", typing: true });
  }, [send]);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const setChatVisible = useCallback((visible: boolean) => {
    chatVisibleRef.current = visible;
    if (visible) setUnreadCount(0);
  }, []);

  return { messages, typingUsers, sendMessage, sendTyping, unreadCount, markAsRead, setChatVisible };
}
