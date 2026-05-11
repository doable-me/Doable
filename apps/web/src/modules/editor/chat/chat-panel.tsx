"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChat } from "../hooks/use-chat";
import { useEditorStore } from "../hooks/use-editor-store";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ClarificationFlow, PlanCard, PlanProgress } from "./plan";
import { SupabaseProvisionDialog } from "@/modules/integrations/supabase-provision-dialog";
import { ActivityFeedPanel } from "../panels/activity-feed-panel";
import {
  MessageSquare, Sparkles, Wrench, X, Loader2, Zap,
  Brain, FileEdit, Terminal, Package, ListChecks, AlertCircle,
  XCircle,
} from "lucide-react";
import type { AgentPhase } from "../hooks/use-agent-progress";
import { PHASE_LABELS } from "../hooks/use-agent-progress";

// ─── Phase → header icon ───────────────────────────────────────
function HeaderPhaseIcon({ phase }: { phase: AgentPhase }) {
  const cls = "h-3 w-3 shrink-0";
  switch (phase) {
    case "thinking":          return <Brain className={`${cls} animate-pulse`} />;
    case "planning":          return <ListChecks className={`${cls} animate-pulse`} />;
    case "writing_files":     return <FileEdit className={`${cls} animate-pulse`} />;
    case "running_command":   return <Terminal className={`${cls} animate-pulse`} />;
    case "installing":        return <Package className={`${cls} animate-pulse`} />;
    case "failed":            return <AlertCircle className={cls} />;
    case "cancelled":         return <XCircle className={cls} />;
    default:                  return <Sparkles className={`${cls} animate-pulse`} />;
  }
}

export function ChatPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const workspaceId =
    typeof window !== "undefined"
      ? localStorage.getItem("doable_active_workspace_id")
      : null;

  const {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadHistory,
    loadMore,
    hasMore,
    loadingMore,
    answerClarification,
    approvePlan,
    abandonPlan,
    pendingIntegrationRequest,
    dismissIntegrationRequest,
    supabaseProvisionRequest,
    dismissSupabaseProvision,
  } = useChat(projectId);

  const activePlan       = useEditorStore((s) => s.activePlan);
  const planPhase        = useEditorStore((s) => s.planPhase);
  const pendingQuestions = useEditorStore((s) => s.pendingQuestions);
  const activeAgentProgress = useEditorStore((s) => s.activeAgentProgress);
  const agentTimeline    = useEditorStore((s) => s.agentTimeline);
  const fileTree         = useEditorStore((s) => s.fileTree);

  const {
    updatePlanStep,
    removePlanStep,
    reorderPlanSteps,
    addPlanStep,
  } = useEditorStore();

  // Activity feed toggle
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  // Auto-show activity feed when streaming starts, auto-hide 2s after done
  useEffect(() => {
    if (isStreaming && agentTimeline.length > 0) {
      setShowActivityFeed(true);
    }
    if (!isStreaming) {
      const t = setTimeout(() => setShowActivityFeed(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isStreaming, agentTimeline.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isUserNearBottomRef = useRef(true);
  const isLoadingOlderRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserNearBottomRef.current = distFromBottom < 100;

    if (el.scrollTop < 200 && hasMore && !loadingMore && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true;
      loadMore().finally(() => {
        isLoadingOlderRef.current = false;
      });
    }
  }, [hasMore, loadingMore, loadMore]);

  useEffect(() => {
    const count = messages.length;
    if (count > prevMessageCountRef.current && isUserNearBottomRef.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(count - 1, { align: "end", behavior: "smooth" });
      });
    }
    prevMessageCountRef.current = count;
  }, [messages.length, virtualizer]);

  useEffect(() => {
    loadHistory();
     
  }, [projectId]);

  useEffect(() => {
    if (messages.length > 0 && prevMessageCountRef.current === 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
    }
  }, [messages.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  // Determine the streaming phase and message for header badge
  const streamingPhase = activeAgentProgress?.phase ?? "thinking";
  const streamingMsg   = activeAgentProgress?.message ?? "Working…";
  const isErrorPhase   = streamingPhase === "failed" || streamingPhase === "cancelled";

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 shrink-0">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground">Chat</span>

        {/* Premium streaming badge */}
        {isStreaming && (
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all ${
              isErrorPhase
                ? "bg-red-500/10 border-red-500/20"
                : "bg-brand-500/10 border-brand-500/20"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                isErrorPhase ? "bg-red-500" : "bg-brand-500 animate-pulse"
              }`}
            />
            <HeaderPhaseIcon phase={streamingPhase} />
            <span
              className={`text-[11px] font-medium truncate max-w-[160px] ${
                isErrorPhase ? "text-red-400" : "text-brand-400"
              }`}
            >
              {streamingMsg}
            </span>
            {!isErrorPhase && (
              <button
                onClick={stopStreaming}
                className="ml-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Cancel task"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Activity feed toggle button */}
          <button
            onClick={() => setShowActivityFeed((v) => !v)}
            title="Toggle activity feed"
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              showActivityFeed
                ? "bg-brand-500/15 text-brand-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Zap className={`h-3.5 w-3.5 ${isStreaming ? "text-brand-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Body: messages + optional activity feed side-by-side ── */}
      <div className="flex flex-1 min-h-0">
        {/* Messages column */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Sticky plan progress during build */}
          {planPhase === "building" && activePlan && (
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
              <PlanProgress plan={activePlan} />
            </div>
          )}

          {/* Message list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            onScroll={handleScroll}
          >
            {messages.length === 0 && planPhase === "idle" ? (
              <EmptyState onSuggestion={sendMessage} />
            ) : (
              <>
                {/* Load older messages */}
                {hasMore && (
                  <div className="flex items-center justify-center py-3">
                    {loadingMore ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Loading older messages…</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => loadMore()}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Load older messages
                      </button>
                    )}
                  </div>
                )}

                {/* Virtualised messages */}
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const msg = messages[virtualRow.index];
                    if (!msg) return null;
                    return (
                      <div
                        key={msg.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <ChatMessage
                          message={msg}
                          onClarificationAnswer={(content) => sendMessage(content)}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Clarification questions */}
                {planPhase === "clarifying" && pendingQuestions && (
                  <div className="px-4 py-3">
                    <ClarificationFlow
                      questions={pendingQuestions}
                      onComplete={(answers) => answerClarification(answers)}
                      disabled={isStreaming}
                    />
                  </div>
                )}

                {/* Plan review card */}
                {planPhase === "reviewing" && activePlan && (
                  <div className="px-4 py-3">
                    <PlanCard
                      plan={activePlan}
                      isEditable
                      onApprove={() => approvePlan(activePlan.id)}
                      onRefine={() => sendMessage("Please refine the plan based on my feedback.")}
                      onReset={() => abandonPlan(activePlan.id)}
                      onStepEdit={(stepId, field, value) =>
                        updatePlanStep(stepId, { [field]: value })
                      }
                      onStepRemove={removePlanStep}
                      onStepReorder={reorderPlanSteps}
                      onStepAdd={() =>
                        addPlanStep({
                          order: (activePlan.steps.length ?? 0) + 1,
                          title: "New step",
                          description: "Describe what this step does",
                          status: "pending",
                        })
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Activity feed side panel */}
        {showActivityFeed && (
          <div className="w-56 shrink-0 border-l border-border overflow-hidden flex flex-col">
            <ActivityFeedPanel onClose={() => setShowActivityFeed(false)} />
          </div>
        )}
      </div>

      {/* Integration connect card */}
      {pendingIntegrationRequest && (
        <IntegrationConnectCard
          request={pendingIntegrationRequest}
          onDismiss={() => dismissIntegrationRequest(false)}
          onConnected={() => dismissIntegrationRequest(true)}
        />
      )}

      {/* Supabase provision dialog */}
      {supabaseProvisionRequest && projectId && workspaceId && (
        <SupabaseProvisionDialog
          open={!!supabaseProvisionRequest}
          workspaceId={workspaceId}
          projectId={projectId}
          defaultName={supabaseProvisionRequest.name}
          reason={supabaseProvisionRequest.reason}
          onClose={(done) => dismissSupabaseProvision(done)}
        />
      )}

      {/* Chat input */}
      <ChatInput
        onSend={(content, attachments, projectFiles) => sendMessage(content, attachments, projectFiles)}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        fileTree={fileTree}
      />
    </div>
  );
}

// ─── Integration Connect Card ─────────────────────────────────
function IntegrationConnectCard({
  request,
  onDismiss,
  onConnected,
}: {
  request: { integrationId: string; displayName: string; logoUrl?: string; reason: string };
  onDismiss: () => void;
  onConnected: () => void;
}) {
  return (
    <div className="mx-3 mb-2 rounded-lg border border-brand-500/40 bg-brand-500/5 p-3">
      <div className="flex items-start gap-3">
        {request.logoUrl ? (
          <img src={request.logoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-md bg-background" />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-background">
            <Wrench className="h-4 w-4 text-brand-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              Connect {request.displayName}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {request.reason && (
            <p className="mt-0.5 text-xs text-muted-foreground">{request.reason}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <a
              href={`/workspace-settings?tab=integrations&connect=${encodeURIComponent(request.integrationId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            >
              Connect
            </a>
            <button
              type="button"
              onClick={onConnected}
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              I just connected — continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Enhanced Empty State ─────────────────────────────────────
const SUGGESTIONS = [
  { label: "Build a SaaS landing page", category: "Build" },
  { label: "Create a kanban task board", category: "Build" },
  { label: "Make a recipe sharing app", category: "Build" },
  { label: "Fix the login bug", category: "Fix" },
  { label: "Add dark mode support", category: "Add" },
  { label: "Explain this codebase", category: "Explain" },
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const handleClick = (suggestion: string) => {
    // Try to put the suggestion in the textarea; fall back to sending directly
    const chatInput = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder*="Describe"]'
    );
    if (chatInput) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(chatInput, suggestion);
      chatInput.dispatchEvent(new Event("input", { bubbles: true }));
      chatInput.focus();
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/10 to-brand-300/10">
        <Sparkles className="h-6 w-6 text-brand-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Start building with AI
      </h3>
      <p className="mt-1.5 max-w-[240px] text-xs text-muted-foreground leading-relaxed">
        Describe what you want to build and the AI will generate the code,
        files, and preview for you.
      </p>
      <div className="mt-4 w-full space-y-1.5">
        {SUGGESTIONS.map(({ label, category }) => (
          <button
            key={label}
            onClick={() => handleClick(label)}
            className="block w-full rounded-md border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {category}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
