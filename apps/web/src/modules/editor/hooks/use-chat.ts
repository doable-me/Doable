"use client";

import { useCallback, useRef, useEffect } from "react";
import { useEditorStore, type ChatMessage } from "./use-editor-store";
import type { Attachment } from "@/hooks/use-attachments";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param projectId - Current project ID
 * @param collabSubscribe - Optional WS subscribe from collaboration context.
 *   When provided, the hook listens for ai:stream-chunk / ai:stream-end /
 *   ai:message-sent events so that ALL collaborators see AI responses in
 *   real-time — not just the user who sent the prompt.
 */
export function useChat(
  projectId: string | null,
  collabSubscribe?: (handler: (msg: any) => void) => () => void,
) {
  const abortRef = useRef<AbortController | null>(null);
  // Track which messageIds originated from THIS client so we don't double-render
  const ownMessageIds = useRef<Set<string>>(new Set());
  // Track remote streaming message IDs → assistant message IDs in the store
  const remoteStreamMap = useRef<Map<string, string>>(new Map());

  const {
    messages,
    mode,
    isStreaming,
    addMessage,
    updateMessage,
    updateMessageFields,
    setStreaming,
    clearMessages,
  } = useEditorStore();

  // ─── Listen for WS collaboration events ─────────────────
  useEffect(() => {
    if (!collabSubscribe) return;

    const unsub = collabSubscribe((msg: any) => {
      switch (msg.type) {
        // Another user sent an AI message — show their prompt in chat
        case "ai:message-sent": {
          const msgId = msg.messageId as string;
          // Skip if this is our own message
          if (ownMessageIds.current.has(msgId)) break;

          // Add the remote user's message to our chat
          addMessage({
            id: `remote_user_${msgId}`,
            role: "user",
            content: msg.content ?? "",
            timestamp: new Date().toISOString(),
            // Store sender info for attribution
            senderName: msg.displayName,
            senderId: msg.userId,
          } as ChatMessage);

          // Create a placeholder assistant message for the stream
          const assistantId = `remote_ai_${msgId}`;
          remoteStreamMap.current.set(msgId, assistantId);
          addMessage({
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            isStreaming: true,
            liveStatus: "thinking",
          });
          break;
        }

        // AI stream chunk from another user's request
        case "ai:stream-chunk": {
          const msgId = msg.messageId as string;
          if (ownMessageIds.current.has(msgId)) break;

          let assistantId = remoteStreamMap.current.get(msgId);
          if (!assistantId) {
            // Stream started without a prior ai:message-sent (e.g. reconnection)
            assistantId = `remote_ai_${msgId}`;
            remoteStreamMap.current.set(msgId, assistantId);
            addMessage({
              id: assistantId,
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
          }

          const chunk = msg.chunk as string;
          if (msg.isThinking) {
            // Accumulate thinking content
            const current = useEditorStore.getState().messages.find(
              (m) => m.id === assistantId
            );
            updateMessageFields(assistantId, {
              thinkingContent: (current?.thinkingContent ?? "") + chunk,
              liveStatus: "thinking",
            });
          } else {
            // Accumulate text content
            const current = useEditorStore.getState().messages.find(
              (m) => m.id === assistantId
            );
            updateMessage(assistantId, (current?.content ?? "") + chunk);
          }
          break;
        }

        // AI stream ended for another user's request
        case "ai:stream-end": {
          const msgId = msg.messageId as string;
          if (ownMessageIds.current.has(msgId)) break;

          const assistantId = remoteStreamMap.current.get(msgId);
          if (assistantId) {
            updateMessageFields(assistantId, {
              isStreaming: false,
              liveStatus: undefined,
            });
            remoteStreamMap.current.delete(msgId);
          }
          break;
        }
      }
    });

    return unsub;
  }, [collabSubscribe, addMessage, updateMessage, updateMessageFields]);

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!projectId || !content.trim() || isStreaming) return;

      // Generate a messageId we'll use for WS broadcast tracking
      const broadcastMsgId = generateId();
      ownMessageIds.current.add(broadcastMsgId);

      // Add user message
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

      // Create placeholder assistant message
      const assistantId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
      addMessage(assistantMessage);
      setStreaming(true);

      // Abort any previous request
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
        let buffer = ""; // SSE line buffer across chunks
        let rafHandle: number | null = null;
        let pendingFlush = false;

        const flushToState = () => {
          rafHandle = null;
          pendingFlush = false;
          updateMessage(assistantId, accumulated);
        };

        const scheduleFlush = () => {
          if (!pendingFlush) {
            pendingFlush = true;
            rafHandle = requestAnimationFrame(flushToState);
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                // Final flush
                if (rafHandle) cancelAnimationFrame(rafHandle);
                updateMessage(assistantId, accumulated);
                break;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "text_delta") {
                  const text = typeof parsed.data === "string" ? parsed.data : "";
                  accumulated += text;
                  scheduleFlush();
                } else if (parsed.type === "thinking") {
                  const text = typeof parsed.data === "string" ? parsed.data : "";
                  thinkingAccumulated += text;
                  updateMessageFields(assistantId, {
                    thinkingContent: thinkingAccumulated,
                    liveStatus: "thinking",
                  });
                } else if (parsed.type === "tool_call") {
                  const friendly =
                    parsed.data?.friendlyMessage ??
                    parsed.data?.name ??
                    "Working on it";
                  updateMessageFields(assistantId, {
                    liveStatus: `tool_call:${friendly}`,
                  });
                } else if (parsed.type === "tool_result") {
                  const friendly =
                    parsed.data?.friendlyMessage ?? "Done";
                  updateMessageFields(assistantId, {
                    liveStatus: `tool_result:${friendly}`,
                  });
                } else if (parsed.type === "status") {
                  const status = typeof parsed.data === "string" ? parsed.data : "";
                  updateMessageFields(assistantId, {
                    liveStatus: status,
                  });
                } else if (parsed.type === "version_created") {
                  // Git commit was created for this AI response — store SHA for undo
                  const sha = parsed.data?.sha ?? parsed.sha;
                  if (sha) {
                    updateMessageFields(assistantId, {
                      versionSha: sha,
                      hadToolCalls: true,
                    });
                  }
                } else if (parsed.type === "clarification") {
                  const questions = parsed.data?.questions;
                  if (Array.isArray(questions) && questions.length > 0) {
                    useEditorStore.getState().setPendingQuestions(questions);
                    useEditorStore.getState().setPlanPhase("clarifying");
                  }
                } else if (parsed.type === "plan") {
                  const plan = parsed.data?.plan;
                  if (plan) {
                    useEditorStore.getState().setActivePlan(plan);
                    useEditorStore.getState().setPlanPhase("reviewing");
                  }
                } else if (parsed.type === "plan_step_update") {
                  const { stepId, status } = parsed.data ?? {};
                  if (stepId && status) {
                    useEditorStore.getState().updatePlanStep(stepId, { status });
                  }
                } else if (parsed.type === "error") {
                  accumulated += `\n\n**Error:** ${typeof parsed.data === "string" ? parsed.data : "Unknown error"}`;
                  if (rafHandle) cancelAnimationFrame(rafHandle);
                  updateMessage(assistantId, accumulated);
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        } finally {
          // Ensure final content is flushed
          if (rafHandle) cancelAnimationFrame(rafHandle);
          if (accumulated) updateMessage(assistantId, accumulated);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const errorContent =
          "Sorry, something went wrong. Please try again.";
        updateMessage(assistantId, errorContent);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // Clean up own message tracking after a delay
        setTimeout(() => ownMessageIds.current.delete(broadcastMsgId), 30_000);
      }
    },
    [projectId, mode, isStreaming, addMessage, updateMessage, updateMessageFields, setStreaming]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  const answerClarification = useCallback(
    async (answers: Record<string, string>) => {
      if (!projectId) return;
      // Clear pending questions
      useEditorStore.getState().setPendingQuestions(null);
      useEditorStore.getState().setPlanPhase("planning");
      // Send answers as a follow-up message in plan mode
      const answerText = Object.entries(answers)
        .map(([qId, answer]) => `${qId}: ${answer}`)
        .join("\n");
      await sendMessage(`Here are my answers to your questions:\n\n${answerText}`);
    },
    [projectId, sendMessage]
  );

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
        // Trigger the AI to start building after mode switches to agent
        setTimeout(() => {
          sendMessage("The plan has been approved. Please start building it now, step by step. Follow the plan in .doable/plan.md.");
        }, 100);
      } catch (err) {
        console.error("[Plan] Approve failed:", err);
      }
    },
    [projectId, sendMessage]
  );

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
        console.error("[Plan] Abandon failed:", err);
      }
    },
    [projectId]
  );

  const loadHistory = useCallback(async () => {
    if (!projectId) return;

    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();

      const response = await fetch(
        `${API_BASE}/projects/${projectId}/chat/history`,
        {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        },
      );
      if (!response.ok) return;

      const data = await response.json();
      if (Array.isArray(data.data)) {
        clearMessages();
        for (const msg of data.data) {
          addMessage(msg);
        }
      }
    } catch {
      // Silently fail on history load
    }
  }, [projectId, clearMessages, addMessage]);

  const clearChat = useCallback(async () => {
    if (!projectId) return;

    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();

      await fetch(`${API_BASE}/projects/${projectId}/chat`, {
        method: "DELETE",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch {
      // Silently fail
    }
    clearMessages();
  }, [projectId, clearMessages]);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadHistory,
    clearChat,
    answerClarification,
    approvePlan,
    abandonPlan,
  };
}
