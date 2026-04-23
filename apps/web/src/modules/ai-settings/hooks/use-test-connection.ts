"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  models?: DiscoveredModel[];
}

export interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  capabilities?: { vision?: boolean; tools?: boolean };
}

export interface TestConnectionParams {
  type: "openai" | "azure" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
  presetId?: string;
}

export function useTestConnection() {
  const [result, setResult] = useState<TestConnectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = useCallback(async (params: TestConnectionParams) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ data: TestConnectionResult }>(
        "/ai/providers/test-connection",
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      setResult(res.data);
      return res.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setError(message);
      setResult({ ok: false, latencyMs: 0, error: message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return { testConnection, result, isLoading, error, reset };
}
