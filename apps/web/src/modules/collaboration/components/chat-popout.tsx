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
      className="fixed bottom-4 right-4 z-40 flex flex-col rounded-lg border border-border bg-popover shadow-2xl transition-all duration-200"
      style={{ width: 350, height: minimized ? 40 : 450 }}
    >
      {/* Title bar */}
      <div
        className="flex h-10 flex-shrink-0 items-center justify-between rounded-t-lg border-b border-border bg-secondary/80 px-3 cursor-pointer select-none"
        onClick={handleTitleClick}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Team Chat</span>
          <span className="text-[10px] text-muted-foreground">{members.length} online</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleMinimize(); }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
