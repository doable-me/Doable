"use client";

import { useState, useEffect, useCallback } from "react";
import { GREETINGS, DASHBOARD_SUGGESTIONS } from "./dashboard-constants";

// ─── Rotating Greeting Hook ─────────────────────────────────

export function useRotatingGreeting(name: string) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % GREETINGS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return `${GREETINGS[index]}, ${name}?`;
}

// ─── Typing Placeholder Hook ────────────────────────────────

export function useTypingPlaceholder(): string {
  const [index, setIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">("typing");

  useEffect(() => {
    const target = DASHBOARD_SUGGESTIONS[index]!;
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (displayText.length < target.length) {
        timeout = setTimeout(() => {
          setDisplayText(target.slice(0, displayText.length + 1));
        }, 35 + Math.random() * 25);
      } else {
        timeout = setTimeout(() => setPhase("holding"), 100);
      }
    } else if (phase === "holding") {
      timeout = setTimeout(() => setPhase("erasing"), 2500);
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 18);
      } else {
        setIndex((prev) => (prev + 1) % DASHBOARD_SUGGESTIONS.length);
        setPhase("typing");
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, phase, index]);

  return displayText || "Ask Doable to create...";
}

// ─── Context Menu Hook ──────────────────────────────────────

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  projectId: string | null;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    projectId: null,
  });

  const show = useCallback((e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ visible: true, x: e.clientX, y: e.clientY, projectId });
  }, []);

  const hide = useCallback(() => {
    setMenu((m) => ({ ...m, visible: false, projectId: null }));
  }, []);

  // Close on click outside or scroll
  useEffect(() => {
    if (!menu.visible) return;
    const handler = () => hide();
    document.addEventListener("click", handler);
    document.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("scroll", handler, true);
    };
  }, [menu.visible, hide]);

  return { menu, show, hide };
}
