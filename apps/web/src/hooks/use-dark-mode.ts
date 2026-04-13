"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "doable_dark_mode";

function applyDarkMode(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    applyDarkMode(isDark);
  }, [isDark]);

  const toggleDarkMode = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      applyDarkMode(next);
      return next;
    });
  }, []);

  return { isDark, toggleDarkMode };
}
