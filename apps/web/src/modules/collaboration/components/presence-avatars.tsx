"use client";

import { useState } from "react";
import type { PresenceUser } from "@doable/shared";

interface Props {
  users: PresenceUser[];
  maxVisible?: number;
}

export function PresenceAvatars({ users, maxVisible = 4 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <div key={user.userId} className="group relative">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold text-white cursor-default transition-transform hover:scale-110 hover:z-10"
              style={{ backgroundColor: user.color }}
              title={`${user.displayName ?? "User"} — ${user.status}`}
            >
              {(user.displayName ?? "?").charAt(0).toUpperCase()}
            </div>
            {/* Status dot */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                user.status === "active"
                  ? "bg-green-400"
                  : user.status === "idle"
                    ? "bg-yellow-400"
                    : "bg-muted-foreground"
              }`}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
              <div className="rounded-lg bg-popover border border-border px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                <p className="font-medium text-foreground">{user.displayName ?? "User"}</p>
                <p className="text-muted-foreground mt-0.5">
                  {user.currentFile
                    ? `Editing ${user.currentFile.split("/").pop()}`
                    : user.currentView === "preview"
                      ? "Viewing preview"
                      : "In editor"}
                </p>
                <p className="text-muted-foreground mt-0.5 capitalize">{user.status}</p>
              </div>
            </div>
          </div>
        ))}
        {overflow > 0 && (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-medium text-foreground cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            +{overflow}
          </div>
        )}
      </div>
      {users.length > 0 && (
        <span className="text-[11px] text-muted-foreground ml-1">
          {users.length} online
        </span>
      )}
    </div>
  );
}
