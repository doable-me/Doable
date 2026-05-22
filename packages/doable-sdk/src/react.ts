/**
 * @doable/sdk/react — React hooks for calling integrations.
 *
 * Usage:
 *   import { useIntegration, useIntegrationQuery } from "@doable/sdk/react";
 *
 *   // Mutation (fire-and-forget):
 *   const slack = useIntegration("slack", "send_channel_message");
 *   await slack.run({ channel: "#general", text: "Hello!" });
 *
 *   // Query (data fetching):
 *   const { data, loading } = useIntegrationQuery("slack", "list_channels", {});
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createDoableClient, type IntegrationCallResult, type DoableSDKConfig } from "./index.js";

// Singleton client — shared across all hooks in the app
let sharedClient: ReturnType<typeof createDoableClient> | null = null;

function getClient(config?: DoableSDKConfig) {
  if (!sharedClient) {
    sharedClient = createDoableClient(config);
  }
  return sharedClient;
}

// ─── useIntegration — Mutation Hook ────────────────────────

export interface UseIntegrationReturn<T = unknown> {
  /** Call the integration action */
  run: (props?: Record<string, unknown>) => Promise<IntegrationCallResult<T>>;
  /** Whether a call is in progress */
  loading: boolean;
  /** Last error, if any */
  error: { code: string; message: string } | null;
  /** Last successful result data */
  data: T | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for calling integration actions (mutations/side effects).
 *
 * @example
 * const slack = useIntegration("slack", "send_channel_message");
 * <button onClick={() => slack.run({ channel: "#general", text: "hi" })}>Send</button>
 */
export function useIntegration<T = unknown>(
  integrationId: string,
  actionName: string,
  config?: DoableSDKConfig,
): UseIntegrationReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [data, setData] = useState<T | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const run = useCallback(
    async (props?: Record<string, unknown>): Promise<IntegrationCallResult<T>> => {
      setLoading(true);
      setError(null);

      const client = getClient(config);
      const result = await client.integrations.run<T>(integrationId, actionName, props);

      if (mountedRef.current) {
        setLoading(false);
        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      }

      return result;
    },
    [integrationId, actionName, config],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { run, loading, error, data, reset };
}

// ─── useIntegrationQuery — Query Hook ─────────────────────

export interface UseIntegrationQueryOptions {
  /** Whether the query should execute (default: true) */
  enabled?: boolean;
  /** Polling interval in ms (omit for no polling) */
  refetchInterval?: number;
}

export interface UseIntegrationQueryReturn<T = unknown> {
  data: T | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  refetch: () => void;
}

/**
 * Hook for fetching data from integrations (read-only queries).
 *
 * @example
 * const { data, loading } = useIntegrationQuery("slack", "list_channels", {});
 */
export function useIntegrationQuery<T = unknown>(
  integrationId: string,
  actionName: string,
  props?: Record<string, unknown>,
  options?: UseIntegrationQueryOptions,
  config?: DoableSDKConfig,
): UseIntegrationQueryReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const mountedRef = useRef(true);
  const enabled = options?.enabled !== false;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);

    const client = getClient(config);
    const result = await client.integrations.run<T>(integrationId, actionName, props);

    if (mountedRef.current) {
      setLoading(false);
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    }
  }, [integrationId, actionName, JSON.stringify(props), enabled, config]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    if (!options?.refetchInterval || !enabled) return;
    const interval = setInterval(fetchData, options.refetchInterval);
    return () => clearInterval(interval);
  }, [fetchData, options?.refetchInterval, enabled]);

  return { data, loading, error, refetch: fetchData };
}
