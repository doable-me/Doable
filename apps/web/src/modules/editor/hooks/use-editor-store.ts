"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface OpenTab {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  thinkingContent?: string;
  liveStatus?: string;
  senderName?: string;
  senderId?: string;
  attachments?: Array<{
    type: "image" | "text" | "pdf" | "code";
    name: string;
    mimeType: string;
    preview?: string;
  }>;
}

export type EditorMode = "agent" | "plan";

export type ViewMode = "split" | "code" | "preview";

interface PanelSizes {
  sidebar: number;
  center: number;
  preview: number;
}

// ─── Store ──────────────────────────────────────────────────
interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;

  // Files
  fileTree: FileNode[];
  activeFilePath: string | null;
  activeFileContent: string;
  openTabs: OpenTab[];

  // Panels
  panelSizes: PanelSizes;
  sidebarCollapsed: boolean;
  viewMode: ViewMode;

  // Chat
  messages: ChatMessage[];
  mode: EditorMode;
  isStreaming: boolean;

  // Preview
  previewUrl: string;
  previewLoading: boolean;

  // Sidebar
  activeSidebarTab: "pages" | "files" | "history" | "knowledge" | "connectors" | "skills";

  // Actions - Project
  setProjectId: (id: string) => void;
  setProjectName: (name: string) => void;

  // Actions - Files
  setFileTree: (tree: FileNode[]) => void;
  setActiveFile: (path: string, content: string) => void;
  setActiveFileContent: (content: string) => void;
  openTab: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  markTabDirty: (path: string, dirty: boolean) => void;

  // Actions - Panels
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;

  // Actions - Chat
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string) => void;
  updateMessageFields: (id: string, fields: Partial<ChatMessage>) => void;
  setStreaming: (streaming: boolean) => void;
  setMode: (mode: EditorMode) => void;
  clearMessages: () => void;

  // Actions - Preview
  setPreviewUrl: (url: string) => void;
  setPreviewLoading: (loading: boolean) => void;

  // Actions - Sidebar
  setActiveSidebarTab: (tab: EditorState["activeSidebarTab"]) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      // Initial state
      projectId: null,
      projectName: "Untitled Project",
      fileTree: [],
      activeFilePath: null,
      activeFileContent: "",
      openTabs: [],
      panelSizes: { sidebar: 250, center: 1, preview: 1 },
      sidebarCollapsed: false,
      viewMode: "split",
      messages: [],
      mode: "agent",
      isStreaming: false,
      previewUrl: "",
      previewLoading: false,
      activeSidebarTab: "files",

      // Project
      setProjectId: (id) => set({ projectId: id }),
      setProjectName: (name) => set({ projectName: name }),

      // Files
      setFileTree: (tree) => set({ fileTree: tree }),
      setActiveFile: (path, content) => set({ activeFilePath: path, activeFileContent: content }),
      setActiveFileContent: (content) => set({ activeFileContent: content }),
      openTab: (tab) =>
        set((state) => {
          const exists = state.openTabs.find((t) => t.path === tab.path);
          if (exists) return { activeFilePath: tab.path };
          return { openTabs: [...state.openTabs, tab], activeFilePath: tab.path };
        }),
      closeTab: (path) =>
        set((state) => {
          const tabs = state.openTabs.filter((t) => t.path !== path);
          const newActive =
            state.activeFilePath === path
              ? tabs.length > 0
                ? tabs[tabs.length - 1]?.path ?? null
                : null
              : state.activeFilePath;
          return { openTabs: tabs, activeFilePath: newActive };
        }),
      markTabDirty: (path, dirty) =>
        set((state) => ({
          openTabs: state.openTabs.map((t) =>
            t.path === path ? { ...t, isDirty: dirty } : t
          ),
        })),

      // Panels
      setPanelSizes: (sizes) =>
        set((state) => ({
          panelSizes: { ...state.panelSizes, ...sizes },
        })),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setViewMode: (mode) => set({ viewMode: mode }),

      // Chat
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content } : m
          ),
        })),
      updateMessageFields: (id, fields) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, ...fields } : m
          ),
        })),
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      setMode: (mode) => set({ mode }),
      clearMessages: () => set({ messages: [] }),

      // Preview
      setPreviewUrl: (url) => set({ previewUrl: url }),
      setPreviewLoading: (loading) => set({ previewLoading: loading }),

      // Sidebar
      setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
    }),
    {
      name: "doable-editor-state",
      partialize: (state) => ({
        panelSizes: state.panelSizes,
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        mode: state.mode,
      }),
    }
  )
);
