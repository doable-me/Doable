"use client";

import { useCallback, useRef, useState } from "react";
import { useEditorStore, type ChatMessage } from "./use-editor-store";
import type { Attachment } from "@/hooks/use-attachments";
import { API_BASE, generateId } from "./use-chat-types";
import type { SupabaseProvisionRequest, PendingIntegrationRequest } from "./use-chat-types";
import { dispatchSSEEvent, type SSEContext } from "./use-chat-sse";
import { useChatLifecycle } from "./use-chat-lifecycle";

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

  // Phase 2A: Supabase provisioning request — set when the AI calls
  // `provision_supabase`. The chat surface watches this and opens
  // <SupabaseProvisionDialog>; cleared by `dismissSupabaseProvision`.
  const [supabaseProvisionRequest, setSupabaseProvisionRequest] =
    useState<SupabaseProvisionRequest | null>(null);

  // Phase 1H: integration Connect card. Set when the AI calls
  // `request_integration` OR an Activepieces tool fails with
  // credentials_missing. Cleared by `dismissIntegrationRequest` or
  // auto-cleared once the user reconnects via the integrations panel.
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
  } = useEditorStore();

  // Collab + history + clear are handled by useChatLifecycle below

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!projectId || !content.trim() || isStreaming) return;

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
      };
      addMessage(userMessage);

      const assistantId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
        liveStatus: "thinking",
      };
      addMessage(assistantMessage);
      setStreaming(true);

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
              mode,
              attachments: attachments?.map((a) => ({
                type: a.mimeType,
                data: a.data,
                name: a.name,
              })),
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";
        let thinkingAccumulated = "";
        let buffer = "";
        let rafHandle: number | null = null;
        let pendingFlush = false;
        let lastFlushedLen = 0;

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
        };

        try {
          let streamDone = false;
          let lastMeaningfulEvent = Date.now();
          const STALE_STREAM_MS = 30_000;

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
                if (parsed.type !== "keep_alive") {
                  lastMeaningfulEvent = Date.now();
                }

                const result = dispatchSSEEvent(parsed, sseCtx);
                if (result.textDelta) {
                  accumulated += result.textDelta;
                  scheduleFlush();
                }
                if (result.thinkingDelta) {
                  thinkingAccumulated += result.thinkingDelta;
                  const preview = result.thinkingDelta.replace(/\s+/g, " ").trim();
                  const statusText = preview.length <= 80
                    ? preview
                    : preview.slice(0, 77).replace(/\s+\S*$/, "") + "\u2026";
                  updateMessageFields(assistantId, {
                    thinkingContent: thinkingAccumulated,
                    liveStatus: statusText || "thinking",
                  });
                }
              } catch {
                // Skip malformed JSON lines
              }
            }

            if (!streamDone && Date.now() - lastMeaningfulEvent > STALE_STREAM_MS) {
              console.warn("[Chat] Stream stale — no meaningful events for 30s, closing");
              clearInterval(fallbackFlushId);
              if (rafHandle) cancelAnimationFrame(rafHandle);
              if (accumulated) updateMessage(assistantId, accumulated);
              break;
            }
          }
        } finally {
          clearInterval(fallbackFlushId);
          if (rafHandle) cancelAnimationFrame(rafHandle);
          if (accumulated) updateMessage(assistantId, accumulated);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const errorContent = "Sorry, something went wrong. Please try again.";
        updateMessage(assistantId, errorContent);
      } finally {
        setStreaming(false);
        updateMessageFields(assistantId, { isStreaming: false, liveStatus: undefined });
        abortRef.current = null;
        setTimeout(() => ownMessageIds.current.delete(broadcastMsgId), 30_000);
      }
    },
    [projectId, mode, isStreaming, addMessage, updateMessage, updateMessageFields, setStreaming, setSupabaseProvisionRequest, setPendingIntegrationRequest]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  const answerClarification = useCallback(
    async (answers: Record<string, string>) => {
      if (!projectId) return;
      useEditorStore.getState().setPendingQuestions(null);
      useEditorStore.getState().setPlanPhase("planning");
      const answerText = Object.entries(answers)
        .map(([q, a]) => `${q}: ${a}`)
        .join("\n");
      sendMessage(`Here are my answers:\n${answerText}`);
    },
    [projectId, sendMessage],
  );

  const approvePlan = useCallback(
    async (planId: string) => {
      if (!projectId) return;
      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();
        await fetch(`${API_BASE}/projects/${projectId}/chat/plan/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ planId }),
        });
        useEditorStore.getState().approvePlan();
        // Trigger the AI to start building after mode switches to agent
        setTimeout(() => {
          sendMessage("The plan has been approved. Please start building it now, step by step. Follow the plan in .doable/plan.md.");
        }, 100);
      } catch (err) {
        console.error("Failed to approve plan:", err);
      }
    },
    [projectId, sendMessage],
  );

  const abandonPlan = useCallback(
    async (planId: string) => {
      if (!projectId) return;
      try {
        const { getStoredTokens } = await import("@/lib/api");
        const { accessToken } = getStoredTokens();
        await fetch(`${API_BASE}/projects/${projectId}/chat/plan/abandon`, {
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

  const { loadHistory, loadMore, hasMore, loadingMore, clearChat, dismissSupabaseProvision, dismissIntegrationRequest } =
    useChatLifecycle({
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
  };
}

