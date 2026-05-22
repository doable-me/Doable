"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Plan, PlanStep, ClarificationQuestion, PlanPhase } from "@doable/shared/types/ai";
import type { AgentProgressState, AgentTimelineEvent } from "./use-agent-progress";

// ─── MCP-Apps UI Resource ─────────────────────────────────────
// A standards-compliant MCP App UI resource (mcpui.dev /
// modelcontextprotocol.io/extensions/apps). The host renders this in a
// sandboxed iframe via @mcp-ui/client's <UIResourceRenderer />. The host
// is generic — it knows nothing about the specific server or tool.
export interface McpUiResource {
  toolCallId: string;
  connectorId: string;
  toolName: string;
  resource: {
    uri: string;
    mimeType: string;
    text?: string;
    blob?: string;
    [k: string]: unknown;
  };
  /** closed resources stay in history but stop rendering interactively */
  closed?: boolean;
}

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
  /** @deprecated Use agentProgress instead. Kept for backward compat during migration. */
  liveStatus?: string;
  /** Typed structured progress state — replaces liveStatus */
  agentProgress?: AgentProgressState;
  /** Live tool call cards shown during streaming */
  liveToolCalls?: Array<{
    id: string;
    toolName: string;
    filePath?: string;
    friendlyMessage?: string;
    status: "running" | "completed" | "failed";
    startedAt: number;
    completedAt?: number;
    linesAdded?: number;
    linesRemoved?: number;
  }>;
  senderName?: string;
  senderId?: string;
  attachments?: Array<{
    type: "image" | "text" | "pdf" | "code" | "document";
    name: string;
    mimeType: string;
    preview?: string;
  }>;
  /** Project files attached as context */
  projectFiles?: string[];
  /** Git commit SHA created by this AI response (for undo) */
  versionSha?: string;
  /** Whether the user has undone this AI response */
  undone?: boolean;
  /** Whether the AI made file changes in this response */
  hadToolCalls?: boolean;
  /** Track live tool calls streaming from the AI in real time. Map of toolName to streamed content. */
  liveTools?: Record<string, string>;
  /** Persisted tool call details from DB (for rendering summaries after refresh) */
  toolCallDetails?: Array<{ name: string; arguments?: unknown }>;
  /** Usage metrics from the AI response (token counts, cost, duration) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    durationMs: number;
    model: string;
    tokensAvailable: boolean;
    isLocal?: boolean;
    toolCallCount?: number;
  };
  /** Inline clarification question injected by the agent — renders as a choice card */
  clarificationQuestion?: {
    id: string;
    question: string;
    options?: string[];
    context?: string;
    answered: boolean;
    answer?: string;
  };
  /** Interactive MCP widgets attached to this assistant message, keyed by toolCallId. */
  mcpResources?: Record<string, McpUiResource>;
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

  // Agent progress (global — drives header badge and activity feed)
  activeAgentProgress: AgentProgressState | null;
  agentTimeline: AgentTimelineEvent[];

  // Plan Mode V2
  activePlan: Plan | null;
  planPhase: PlanPhase;
  pendingQuestions: ClarificationQuestion[] | null;

  // Preview
  previewUrl: string;
  previewLoading: boolean;
  toolResultVersion: number;

  // Sidebar
  activeSidebarTab: "pages" | "files" | "history" | "knowledge" | "skills";

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
  prependMessages: (messages: ChatMessage[]) => void;
  updateMessage: (id: string, content: string) => void;
  updateMessageFields: (id: string, fields: Partial<ChatMessage>) => void;
  setStreaming: (streaming: boolean) => void;
  setMode: (mode: EditorMode) => void;
  clearMessages: () => void;

  // Actions - Agent Progress
  setActiveAgentProgress: (progress: AgentProgressState | null) => void;
  pushAgentTimeline: (event: AgentTimelineEvent) => void;
  completeAgentTimelineEvent: (id: string, outcome?: "completed" | "failed") => void;
  clearAgentTimeline: () => void;

  // Plan Mode V2 Actions
  setActivePlan: (plan: Plan | null) => void;
  setPlanPhase: (phase: PlanPhase) => void;
  setPendingQuestions: (questions: ClarificationQuestion[] | null) => void;
  updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
  reorderPlanSteps: (stepIds: string[]) => void;
  removePlanStep: (stepId: string) => void;
  addPlanStep: (step: Omit<PlanStep, "id">) => void;
  approvePlan: () => void;
  abandonPlan: () => void;

  // Actions - Preview
  setPreviewUrl: (url: string) => void;
  setPreviewLoading: (loading: boolean) => void;
  bumpToolResultVersion: () => void;

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
      activeAgentProgress: null,
      agentTimeline: [],
      activePlan: null,
      planPhase: "idle" as PlanPhase,
      pendingQuestions: null,
      previewUrl: "",
      previewLoading: false,
      toolResultVersion: 0,
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
      prependMessages: (msgs) =>
        set((state) => ({ messages: [...msgs, ...state.messages] })),
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

      // Agent progress actions
      setActiveAgentProgress: (progress) => set({ activeAgentProgress: progress }),
      pushAgentTimeline: (event) =>
        set((state) => ({
          agentTimeline: [...state.agentTimeline.slice(-99), event], // cap at 100 entries
        })),
      completeAgentTimelineEvent: (id, outcome = "completed") =>
        set((state) => ({
          agentTimeline: state.agentTimeline.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: outcome,
                  durationMs: Date.now() - new Date(e.timestamp).getTime(),
                }
              : e
          ),
        })),
      clearAgentTimeline: () => set({ agentTimeline: [] }),

      // Plan Mode V2
      setActivePlan: (plan) => set({ activePlan: plan, planPhase: plan ? "reviewing" : "idle" }),
      setPlanPhase: (phase) => set({ planPhase: phase }),
      setPendingQuestions: (questions) => set({ pendingQuestions: questions, planPhase: questions ? "clarifying" : "idle" }),
      updatePlanStep: (stepId, updates) =>
        set((state) => {
          if (!state.activePlan) return {};
          return {
            activePlan: {
              ...state.activePlan,
              steps: state.activePlan.steps.map((s) =>
                s.id === stepId ? { ...s, ...updates } : s
              ),
            },
          };
        }),
      reorderPlanSteps: (stepIds) =>
        set((state) => {
          if (!state.activePlan) return {};
          const stepMap = new Map(state.activePlan.steps.map((s) => [s.id, s]));
          const reordered = stepIds
            .map((id, i) => {
              const step = stepMap.get(id);
              return step ? { ...step, order: i + 1 } : null;
            })
            .filter(Boolean) as PlanStep[];
          return { activePlan: { ...state.activePlan, steps: reordered } };
        }),
      removePlanStep: (stepId) =>
        set((state) => {
          if (!state.activePlan) return {};
          const steps = state.activePlan.steps
            .filter((s) => s.id !== stepId)
            .map((s, i) => ({ ...s, order: i + 1 }));
          return { activePlan: { ...state.activePlan, steps } };
        }),
      addPlanStep: (step) =>
        set((state) => {
          if (!state.activePlan) return {};
          const newStep: PlanStep = {
            ...step,
            id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          };
          return {
            activePlan: {
              ...state.activePlan,
              steps: [...state.activePlan.steps, newStep],
            },
          };
        }),
      approvePlan: () =>
        set((state) => {
          if (!state.activePlan) return {};
          return {
            activePlan: { ...state.activePlan, status: "approved", approvedAt: new Date().toISOString() },
            planPhase: "building",
            mode: "agent" as EditorMode,
          };
        }),
      abandonPlan: () => set({ activePlan: null, planPhase: "idle", pendingQuestions: null }),

      // Preview
      setPreviewUrl: (url) => set({ previewUrl: url }),
      setPreviewLoading: (loading) => set({ previewLoading: loading }),
      bumpToolResultVersion: () => set((s) => ({ toolResultVersion: s.toolResultVersion + 1 })),

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
        activePlan: state.activePlan,
        planPhase: state.planPhase,
        pendingQuestions: state.pendingQuestions,
      }),
    }
  )
);
