"use client";

import { useState, useEffect } from "react";
import { Minus, X, MessageCircle } from "lucide-react";
import { useCollaboration } from "../collaboration-context";
import { TeamChatPanel } from "./team-chat-panel";

interface Props {
  currentUserId: string;
}

export function ChatPopout({ currentUserId }: Props) {
  const {
    chatPopoutOpen,
    setChatPopoutOpen,
    setChatVisible,
    members,
    messages,
    typingUsers,
    sendMessage,
    sendTyping,
  } = useCollaboration();
  const [minimized, setMinimized] = useState(false);

  // Listen for open events from toolbar/other entry points
  useEffect(() => {
    const handler = () => {
      setChatPopoutOpen(true);
      setChatVisible(true);
      setMinimized(false);
    };
    window.addEventListener("doable:open-chat-popout", handler);
    return () => window.removeEventListener("doable:open-chat-popout", handler);
  }, [setChatPopoutOpen, setChatVisible]);

  if (!chatPopoutOpen) return null;

  const handleClose = () => {
    setChatPopoutOpen(false);
    setChatVisible(false);
    setMinimized(false);
  };

  const handleMinimize = () => {
    const next = !minimized;
    setMinimized(next);
    setChatVisible(!next);
  };

  const handleTitleClick = () => {
    if (minimized) {
      setMinimized(false);
      setChatVisible(true);
    }
  };

  return (
    <div
      className="fixed bottom-12 right-4 z-40 flex flex-col rounded-lg border border-zinc-700 bg-[#1C1C1C] shadow-2xl transition-all duration-200"
      style={{ width: 350, height: minimized ? 40 : 450 }}
    >
      {/* Title bar */}
      <div
        className="flex h-10 flex-shrink-0 items-center justify-between rounded-t-lg border-b border-zinc-800 bg-zinc-900/80 px-3 cursor-pointer select-none"
        onClick={handleTitleClick}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-200">Team Chat</span>
          <span className="text-[10px] text-zinc-500">{members.length} online</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleMinimize(); }}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chat body */}
      {!minimized && (
        <div className="flex-1 overflow-hidden">
          <TeamChatPanel
            messages={messages}
            typingUsers={typingUsers}
            members={members}
            onSend={sendMessage}
            onTyping={sendTyping}
            currentUserId={currentUserId}
            hideHeader
          />
        </div>
      )}
    </div>
  );
}
