"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import type { ProviderPreset } from "@doable/shared";

interface CatalogState {
  catalog: ProviderPreset[];
  isLoading: boolean;
  error: string | null;
}

export function useProviderCatalog() {
  const [state, setState] = useState<CatalogState>({
    catalog: [],
    isLoading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await apiFetch<{ data: ProviderPreset[] }>("/ai/provider-catalog");
      setState({ catalog: res.data, isLoading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load provider catalog",
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byCategory = useMemo(() => {
    const groups: Record<string, ProviderPreset[]> = { cloud: [], local: [], gateway: [] };
    for (const p of state.catalog) {
      (groups[p.category] ??= []).push(p);
    }
    return groups;
  }, [state.catalog]);

  const bySubcategory = useMemo(() => {
    const groups: Record<string, ProviderPreset[]> = {};
    for (const p of state.catalog) {
      (groups[p.subcategory] ??= []).push(p);
    }
    return groups;
  }, [state.catalog]);

  const freeProviders = useMemo(
    () => state.catalog.filter((p) => p.freeTier),
    [state.catalog],
  );

  return {
    catalog: state.catalog,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    byCategory,
    bySubcategory,
    freeProviders,
  };
}
