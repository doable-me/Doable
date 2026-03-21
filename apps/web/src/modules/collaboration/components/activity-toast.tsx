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
          className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 shadow-xl animate-in slide-in-from-right duration-300"
        >
          <span className="text-base">{EVENT_ICONS[toast.eventType] ?? "📋"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 truncate">
              <span className="font-medium">{toast.displayName ?? "Someone"}</span>{" "}
              {toast.summary}
            </p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
