"use client";

import { useCallback, useRef } from "react";
import { useEditorStore, type ChatMessage } from "./use-editor-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat(projectId: string | null) {
  const abortRef = useRef<AbortController | null>(null);

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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!projectId || !content.trim() || isStreaming) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
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
        const response = await fetch(
          `${API_BASE}/projects/${projectId}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: content.trim(), mode }),
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
      }
    },
    [projectId, mode, isStreaming, addMessage, updateMessage, updateMessageFields, setStreaming]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/chat/history`
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
      await fetch(`${API_BASE}/projects/${projectId}/chat`, {
        method: "DELETE",
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
  };
}
