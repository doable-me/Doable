"use client";

import { X } from "lucide-react";

interface ActivityEvent {
  id: string;
  userId: string;
  displayName: string | null;
  eventType: string;
  summary: string;
  createdAt: string;
}

interface Props {
  toasts: ActivityEvent[];
  onDismiss: (id: string) => void;
}

const EVENT_ICONS: Record<string, string> = {
  file_save: "💾",
  file_create: "📄",
  file_delete: "🗑️",
  publish: "🚀",
  version_create: "📌",
  ai_chat: "🤖",
  settings_change: "⚙️",
};

export function ActivityToasts({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-popover backdrop-blur-sm px-4 py-3 shadow-xl animate-in slide-in-from-right duration-300"
        >
          <span className="text-base">{EVENT_ICONS[toast.eventType] ?? "📋"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">
              <span className="font-medium">{toast.displayName ?? "Someone"}</span>{" "}
              {toast.summary}
            </p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
