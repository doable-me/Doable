"use client";

import { useEditorStore } from "../hooks/use-editor-store";
import { FileTree } from "./file-tree";
import { VersionHistory } from "./version-history";
import {
  Files,
  History,
  BookOpen,
  Layout,
  PanelLeftClose,
} from "lucide-react";

const tabs = [
  { id: "pages" as const, label: "Pages", icon: Layout },
  { id: "files" as const, label: "Files", icon: Files },
  { id: "history" as const, label: "History", icon: History },
  { id: "knowledge" as const, label: "Knowledge", icon: BookOpen },
];

export function EditorSidebar() {
  const { activeSidebarTab, setActiveSidebarTab, toggleSidebar } =
    useEditorStore();

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSidebarTab(id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeSidebarTab === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors mr-1"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSidebarTab === "pages" && <PagesPanel />}
        {activeSidebarTab === "files" && <FileTree />}
        {activeSidebarTab === "history" && <VersionHistory />}
        {activeSidebarTab === "knowledge" && <KnowledgePanel />}
      </div>
    </div>
  );
}

function PagesPanel() {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pages
        </h3>
        <button className="text-xs text-primary hover:text-primary/80">
          + Add
        </button>
      </div>
      <div className="space-y-0.5">
        {["Home", "About", "Contact"].map((page) => (
          <button
            key={page}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Layout className="h-3.5 w-3.5 flex-none" />
            {page}
          </button>
        ))}
      </div>
    </div>
  );
}

function KnowledgePanel() {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Knowledge Base
        </h3>
        <button className="text-xs text-primary hover:text-primary/80">
          + Add
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Add context files, docs, or references to improve AI understanding of
        your project.
      </p>
      <div className="mt-3 rounded-md border border-dashed border-border p-4 text-center">
        <BookOpen className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Drop files or click to upload
        </p>
      </div>
    </div>
  );
}
