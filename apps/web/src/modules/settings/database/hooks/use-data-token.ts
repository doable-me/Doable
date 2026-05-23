"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchDataToken, makeDataClient } from "../api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_BUFFER_SEC = 60; // refresh 60s before expiry

export interface DataTokenState {
  client: ReturnType<typeof makeDataClient> | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDataToken(projectId: string): DataTokenState {
  const [client, setClient] = useState<ReturnType<typeof makeDataClient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const mint = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const { token, expiresIn } = await fetchDataToken(projectId);
      if (!mountedRef.current) return;
      setClient(makeDataClient(API_URL, token));
      setLoading(false);

      // Schedule proactive refresh
      const refreshAfterMs = Math.max((expiresIn - REFRESH_BUFFER_SEC) * 1000, 0);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void mint(); }, refreshAfterMs);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to get data token");
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void mint();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [mint]);

  return { client, loading, error, refresh: mint };
}
