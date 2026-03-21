"use client";

import { useEffect, useRef } from "react";
import { useCollaboration } from "../collaboration-context";

interface CollabChatTypingProps {
  isTyping: boolean;
}

export function CollabChatTyping({ isTyping }: CollabChatTypingProps) {
  const { sendAiTyping, aiTypingUsers, members } = useCollaboration();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Broadcast typing state with debounce
  useEffect(() => {
    if (isTyping) {
      sendAiTyping(true);
      // Auto-clear after 3 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => sendAiTyping(false), 3000);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isTyping, sendAiTyping]);

  // Clear on unmount
  useEffect(() => {
    return () => sendAiTyping(false);
  }, [sendAiTyping]);

  // Render typing indicator for other users
  if (aiTypingUsers.size === 0) return null;

  const entries = Array.from(aiTypingUsers.entries());

  return (
    <div className="px-4 py-1.5">
      {entries.map(([userId, displayName]) => {
        const member = members.find((m) => m.userId === userId);
        const color = member?.color ?? "#888";
        return (
          <div key={userId} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[11px] text-zinc-400 italic">
              {displayName} is typing...
            </span>
            <span className="inline-flex items-center gap-0.5">
              <span className="h-1 w-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1 w-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1 w-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
