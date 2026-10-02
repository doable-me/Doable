"use client";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { Plan } from "@doable/shared/types/ai";
/** Repair missed SSE events from an authoritative snapshot; never resubmit work. */
export function usePlanSync(
  projectId: string | null,
  running: boolean,
  onSnapshot: (plan: Plan | null) => void,
) {
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false,
      busy = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let currentAbort: AbortController | null = null;
    const refresh = async () => {
      if (busy || cancelled) return;
      if (retry) clearTimeout(retry);
      busy = true;
      const abort = new AbortController();
      currentAbort = abort;
      const timeout = setTimeout(() => abort.abort(), 10000);
      try {
        const { data } = await apiFetch<{ data: Plan | null }>(
          `/projects/${projectId}/plan`,
          { signal: abort.signal },
        );
        attempts = 0;
        if (!cancelled) onSnapshot(data);
      } catch (err) {
        if (cancelled) return;
        if (attempts < 4)
          retry = setTimeout(() => void refresh(), 500 * 2 ** attempts++);
        console.warn(
          "[Plan] Snapshot refresh failed",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        clearTimeout(timeout);
        currentAbort = null;
        busy = false;
      }
    };
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        attempts = 0;
        void refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = running ? setInterval(() => void refresh(), 8000) : undefined;
    return () => {
      cancelled = true;
      currentAbort?.abort();
      if (retry) clearTimeout(retry);
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [projectId, running, onSnapshot]);
}
