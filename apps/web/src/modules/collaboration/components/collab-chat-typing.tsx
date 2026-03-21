"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCollaboration } from "../collaboration-context";

/**
 * Robust typing indicator for AI chat collaboration.
 *
 * Instead of relying on a boolean prop that only triggers on state change,
 * this exposes an `onKeystroke()` callback the parent calls on EVERY keystroke.
 * Internally it manages debounce: sends typing=true immediately on first keystroke,
 * then auto-clears after 2.5s of silence. Every keystroke resets the clear timer.
 */

interface CollabChatTypingProps {
  /** Call this on every keystroke / input change in the chat textarea */
  keystrokeSignal: number; // increment on every keystroke to trigger effect
}

export function CollabChatTyping({ keystrokeSignal }: CollabChatTypingProps) {
  const { sendAiTyping, aiTypingUsers, members } = useCollaboration();
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBroadcastingRef = useRef(false);

  // On every keystroke signal change, broadcast typing=true and reset clear timer
  useEffect(() => {
    if (keystrokeSignal === 0) return; // initial mount, skip

    // Send typing=true if not already broadcasting
    if (!isBroadcastingRef.current) {
      isBroadcastingRef.current = true;
      sendAiTyping(true);
    }

    // Reset the auto-clear timer on every keystroke
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      isBroadcastingRef.current = false;
      sendAiTyping(false);
    }, 2500);
  }, [keystrokeSignal, sendAiTyping]);

  // Clear on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      if (isBroadcastingRef.current) {
        sendAiTyping(false);
        isBroadcastingRef.current = false;
      }
    };
  }, [sendAiTyping]);

  // Render typing indicators — show top 3 most recent typers
  if (aiTypingUsers.size === 0) return null;

  const entries = Array.from(aiTypingUsers.entries()).slice(0, 3);

  return (
    <div className="px-4 py-1.5 flex flex-col gap-0.5">
      {entries.map(([userId, displayName]) => {
        const member = members.find((m) => m.userId === userId);
        const color = member?.color ?? "#888";
        return (
          <div key={userId} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-[11px] text-zinc-400 italic truncate max-w-[140px]">
              {displayName}
            </span>
            <span className="text-[11px] text-zinc-500 italic">is typing</span>
            <span className="inline-flex items-center gap-0.5 ml-0.5">
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
