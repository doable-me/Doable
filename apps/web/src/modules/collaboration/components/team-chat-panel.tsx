"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Users } from "lucide-react";
import type { PresenceUser } from "@doable/shared";

interface ChatMessage {
  id: string;
  userId: string | null;
  displayName: string | null;
  content: string;
  messageType: "user" | "system";
  mentions: string[];
  createdAt: string;
}

interface Props {
  messages: ChatMessage[];
  typingUsers: Set<string>;
  members: PresenceUser[];
  onSend: (content: string) => void;
  onTyping: () => void;
  currentUserId: string;
}

export function TeamChatPanel({ messages, typingUsers, members, onSend, onTyping, currentUserId }: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    onSend(content);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (value: string) => {
    setInput(value);
    onTyping();
  };

  // Get display names for typing users
  const typingNames = Array.from(typingUsers)
    .filter((id) => id !== currentUserId)
    .map((id) => members.find((m) => m.userId === id)?.displayName ?? "Someone")
    .slice(0, 3);

  const memberForUser = (userId: string | null) =>
    userId ? members.find((m) => m.userId === userId) : null;

  return (
    <div className="flex flex-col h-full bg-[#1C1C1C]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Users className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Team Chat</span>
        <span className="text-[11px] text-zinc-500">
          {members.length} online
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Users className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">No messages yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start a conversation with your team</p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.messageType === "system") {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-[11px] text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded">
                  {msg.content}
                </span>
              </div>
            );
          }

          const member = memberForUser(msg.userId);
          const isMe = msg.userId === currentUserId;
          const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: member?.color ?? "#666" }}
              >
                {(msg.displayName ?? "?")[0].toUpperCase()}
              </div>
              <div className={`max-w-[75%] ${isMe ? "text-right" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-zinc-300">
                    {isMe ? "You" : msg.displayName ?? "User"}
                  </span>
                  <span className="text-[10px] text-zinc-600">{time}</span>
                </div>
                <div
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    isMe
                      ? "bg-blue-600/20 text-blue-100"
                      : "bg-zinc-800 text-zinc-200"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingNames.length > 0 && (
        <div className="px-4 py-1">
          <span className="text-[11px] text-zinc-500 italic">
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing...
          </span>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your team..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-0"
            style={{ maxHeight: "100px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
