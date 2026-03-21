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
}

/**
 * Invisible component that bridges WS collaboration AI events
 * into the page's chat state. Place inside CollaborationProvider.
 */
export function CollabAiSync({
  onRemoteUserMessage,
  onRemoteStreamChunk,
  onRemoteStreamEnd,
}: CollabAiSyncProps) {
  const { subscribe, joined } = useCollaboration();

  // Use refs to avoid re-subscribing on every callback change
  const onMsgRef = useRef(onRemoteUserMessage);
  const onChunkRef = useRef(onRemoteStreamChunk);
  const onEndRef = useRef(onRemoteStreamEnd);
  onMsgRef.current = onRemoteUserMessage;
  onChunkRef.current = onRemoteStreamChunk;
  onEndRef.current = onRemoteStreamEnd;

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
      }
    });

    return unsub;
  }, [joined, subscribe]);

  return null; // Invisible — just bridges events
}
