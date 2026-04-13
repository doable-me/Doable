"use client";

import { Sun, Moon } from "lucide-react";
import { useDarkMode } from "@/hooks/use-dark-mode";

export function Header() {
  const { isDark, toggleDarkMode } = useDarkMode();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-lg font-semibold text-foreground">Task Tracker</h1>

      <button
        onClick={toggleDarkMode}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </header>
  );
}
