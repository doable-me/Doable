"use client";

import { MessageCircle } from "lucide-react";
import { useCollaboration } from "../collaboration-context";

export function PresenceBar() {
  const { members, unreadCount, chatPopoutOpen, setChatPopoutOpen, setChatVisible } = useCollaboration();

  // Only show when 2+ members in the room
  if (members.length < 2) return null;

  const handleChatToggle = () => {
    const next = !chatPopoutOpen;
    setChatPopoutOpen(next);
    if (next) setChatVisible(true);
  };

  const handleAvatarClick = () => {
    if (!chatPopoutOpen) {
      setChatPopoutOpen(true);
      setChatVisible(true);
    }
  };

  return (
    <div className="flex h-10 flex-shrink-0 items-center justify-between border-t border-border bg-card px-3">
      {/* Online avatars */}
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {members.slice(0, 6).map((user) => (
            <div
              key={user.userId}
              className="relative cursor-pointer transition-transform hover:scale-110 hover:z-10"
              onClick={handleAvatarClick}
              title={`${user.displayName ?? "User"} — ${user.status}`}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[9px] font-semibold text-white"
                style={{ backgroundColor: user.color }}
              >
                {(user.displayName ?? "?").charAt(0).toUpperCase()}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card ${
                  user.status === "active"
                    ? "bg-green-400"
                    : user.status === "idle"
                      ? "bg-yellow-400"
                      : "bg-muted-foreground"
                }`}
              />
            </div>
          ))}
          {members.length > 6 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[9px] font-medium text-foreground">
              +{members.length - 6}
            </div>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground ml-1">
          {members.length} online
        </span>
      </div>

      {/* Team Chat button */}
      <button
        onClick={handleChatToggle}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>Chat</span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
