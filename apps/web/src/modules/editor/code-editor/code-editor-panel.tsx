"use client";

import { useEditorStore } from "../hooks/use-editor-store";
import { useProjectFiles } from "../hooks/use-project-files";
import { CodeDisplay } from "./code-display";
import {
  X,
  FileCode2,
  Circle,
  Code2,
} from "lucide-react";

export function CodeEditorPanel() {
  const { openTabs, activeFilePath, activeFileContent } = useEditorStore();
  const projectId = useEditorStore((s) => s.projectId);
  const { readFile } = useProjectFiles(projectId);
  const closeTab = useEditorStore((s) => s.closeTab);

  const activeTab = openTabs.find((t) => t.path === activeFilePath);

  if (openTabs.length === 0) {
    return <EmptyEditor />;
  }

  return (
    <div className="flex h-full flex-col border-l border-border">
      {/* Tab bar */}
      <div className="flex h-9 items-center overflow-x-auto border-b border-border bg-muted/20">
        {openTabs.map((tab) => {
          const isActive = tab.path === activeFilePath;
          return (
            <div
              key={tab.path}
              className={`group flex h-full items-center gap-1.5 border-r border-border px-3 text-xs cursor-pointer transition-colors ${
                isActive
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
              onClick={() => readFile(tab.path)}
            >
              <FileCode2 className="h-3 w-3 flex-none text-muted-foreground" />
              <span className="truncate max-w-[120px]">{tab.name}</span>
              {tab.isDirty && (
                <Circle className="h-2 w-2 flex-none fill-current text-primary" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="flex h-4 w-4 flex-none items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Breadcrumb / path */}
      {activeTab && (
        <div className="flex h-7 items-center border-b border-border bg-muted/10 px-3">
          <span className="text-[11px] text-muted-foreground font-mono truncate">
            {activeTab.path}
          </span>
        </div>
      )}

      {/* Code display */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <CodeDisplay
            code={activeFileContent}
            language={activeTab.language}
            fileName={activeTab.name}
          />
        ) : (
          <EmptyEditor />
        )}
      </div>
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Code2 className="h-10 w-10 text-muted-foreground/30" />
      <p className="mt-3 text-sm text-muted-foreground">
        Select a file to view its code
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Use the file explorer or chat with AI to generate files
      </p>
    </div>
  );
}
