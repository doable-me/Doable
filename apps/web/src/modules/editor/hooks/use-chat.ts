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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "text_delta") {
                  accumulated += parsed.data;
                  updateMessage(assistantId, accumulated);
                } else if (parsed.type === "error") {
                  accumulated += `\n\n**Error:** ${parsed.data}`;
                  updateMessage(assistantId, accumulated);
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
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
    [projectId, mode, isStreaming, addMessage, updateMessage, setStreaming]
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
