"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface CursorInfo {
  userId: string;
  displayName: string;
  color: string;
  filePath: string;
  line: number;
  column: number;
  updatedAt: number;
}

export function useRemoteCursors(
  subscribe: (handler: (msg: any) => void) => () => void,
  send: (msg: Record<string, unknown>) => void,
  joined: boolean,
  currentUserId: string
) {
  const [cursors, setCursors] = useState<Map<string, CursorInfo>>(new Map());
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!joined) return;

    const unsub = subscribe((msg: any) => {
      if (msg.type === "cursor:move" && msg.userId !== currentUserId) {
        setCursors((prev) => {
          const next = new Map(prev);
          next.set(msg.userId, {
            userId: msg.userId,
            displayName: msg.displayName,
            color: msg.color,
            filePath: msg.filePath,
            line: msg.line,
            column: msg.column,
            updatedAt: Date.now(),
          });
          return next;
        });
      }
      if (msg.type === "presence:user_left") {
        setCursors((prev) => {
          const next = new Map(prev);
          next.delete(msg.userId);
          return next;
        });
      }
    });

    // Clean up stale cursors every 10s
    const cleanup = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const next = new Map(prev);
        for (const [id, info] of next) {
          if (now - info.updatedAt > 10_000) next.delete(id);
        }
        return next.size !== prev.size ? next : prev;
      });
    }, 10_000);

    return () => {
      unsub();
      clearInterval(cleanup);
    };
  }, [joined, subscribe, currentUserId]);

  const sendCursorMove = useCallback(
    (filePath: string, line: number, column: number) => {
      const now = Date.now();
      if (now - lastSentRef.current < 50) return; // Throttle to 50ms
      lastSentRef.current = now;
      send({ type: "cursor:move", filePath, line, column });
    },
    [send]
  );

  return { cursors, sendCursorMove };
}
