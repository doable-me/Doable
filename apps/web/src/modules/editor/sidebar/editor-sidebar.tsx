"use client";

import { useEditorStore } from "../hooks/use-editor-store";
import { FileTree } from "./file-tree";
import { VersionHistory } from "./version-history";
import { PagesTab } from "./pages-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { ConnectorsPanel } from "@/modules/connectors/connectors-panel";
import { SkillsPanel } from "@/modules/skills/skills-panel";
import {
  Files,
  History,
  BookOpen,
  Layout,
  PanelLeftClose,
  Plug,
  Sparkles,
} from "lucide-react";

const tabs = [
  { id: "pages" as const, label: "Pages", icon: Layout },
  { id: "files" as const, label: "Files", icon: Files },
  { id: "history" as const, label: "History", icon: History },
  { id: "knowledge" as const, label: "Knowledge", icon: BookOpen },
  { id: "connectors" as const, label: "Connectors", icon: Plug },
  { id: "skills" as const, label: "Skills", icon: Sparkles },
];

export function EditorSidebar() {
  const { activeSidebarTab, setActiveSidebarTab, toggleSidebar, projectId } =
    useEditorStore();

  // Resolve workspaceId from localStorage (same pattern as EditorToolbar)
  const workspaceId =
    typeof window !== "undefined"
      ? localStorage.getItem("doable_active_workspace_id")
      : null;

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
        {activeSidebarTab === "pages" && <PagesTab />}
        {activeSidebarTab === "files" && <FileTree />}
        {activeSidebarTab === "history" && <VersionHistory />}
        {activeSidebarTab === "knowledge" && projectId && (
          <KnowledgeTab projectId={projectId} />
        )}
        {activeSidebarTab === "knowledge" && !projectId && (
          <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
            No project selected.
          </div>
        )}
        {activeSidebarTab === "connectors" && workspaceId && (
          <ConnectorsPanel workspaceId={workspaceId} />
        )}
        {activeSidebarTab === "connectors" && !workspaceId && (
          <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
            No workspace selected.
          </div>
        )}
        {activeSidebarTab === "skills" && workspaceId && (
          <SkillsPanel
            workspaceId={workspaceId}
            projectId={projectId ?? undefined}
          />
        )}
        {activeSidebarTab === "skills" && !workspaceId && (
          <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
            No workspace selected.
          </div>
        )}
      </div>
    </div>
  );
}
