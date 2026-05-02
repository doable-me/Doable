import { useEffect } from "react";

import { useBuildStore } from "../store/build-store";

const RECONNECT_DELAY_MS = 1500;

export function useBuildEvents(projectId: string | null | undefined): void {
  useEffect(() => {
    if (!projectId) return;

    const store = useBuildStore.getState();
    store.reset(projectId);

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        source = new EventSource(
          `/api/projects/${encodeURIComponent(projectId)}/build/stream?cursor=latest`,
        );
      } catch {
        useBuildStore.getState().setStatus("disconnected");
        scheduleReconnect();
        return;
      }

      source.onopen = () => {
        useBuildStore.getState().setStatus("running");
      };

      source.onmessage = (msg: MessageEvent<string>) => {
        if (!msg.data) return;
        try {
          const parsed = JSON.parse(msg.data) as {
            type?: string;
            data?: unknown;
            seq?: number;
            ts?: number;
          };
          if (typeof parsed.type !== "string") return;
          useBuildStore.getState().ingest({
            type: parsed.type,
            data: parsed.data,
            seq: typeof parsed.seq === "number" ? parsed.seq : 0,
            ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
          });
        } catch {
          // ignore malformed payloads
        }
      };

      source.onerror = () => {
        useBuildStore.getState().setStatus("disconnected");
        if (source) {
          source.close();
          source = null;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (source) {
        source.close();
        source = null;
      }
    };
  }, [projectId]);
}
