"use client";

import { useState, useEffect, useCallback } from "react";

interface ActivityEvent {
  id: string;
  userId: string;
  displayName: string | null;
  eventType: string;
  summary: string;
  createdAt: string;
}

interface Toast extends ActivityEvent {
  dismissedAt?: number;
}

export function useActivity(
  subscribe: (handler: (msg: any) => void) => () => void,
  joined: boolean,
  currentUserId?: string
) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!joined) return;

    const unsub = subscribe((msg: any) => {
      if (msg.type === "activity:event") {
        const event = msg.event as ActivityEvent;
        setEvents((prev) => [event, ...prev].slice(0, 100));
        // Only show toast for OTHER users' actions
        if (event.userId !== currentUserId) {
          setToasts((prev) => [event, ...prev].slice(0, 3));
          // Auto-dismiss after 5s
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== event.id));
          }, 5000);
        }
      }
    });

    return unsub;
  }, [joined, subscribe, currentUserId]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { events, toasts, dismissToast };
}
