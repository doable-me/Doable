"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Theme hook backed by the canonical `doable_theme` key
 * (values: "dark" | "light" | "system"). Toggling cycles
 * between dark and light. The legacy `doable_dark_mode` key
 * is no longer written, but old values are migrated on read.
 */
const THEME_KEY = "doable_theme";

function resolveTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  const t = localStorage.getItem(THEME_KEY);
  if (t === "light") return "light";
  if (t === "dark") return "dark";
  if (t === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  // Legacy fallback
  const legacy = localStorage.getItem("doable_dark_mode");
  if (legacy === "false") return "light";
  return "dark";
}

function apply(theme: "dark" | "light") {
  const cl = document.documentElement.classList;
  cl.remove("dark", "light");
  cl.add(theme);
  document.documentElement.style.colorScheme = theme;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => resolveTheme() === "dark");

  useEffect(() => {
    apply(isDark ? "dark" : "light");
  }, [isDark]);

  // Stay in sync if another component (e.g. the Settings page) updates the theme.
  useEffect(() => {
    function syncFromStorage() {
      setIsDark(resolveTheme() === "dark");
    }
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      const themeStr = next ? "dark" : "light";
      localStorage.setItem(THEME_KEY, themeStr);
      apply(themeStr);
      return next;
    });
  }, []);

  return { isDark, toggleDarkMode };
}
