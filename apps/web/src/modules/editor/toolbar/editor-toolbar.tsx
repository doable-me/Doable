"use client";

import { useCallback, useState } from "react";
import { useEditorStore, type ViewMode } from "../hooks/use-editor-store";
import {
  Code2,
  Eye,
  Columns2,
  Settings,
  Github,
  Rocket,
  PanelLeftClose,
  PanelLeft,
  Check,
  Pencil,
} from "lucide-react";

export function EditorToolbar() {
  const {
    projectName,
    viewMode,
    sidebarCollapsed,
    setProjectName,
    setViewMode,
    toggleSidebar,
  } = useEditorStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed) setProjectName(trimmed);
    setIsEditingName(false);
  }, [nameInput, setProjectName]);

  const viewModes: { mode: ViewMode; icon: typeof Code2; label: string }[] = [
    { mode: "code", icon: Code2, label: "Code" },
    { mode: "split", icon: Columns2, label: "Split" },
    { mode: "preview", icon: Eye, label: "Preview" },
  ];

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-3">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {sidebarCollapsed ? (
          <PanelLeft className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {/* Project name */}
      <div className="flex items-center gap-1.5 min-w-0">
        {isEditingName ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameSubmit();
                if (e.key === "Escape") {
                  setNameInput(projectName);
                  setIsEditingName(false);
                }
              }}
              className="h-7 w-48 rounded-md border border-input bg-background px-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleNameSubmit}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNameInput(projectName);
              setIsEditingName(true);
            }}
            className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent transition-colors truncate max-w-[200px]"
          >
            <span className="truncate">{projectName}</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-none" />
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
        {viewModes.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${
              viewMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="GitHub"
        >
          <Github className="h-4 w-4" />
        </button>
        <button className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Rocket className="h-3.5 w-3.5" />
          <span>Publish</span>
        </button>
      </div>
    </header>
  );
}
