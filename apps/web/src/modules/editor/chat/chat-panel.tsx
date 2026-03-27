"use client";

import { useEffect, useRef } from "react";
import { useChat } from "../hooks/use-chat";
import { useEditorStore } from "../hooks/use-editor-store";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ClarificationFlow, PlanCard, PlanProgress } from "./plan";
import { MessageSquare, Sparkles } from "lucide-react";

export function ChatPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const { messages, isStreaming, sendMessage, stopStreaming, loadHistory, answerClarification, approvePlan, abandonPlan } =
    useChat(projectId);

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
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Plan progress tracker (during build) */}
        {planPhase === "building" && activePlan && (
          <PlanProgress plan={activePlan} />
        )}

        {messages.length === 0 && planPhase === "idle" ? (
          <EmptyState />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

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

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={(content, attachments) => sendMessage(content, attachments)}
        onStop={stopStreaming}
        isStreaming={isStreaming}
      />
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
