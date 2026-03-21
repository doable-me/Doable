"use client";

import { useEffect, useRef } from "react";
import { useCollaboration } from "../collaboration-context";

interface CollabAiSyncProps {
  /** Called when a remote user sends an AI message */
  onRemoteUserMessage?: (data: {
    messageId: string;
    userId: string;
    displayName: string;
    content: string;
  }) => void;
  /** Called when a remote AI stream chunk arrives */
  onRemoteStreamChunk?: (data: {
    messageId: string;
    chunk: string;
    isThinking: boolean;
  }) => void;
  /** Called when a remote AI stream ends */
  onRemoteStreamEnd?: (data: {
    messageId: string;
    finalContent?: string;
  }) => void;
  /** Called when a remote AI tool call/result arrives */
  onRemoteToolEvent?: (data: {
    messageId: string;
    event: "tool_call" | "tool_result";
    toolName: string;
    args: Record<string, unknown>;
    friendlyMessage?: string;
  }) => void;
  /** Called when a remote AI status update arrives */
  onRemoteStatus?: (data: {
    messageId: string;
    status: string;
  }) => void;
  /** Called when a remote AI error arrives */
  onRemoteError?: (data: {
    messageId: string;
    error: string;
  }) => void;
}

/**
 * Invisible component that bridges WS collaboration AI events
 * into the page's chat state. Place inside CollaborationProvider.
 */
export function CollabAiSync({
  onRemoteUserMessage,
  onRemoteStreamChunk,
  onRemoteStreamEnd,
  onRemoteToolEvent,
  onRemoteStatus,
  onRemoteError,
}: CollabAiSyncProps) {
  const { subscribe, joined } = useCollaboration();

  // Use refs to avoid re-subscribing on every callback change
  const onMsgRef = useRef(onRemoteUserMessage);
  const onChunkRef = useRef(onRemoteStreamChunk);
  const onEndRef = useRef(onRemoteStreamEnd);
  const onToolRef = useRef(onRemoteToolEvent);
  const onStatusRef = useRef(onRemoteStatus);
  const onErrorRef = useRef(onRemoteError);
  onMsgRef.current = onRemoteUserMessage;
  onChunkRef.current = onRemoteStreamChunk;
  onEndRef.current = onRemoteStreamEnd;
  onToolRef.current = onRemoteToolEvent;
  onStatusRef.current = onRemoteStatus;
  onErrorRef.current = onRemoteError;

  useEffect(() => {
    if (!joined) return;

    const unsub = subscribe((msg: any) => {
      switch (msg.type) {
        case "ai:message-sent":
          onMsgRef.current?.({
            messageId: msg.messageId,
            userId: msg.userId,
            displayName: msg.displayName,
            content: msg.content,
          });
          break;
        case "ai:stream-chunk":
          onChunkRef.current?.({
            messageId: msg.messageId,
            chunk: msg.chunk,
            isThinking: !!msg.isThinking,
          });
          break;
        case "ai:stream-end":
          onEndRef.current?.({
            messageId: msg.messageId,
            finalContent: msg.finalContent,
          });
          break;
        case "ai:tool-event":
          onToolRef.current?.({
            messageId: msg.messageId,
            event: msg.event,
            toolName: msg.data?.name ?? msg.event,
            args: msg.data?.arguments ?? {},
            friendlyMessage: msg.data?.friendlyMessage,
          });
          break;
        case "ai:status": {
          const statusStr =
            typeof msg.data === "string"
              ? msg.data
              : msg.data?.message ?? "";
          onStatusRef.current?.({
            messageId: msg.messageId,
            status: statusStr,
          });
          break;
        }
        case "ai:error":
          onErrorRef.current?.({
            messageId: msg.messageId,
            error: msg.error ?? "Unknown error",
          });
          break;
      }
    });

    return unsub;
  }, [joined, subscribe]);

  return null; // Invisible — just bridges events
}
