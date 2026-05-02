"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, type ChatMessage } from "./use-editor-store";
import { API_BASE } from "./use-chat-types";

/**
 * Extracted lifecycle functions for the chat hook: collab listener,
 * history loading, stream polling, clearing, and dismiss callbacks.
 */
export function useChatLifecycle(opts: {
  projectId: string | null;
  collabSubscribe?: (handler: (msg: any) => void) => () => void;
  addMessage: (msg: ChatMessage) => void;
  prependMessages: (msgs: ChatMessage[]) => void;
  updateMessage: (id: string, content: string) => void;
  updateMessageFields: (id: string, fields: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  ownMessageIds: React.MutableRefObject<Set<string>>;
  remoteStreamMap: React.MutableRefObject<Map<string, string>>;
  setSupabaseProvisionRequest: (r: any) => void;
  setPendingIntegrationRequest: (r: any) => void;
  sendMessage: (content: string) => void;
}) {
  const {
    projectId, collabSubscribe, addMessage, prependMessages, updateMessage,
    updateMessageFields, clearMessages, ownMessageIds, remoteStreamMap,
    setSupabaseProvisionRequest, setPendingIntegrationRequest, sendMessage,
  } = opts;

  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef(false);

  // ─── Listen for WS collaboration events ─────────────────
  useEffect(() => {
    if (!collabSubscribe) return;

    const unsub = collabSubscribe((msg: any) => {
      switch (msg.type) {
        case "ai:message-sent": {
          const msgId = msg.messageId as string;
          if (ownMessageIds.current.has(msgId)) break;

          addMessage({
            id: `remote_user_${msgId}`,
            role: "user",
            content: msg.content ?? "",
            timestamp: new Date().toISOString(),
            senderName: msg.displayName,
            senderId: msg.userId,
          } as ChatMessage);

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

        case "ai:stream-chunk": {
          const msgId = msg.messageId as string;
          if (ownMessageIds.current.has(msgId)) break;

          let assistantId = remoteStreamMap.current.get(msgId);
          if (!assistantId) {
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
            const current = useEditorStore.getState().messages.find(
              (m) => m.id === assistantId
            );
            const preview = (chunk || "").replace(/\s+/g, " ").trim();
            const statusText = preview.length <= 80
              ? preview
              : preview.slice(0, 77).replace(/\s+\S*$/, "") + "\u2026";
            updateMessageFields(assistantId!, {
              thinkingContent: (current?.thinkingContent ?? "") + chunk,
              liveStatus: statusText || "thinking",
            });
          } else {
            const current = useEditorStore.getState().messages.find(
              (m) => m.id === assistantId
            );
            updateMessage(assistantId!, (current?.content ?? "") + chunk);
          }
          break;
        }

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
  }, [collabSubscribe, addMessage, updateMessage, updateMessageFields, ownMessageIds, remoteStreamMap]);

  // Poll for active stream completion (used after page refresh)
  const pollStreamStatus = useCallback(
    (projId: string, assistantMsgId: string, headers: Record<string, string>) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/projects/${projId}/chat/status`, { headers });
          if (!res.ok) { clearInterval(interval); return; }
          const data = await res.json();
          if (!data.streaming) {
            clearInterval(interval);
            const histRes = await fetch(`${API_BASE}/projects/${projId}/chat/history`, { headers });
            if (histRes.ok) {
              const hist = await histRes.json();
              if (Array.isArray(hist.data)) {
                const lastMsg = [...hist.data].reverse().find((m: any) => m.role === "assistant");
                if (lastMsg) {
                  const toolCalls = lastMsg.tool_calls ?? lastMsg.toolCalls;
                  const hadTools =
                    lastMsg.had_tool_calls ??
                    (Array.isArray(toolCalls) && toolCalls.length > 0);
                  updateMessageFields(assistantMsgId, {
                    content: lastMsg.content ?? "",
                    isStreaming: false,
                    liveStatus: undefined,
                    versionSha: lastMsg.version_sha,
                    hadToolCalls: hadTools || undefined,
                    toolCallDetails: hadTools && Array.isArray(toolCalls) ? toolCalls : undefined,
                  });
                  updateMessage(assistantMsgId, lastMsg.content ?? "");
                }
              }
            } else {
              updateMessageFields(assistantMsgId, { isStreaming: false, liveStatus: undefined });
            }
          }
        } catch {
          clearInterval(interval);
          updateMessageFields(assistantMsgId, { isStreaming: false, liveStatus: undefined });
        }
      }, 3000);
      setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    },
    [updateMessage, updateMessageFields],
  );

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};

      const [historyRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}/chat/history?limit=50`, { headers }),
        fetch(`${API_BASE}/projects/${projectId}/chat/status`, { headers }).catch(() => null),
      ]);
      if (!historyRes.ok) return;

      const data = await historyRes.json();
      const statusData = statusRes?.ok ? await statusRes.json() : null;
      const isActivelyStreaming = statusData?.streaming === true;

      const pageHasMore = data.hasMore === true;
      setHasMore(pageHasMore);
      hasMoreRef.current = pageHasMore;

      if (Array.isArray(data.data)) {
        clearMessages();
        for (const msg of data.data) {
          const toolCalls = msg.tool_calls ?? msg.toolCalls;
          const hadTools =
            msg.had_tool_calls ??
            msg.hadToolCalls ??
            (Array.isArray(toolCalls) && toolCalls.length > 0);

          const mapped: ChatMessage = {
            id: msg.id,
            role: msg.role,
            content: msg.content ?? "",
            timestamp: msg.created_at ?? msg.timestamp ?? new Date().toISOString(),
            senderName: msg.display_name ?? msg.senderName,
            senderId: msg.sent_by_user_id ?? msg.senderId,
            versionSha: msg.version_sha ?? msg.versionSha,
            hadToolCalls: hadTools || undefined,
            toolCallDetails: hadTools && Array.isArray(toolCalls) ? toolCalls : undefined,
          };
          addMessage(mapped);
        }

        if (isActivelyStreaming) {
          const msgs = useEditorStore.getState().messages;
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAssistant) {
            updateMessageFields(lastAssistant.id, {
              isStreaming: true,
              liveStatus: "AI is still working...",
            });
            pollStreamStatus(projectId, lastAssistant.id, headers);
          }
        }
      }
    } catch {
      // Silently fail on history load
    }
  }, [projectId, clearMessages, addMessage, updateMessageFields, pollStreamStatus]);

  // Load older messages when user scrolls to top
  const loadMore = useCallback(async () => {
    if (!projectId || !hasMoreRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};

      const messages = useEditorStore.getState().messages;
      const oldestId = messages[0]?.id;
      if (!oldestId) { setLoadingMore(false); return; }

      const res = await fetch(
        `${API_BASE}/projects/${projectId}/chat/history?limit=50&before=${encodeURIComponent(oldestId)}`,
        { headers },
      );
      if (!res.ok) { setLoadingMore(false); return; }

      const data = await res.json();
      const pageHasMore = data.hasMore === true;
      setHasMore(pageHasMore);
      hasMoreRef.current = pageHasMore;

      if (Array.isArray(data.data) && data.data.length > 0) {
        const mapped: ChatMessage[] = data.data.map((msg: any) => {
          const toolCalls = msg.tool_calls ?? msg.toolCalls;
          const hadTools =
            msg.had_tool_calls ??
            msg.hadToolCalls ??
            (Array.isArray(toolCalls) && toolCalls.length > 0);
          return {
            id: msg.id,
            role: msg.role,
            content: msg.content ?? "",
            timestamp: msg.created_at ?? msg.timestamp ?? new Date().toISOString(),
            senderName: msg.display_name ?? msg.senderName,
            senderId: msg.sent_by_user_id ?? msg.senderId,
            versionSha: msg.version_sha ?? msg.versionSha,
            hadToolCalls: hadTools || undefined,
            toolCallDetails: hadTools && Array.isArray(toolCalls) ? toolCalls : undefined,
          };
        });
        prependMessages(mapped);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, loadingMore, prependMessages]);

  const clearChat = useCallback(async () => {
    if (!projectId) return;
    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();
      await fetch(`${API_BASE}/projects/${projectId}/chat`, {
        method: "DELETE",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch { /* Silently fail */ }
    clearMessages();
  }, [projectId, clearMessages]);

  const dismissSupabaseProvision = useCallback(
    (andContinue?: boolean) => {
      setSupabaseProvisionRequest(null);
      if (andContinue) {
        setTimeout(() => {
          sendMessage(
            "The new Supabase project is ready and the credentials are connected. Please continue building now — use the Supabase env vars per this project's framework conventions (see your env-var rules above), and keep SUPABASE_SERVICE_ROLE_KEY server-side only.",
          );
        }, 100);
      }
    },
    [sendMessage, setSupabaseProvisionRequest],
  );

  const dismissIntegrationRequest = useCallback(
    (andContinue?: boolean) => {
      setPendingIntegrationRequest(null);
      if (andContinue) {
        setTimeout(() => {
          sendMessage(
            "The requested integration is now connected. Please continue and use its env vars and tools from the connected-integrations block.",
          );
        }, 100);
      }
    },
    [sendMessage, setPendingIntegrationRequest],
  );

  return { loadHistory, loadMore, hasMore, loadingMore, clearChat, dismissSupabaseProvision, dismissIntegrationRequest };
}
