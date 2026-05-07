"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, type ChatMessage } from "./use-editor-store";
import type { Attachment } from "@/hooks/use-attachments";
import { API_BASE, generateId } from "./use-chat-types";
import type { SupabaseProvisionRequest, PendingIntegrationRequest } from "./use-chat-types";
import { dispatchSSEEvent, type SSEContext } from "./use-chat-sse";
import { useChatLifecycle } from "./use-chat-lifecycle";
import {
  getStaleThreshold,
  type AgentPhase,
} from "./use-agent-progress";

export type { SupabaseProvisionRequest, PendingIntegrationRequest } from "./use-chat-types";

export function useChat(
  projectId: string | null,
  collabSubscribe?: (handler: (msg: any) => void) => () => void,
) {
  const abortRef = useRef<AbortController | null>(null);
  // Track which messageIds originated from THIS client so we don't double-render
  const ownMessageIds = useRef<Set<string>>(new Set());
  // Track remote streaming message IDs → assistant message IDs in the store
  const remoteStreamMap = useRef<Map<string, string>>(new Map());
  // Track the last user message content for the Cancel → Resume feature
  const lastUserMessageRef = useRef<string>("");
  // Track current agent phase outside state so stale-detection can read it
  const currentPhaseRef = useRef<AgentPhase>("thinking");

  // Supabase provisioning request
  const [supabaseProvisionRequest, setSupabaseProvisionRequest] =
    useState<SupabaseProvisionRequest | null>(null);

  // Integration Connect card
  const [pendingIntegrationRequest, setPendingIntegrationRequest] =
    useState<PendingIntegrationRequest | null>(null);

  const {
    messages,
    mode,
    isStreaming,
    addMessage,
    prependMessages,
    updateMessage,
    updateMessageFields,
    setStreaming,
    clearMessages,
    setActiveAgentProgress,
    clearAgentTimeline,
  } = useEditorStore();

  // ─── Document title: update while streaming in background tab ──
  useEffect(() => {
    const store = useEditorStore.getState();
    if (!isStreaming) {
      document.title = "Doable";
      return;
    }
    const progress = store.activeAgentProgress;
    document.title = `⚡ ${progress?.message ?? "Building…"} — Doable`;
  }, [isStreaming]);

  // ─── sendMessage ─────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[], projectFiles?: string[]) => {
      if (!projectId || !content.trim() || isStreaming) return;

      lastUserMessageRef.current = content.trim();

      const broadcastMsgId = generateId();
      ownMessageIds.current.add(broadcastMsgId);

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
        attachments: attachments?.map((a) => ({
          type: a.type,
          name: a.name,
          mimeType: a.mimeType,
          preview: a.preview,
        })),
        projectFiles: projectFiles && projectFiles.length > 0 ? projectFiles : undefined,
      };
      addMessage(userMessage);

      const assistantId = generateId();

      // ── Optimistic "Connecting…" state — visible within 50ms ──
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        agentProgress: { phase: "thinking", message: "Connecting to AI…" },
      };
      addMessage(assistantMessage);
      setStreaming(true);
      setActiveAgentProgress({ phase: "thinking", message: "Connecting to AI…" });
      clearAgentTimeline();
      currentPhaseRef.current = "thinking";

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();

        const response = await fetch(
          `${API_BASE}/projects/${projectId}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              content: content.trim(),
              // Read mode from store at call time to avoid stale closures
              // (e.g. approvePlan switches mode to "agent" before calling sendMessage).
              mode: useEditorStore.getState().mode,
              attachments: attachments?.map((a) => ({
                type: a.mimeType,
                data: a.data,
                name: a.name,
              })),
              projectFiles: projectFiles && projectFiles.length > 0 ? projectFiles : undefined,
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const status = response.status;
          if (status === 429) {
            const retryAfter = parseInt(response.headers.get("retry-after") ?? "30", 10);
            updateMessageFields(assistantId, {
              agentProgress: { phase: "failed", message: `Rate limit reached. Retry in ${retryAfter}s.` },
              isStreaming: false,
            });
            setStreaming(false);
            setActiveAgentProgress(null);
            return;
          }
          throw new Error(`Chat request failed: ${status}`);
        }

        // SSE connection open — update to analysing state
        updateMessageFields(assistantId, {
          agentProgress: { phase: "thinking", message: "Analyzing your request…" },
        });
        setActiveAgentProgress({ phase: "thinking", message: "Analyzing your request…" });
        currentPhaseRef.current = "thinking";

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";
        let thinkingAccumulated = "";
        let buffer = "";
        let rafHandle: number | null = null;
        let pendingFlush = false;
        let lastFlushedLen = 0;

        // ── rAF-batched flush ──────────────────────────────────────
        const flushToState = () => {
          rafHandle = null;
          pendingFlush = false;
          lastFlushedLen = accumulated.length;
          updateMessage(assistantId, accumulated);
        };

        const scheduleFlush = () => {
          if (!pendingFlush) {
            pendingFlush = true;
            rafHandle = requestAnimationFrame(flushToState);
          }
        };

        const fallbackFlushId = setInterval(() => {
          if (accumulated.length > lastFlushedLen) {
            if (rafHandle) cancelAnimationFrame(rafHandle);
            rafHandle = null;
            pendingFlush = false;
            lastFlushedLen = accumulated.length;
            updateMessage(assistantId, accumulated);
          }
        }, 120);

        const sseCtx: SSEContext = {
          assistantId,
          updateMessageFields,
          setSupabaseProvisionRequest,
          setPendingIntegrationRequest,
          setStreaming,
          addClarificationMessage: (q) => {
            const clarifyMsgId = `clarify_${q.id}_${Date.now()}`;
            addMessage({
              id: clarifyMsgId,
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
              clarificationQuestion: {
                id: q.id,
                question: q.question,
                options: q.options,
                context: q.context,
                answered: false,
              },
            });
          },
        };

        try {
          let streamDone = false;
          // ── Phase 2: Dual-clock stale detection ────────────────
          // lastProgressEvent: resets on tool_call / thinking / text_delta
          // lastServerHeartbeat: resets on ANY event including keep_alive
          let lastProgressEvent = Date.now();
          let lastServerHeartbeat = Date.now();
          let warnedStale = false;

          while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                clearInterval(fallbackFlushId);
                if (rafHandle) cancelAnimationFrame(rafHandle);
                updateMessage(assistantId, accumulated);
                streamDone = true;
                break;
              }

              try {
                const parsed = JSON.parse(data);

                // keep_alive resets heartbeat only (not progress clock)
                if (parsed.type === "keep_alive") {
                  lastServerHeartbeat = Date.now();
                  warnedStale = false;
                  continue;
                }

                // All real events reset both clocks
                lastProgressEvent = Date.now();
                lastServerHeartbeat = Date.now();
                warnedStale = false;

                // Track current phase for adaptive stale threshold
                if (parsed.type === "tool_call") {
                  const inferredPhase = useEditorStore.getState()
                    .messages.find((m) => m.id === assistantId)
                    ?.agentProgress?.phase ?? "thinking";
                  currentPhaseRef.current = inferredPhase as AgentPhase;
                }

                const result = dispatchSSEEvent(parsed, sseCtx);

                if (result.textDelta) {
                  // Detect and strip inline_clarification JSON blocks emitted by AI
                  const clarifyRe = /\{"type"\s*:\s*"inline_clarification"[\s\S]*?\}\s*\}/g;
                  let delta = result.textDelta;
                  const clarifyMatches = delta.match(clarifyRe);
                  if (clarifyMatches) {
                    for (const match of clarifyMatches) {
                      try {
                        const parsed = JSON.parse(match);
                        if (parsed.data?.id && parsed.data?.question) {
                          // Dispatch as synthetic SSE through the same context
                          dispatchSSEEvent({ type: "inline_clarification", data: parsed.data }, sseCtx);
                          delta = delta.replace(match, "").replace(/```json\n?/g, "").replace(/```\n?/g, "");
                        }
                      } catch { /* ignore malformed */ }
                    }
                  }
                  if (delta.trim()) {
                    accumulated += delta;
                    scheduleFlush();
                  }
                }

                if (result.thinkingDelta) {
                  thinkingAccumulated += result.thinkingDelta;
                  // Show a curated 1-line preview as the status message
                  const preview = result.thinkingDelta.replace(/\s+/g, " ").trim();
                  const statusText =
                    preview.length <= 80
                      ? preview
                      : preview.slice(0, 77).replace(/\s+\S*$/, "") + "…";
                  updateMessageFields(assistantId, {
                    thinkingContent: thinkingAccumulated,
                    agentProgress: {
                      phase: "thinking",
                      message: statusText || "Thinking…",
                    },
                  });
                }
              } catch {
                // Skip malformed JSON lines
              }
            }

            // ── Phase-aware stale detection ─────────────────────────
            if (!streamDone) {
              const phase = currentPhaseRef.current;
              const staleThreshold = getStaleThreshold(phase);
              const silentMs = Date.now() - lastProgressEvent;
              const heartbeatSilentMs = Date.now() - lastServerHeartbeat;

              // Warn user 15s before we'd close
              if (
                silentMs > staleThreshold - 15_000 &&
                silentMs < staleThreshold &&
                !warnedStale
              ) {
                warnedStale = true;
                updateMessageFields(assistantId, {
                  agentProgress: {
                    phase,
                    message: "This step is taking longer than usual…",
                  },
                });
                console.info(`[Chat] Stream quiet for ${Math.round(silentMs / 1000)}s in phase "${phase}" — showing warning`);
              }

              // Only close if BOTH progress AND heartbeat are both silent
              // (heartbeat alone keeps stream alive during long operations)
              if (
                silentMs > staleThreshold &&
                heartbeatSilentMs > staleThreshold
              ) {
                console.warn(`[Chat] Stream stale — no events for ${Math.round(silentMs / 1000)}s in phase "${phase}", closing`);
                clearInterval(fallbackFlushId);
                if (rafHandle) cancelAnimationFrame(rafHandle);
                if (accumulated) updateMessage(assistantId, accumulated);
                break;
              }
            }
          }
        } finally {
          clearInterval(fallbackFlushId);
          if (rafHandle) cancelAnimationFrame(rafHandle);
          if (accumulated) updateMessage(assistantId, accumulated);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled — mark as cancelled state (not an error)
          updateMessageFields(assistantId, {
            agentProgress: { phase: "cancelled", message: "Task cancelled" },
          });
          setActiveAgentProgress(null);
          return;
        }
        updateMessageFields(assistantId, {
          agentProgress: { phase: "failed", message: "Something went wrong. Please try again." },
        });
        const errorContent = "Sorry, something went wrong. Please try again.";
        if (!useEditorStore.getState().messages.find((m) => m.id === assistantId)?.content) {
          updateMessage(assistantId, errorContent);
        }
      } finally {
        setStreaming(false);
        setActiveAgentProgress(null);
        currentPhaseRef.current = "idle";
        updateMessageFields(assistantId, { isStreaming: false });
        abortRef.current = null;
        setTimeout(() => ownMessageIds.current.delete(broadcastMsgId), 30_000);
      }
    },
    [
      projectId,
      mode,
      isStreaming,
      addMessage,
      updateMessage,
      updateMessageFields,
      setStreaming,
      setActiveAgentProgress,
      clearAgentTimeline,
      setSupabaseProvisionRequest,
      setPendingIntegrationRequest,
    ]
  );

  // ─── stopStreaming — with cancelled state ─────────────────────────
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setActiveAgentProgress(null);
  }, [setStreaming, setActiveAgentProgress]);

  // ─── answerClarification ─────────────────────────────────────────
  const answerClarification = useCallback(
    async (answers: Record<string, string>) => {
      if (!projectId) return;
      // Capture pending questions BEFORE clearing — needed to map IDs to text
      const pendingQs = useEditorStore.getState().pendingQuestions ?? [];
      const questionTextById = Object.fromEntries(pendingQs.map((q) => [q.id, q.question]));
      useEditorStore.getState().setPendingQuestions(null);
      useEditorStore.getState().setPlanPhase("planning");
      const answerText = Object.entries(answers)
        .filter(([, a]) => a.trim())
        .map(([id, a]) => `${questionTextById[id] ?? id}: ${a}`)
        .join("\n");
      sendMessage(`Here are my answers:\n${answerText}`);
    },
    [projectId, sendMessage],
  );

  // ─── approvePlan ─────────────────────────────────────────────────
  const approvePlan = useCallback(
    async (planId: string) => {
      if (!projectId) return;
      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();
        await fetch(`${API_BASE}/projects/${projectId}/plan/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ planId }),
        });
        useEditorStore.getState().approvePlan();
        setTimeout(() => {
          sendMessage(
            "The plan has been approved. Please start building it now, step by step. Follow the plan in .doable/plan.md."
          );
        }, 100);
      } catch (err) {
        console.error("Failed to approve plan:", err);
      }
    },
    [projectId, sendMessage],
  );

  // ─── abandonPlan ─────────────────────────────────────────────────
  const abandonPlan = useCallback(
    async (planId: string) => {
      if (!projectId) return;
      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();
        await fetch(`${API_BASE}/projects/${projectId}/plan/abandon`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ planId }),
        });
        useEditorStore.getState().abandonPlan();
      } catch (err) {
        console.error("Failed to abandon plan:", err);
      }
    },
    [projectId],
  );

  const {
    loadHistory,
    loadMore,
    hasMore,
    loadingMore,
    clearChat,
    dismissSupabaseProvision,
    dismissIntegrationRequest,
  } = useChatLifecycle({
    projectId,
    collabSubscribe,
    addMessage,
    prependMessages,
    updateMessage,
    updateMessageFields,
    clearMessages,
    ownMessageIds,
    remoteStreamMap,
    setSupabaseProvisionRequest,
    setPendingIntegrationRequest,
    sendMessage,
  });

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadHistory,
    loadMore,
    hasMore,
    loadingMore,
    clearChat,
    answerClarification,
    approvePlan,
    abandonPlan,
    supabaseProvisionRequest,
    dismissSupabaseProvision,
    pendingIntegrationRequest,
    dismissIntegrationRequest,
    lastUserMessage: lastUserMessageRef,
  };
}
