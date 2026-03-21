"use client";

import { useEffect, useCallback, useRef } from "react";

export function usePresence(
  send: (msg: Record<string, unknown>) => void,
  joined: boolean
) {
  const lastFileRef = useRef<string | null>(null);

  const updateFile = useCallback((filePath: string | null) => {
    if (!joined || filePath === lastFileRef.current) return;
    lastFileRef.current = filePath;
    send({ type: "presence:update", data: { currentFile: filePath } });
  }, [send, joined]);

  const updateView = useCallback((view: "code" | "preview" | "chat" | "team") => {
    if (!joined) return;
    send({ type: "presence:update", data: { currentView: view } });
  }, [send, joined]);

  // Idle detection: mark away when tab hidden, active when visible
  useEffect(() => {
    if (!joined) return;

    let idleTimer: ReturnType<typeof setTimeout>;

    const markActive = () => {
      send({ type: "presence:update", data: { status: "active" } });
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        send({ type: "presence:update", data: { status: "idle" } });
      }, 60_000);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        send({ type: "presence:update", data: { status: "away" } });
      } else {
        markActive();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    markActive();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      clearTimeout(idleTimer);
    };
  }, [joined, send]);

  return { updateFile, updateView };
}
