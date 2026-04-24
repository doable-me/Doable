"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { getStoredTokens } from "@/lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4001";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";
type MessageHandler = (msg: any) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const queueRef = useRef<string[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");

  const connect = useCallback(() => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) return;

    // Clean up any existing connection first (avoids duplicates on React strict mode remount)
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent triggering reconnect
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${accessToken}`);

    ws.onopen = () => {
      setConnectionState("connected");
      retriesRef.current = 0;
      // Flush queued messages
      for (const msg of queueRef.current) ws.send(msg);
      queueRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        for (const handler of handlersRef.current) handler(msg);
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      setConnectionState("reconnecting");
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current++;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    // Defer the actual WebSocket construction to a microtask. In React
    // strict mode (dev) the effect runs → cleanup runs → effect runs again
    // synchronously. Without the defer, the first invocation would create
    // a WebSocket and the cleanup would call close() on it while still in
    // CONNECTING state, producing the browser warning:
    //   "WebSocket is closed before the connection is established."
    // Queuing via setTimeout lets cleanup cancel the pending connect before
    // any socket is opened.
    const t = setTimeout(connect, 0);
    return () => {
      clearTimeout(t);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect attempt during cleanup
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const data = JSON.stringify(msg);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      queueRef.current.push(data);
    }
  }, []);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { send, subscribe, connectionState };
}
