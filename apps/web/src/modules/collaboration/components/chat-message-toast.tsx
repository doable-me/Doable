"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useCollaboration } from "../collaboration-context";

interface ToastItem {
  id: string;
  displayName: string;
  content: string;
  timestamp: number;
}

export function ChatMessageToasts() {
  const { messages, chatPopoutOpen, setChatPopoutOpen, setChatVisible, members } = useCollaboration();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastSeenCount = useRef(0);

  // Initialize the last seen count on mount
  useEffect(() => {
    lastSeenCount.current = messages.length;
  }, []);

  // Show toast for new messages when popout is closed
  useEffect(() => {
    if (chatPopoutOpen) {
      lastSeenCount.current = messages.length;
      return;
    }

    const newMessages = messages.slice(lastSeenCount.current);
    lastSeenCount.current = messages.length;

    for (const msg of newMessages) {
      if (msg.messageType === "system") continue;
      const toast: ToastItem = {
        id: msg.id,
        displayName: msg.displayName ?? "Someone",
        content: msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content,
        timestamp: Date.now(),
      };
      setToasts((prev) => [...prev.slice(-1), toast]); // max 2 visible
    }
  }, [messages.length, chatPopoutOpen]);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const handleClick = () => {
    setToasts([]);
    setChatPopoutOpen(true);
    setChatVisible(true);
  };

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-14 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={handleClick}
          className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 shadow-xl animate-in slide-in-from-right duration-300 cursor-pointer hover:bg-zinc-800/95 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 truncate">
              <span className="font-medium">{toast.displayName}</span>{" "}
              <span className="text-zinc-400">{toast.content}</span>
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss(toast.id); }}
            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
