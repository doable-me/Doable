"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChat } from "../hooks/use-chat";
import { useEditorStore } from "../hooks/use-editor-store";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ClarificationFlow, PlanCard, PlanProgress } from "./plan";
import { SupabaseProvisionDialog } from "@/modules/integrations/supabase-provision-dialog";
import { MessageSquare, Sparkles, Wrench, X, Loader2 } from "lucide-react";

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

  const activePlan = useEditorStore((s) => s.activePlan);
  const planPhase = useEditorStore((s) => s.planPhase);
  const pendingQuestions = useEditorStore((s) => s.pendingQuestions);

  const {
    updatePlanStep,
    removePlanStep,
    reorderPlanSteps,
    addPlanStep,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isUserNearBottomRef = useRef(true);
  const isLoadingOlderRef = useRef(false);

  // Virtualizer — dynamic row heights via measureElement
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120, // Estimated height per message
    overscan: 5,
  });

  // Track if user is near bottom (for auto-scroll decisions)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserNearBottomRef.current = distFromBottom < 100;

    // Load older messages when scrolled near the top
    if (el.scrollTop < 200 && hasMore && !loadingMore && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true;
      loadMore().finally(() => {
        isLoadingOlderRef.current = false;
      });
    }
  }, [hasMore, loadingMore, loadMore]);

  // Auto-scroll to bottom when new messages arrive (only if user was near bottom)
  useEffect(() => {
    const count = messages.length;
    if (count > prevMessageCountRef.current && isUserNearBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(count - 1, { align: "end", behavior: "smooth" });
      });
    }
    prevMessageCountRef.current = count;
  }, [messages.length, virtualizer]);

  // When prepending older messages, maintain scroll position
  useEffect(() => {
    if (isLoadingOlderRef.current && scrollRef.current) {
      // The virtualizer handles this naturally via the key-based identity
    }
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0 && prevMessageCountRef.current === 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      });
    }
  }, [messages.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Chat</span>
        {isStreaming && (
          <div className="flex items-center gap-1 text-xs text-primary">
            <Sparkles className="h-3 w-3 animate-pulse" />
            <span>Generating...</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {/* Plan progress tracker (during build) */}
        {planPhase === "building" && activePlan && (
          <PlanProgress plan={activePlan} />
        )}

        {messages.length === 0 && planPhase === "idle" ? (
          <EmptyState />
        ) : (
          <>
            {/* Load more indicator */}
            {hasMore && (
              <div className="flex items-center justify-center py-3">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading older messages...</span>
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

            {/* Virtualized message list */}
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
                    <ChatMessage message={msg} />
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

            {/* Plan card (during review) */}
            {planPhase === "reviewing" && activePlan && (
              <div className="px-4 py-3">
                <PlanCard
                  plan={activePlan}
                  isEditable
                  onApprove={() => approvePlan(activePlan.id)}
                  onRefine={() => {
                    sendMessage("Please refine the plan based on my feedback.");
                  }}
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

      {/* Phase 1H: inline "Connect X" card — shown when the AI calls
          request_integration or an Activepieces tool fails with a
          credentials-missing error. Opens the integrations connect flow. */}
      {pendingIntegrationRequest && (
        <IntegrationConnectCard
          request={pendingIntegrationRequest}
          onDismiss={() => dismissIntegrationRequest(false)}
          onConnected={() => dismissIntegrationRequest(true)}
        />
      )}

      {/* Phase 2A: Supabase provisioning dialog — rendered when the AI calls
          the `provision_supabase` tool and the SSE `provision_supabase_required`
          frame lands in the useChat hook. Walks the user through creating a
          new Supabase project and streams progress directly in-dialog. */}
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

      {/* Input */}
      <ChatInput
        onSend={(content, attachments) => sendMessage(content, attachments)}
        onStop={stopStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}

// ─── Phase 1H: inline Connect card ────────────────────────
//
// Opens the existing integrations connect flow by deep-linking to the
// workspace-settings integrations tab with a `?connect={integrationId}`
// query param. The integrations tab reads the param on mount and auto-
// opens the <ConnectFlow> dialog for the requested integration. When the
// user completes the flow, they come back and click "I just connected"
// which fires the `onConnected` callback, auto-submitting a "continue"
// message to the AI so it retries with the new manifest entry.
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
          <img
            src={request.logoUrl}
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-md bg-background"
          />
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              {request.reason}
            </p>
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

function EmptyState() {
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
      <div className="mt-4 space-y-1.5">
        {[
          "Build a SaaS landing page",
          "Create a kanban task board",
          "Make a recipe sharing app",
        ].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              const chatInput = document.querySelector<HTMLTextAreaElement>(
                'textarea[placeholder*="Describe"]'
              );
              if (chatInput) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype, 'value'
                )?.set;
                nativeInputValueSetter?.call(chatInput, suggestion);
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                chatInput.focus();
              }
            }}
            className="block w-full rounded-md border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
