import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface LogFilter {
  id: number;
  filter_id: "deny-pattern" | "drop-pattern";
  config: { pattern: string; token?: string };
  enabled: boolean;
}

export function useLogFilters(workspaceId: string) {
  const [filters, setFilters] = useState<LogFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: LogFilter[] }>(
        `/workspaces/${workspaceId}/log-filters`
      );
      setFilters(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: {
      filter_id: "deny-pattern" | "drop-pattern";
      config: { pattern: string; token?: string };
    }) => {
      await apiFetch(`/workspaces/${workspaceId}/log-filters`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const toggle = useCallback(
    async (id: number, enabled: boolean) => {
      await apiFetch(`/workspaces/${workspaceId}/log-filters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const remove = useCallback(
    async (id: number) => {
      await apiFetch(`/workspaces/${workspaceId}/log-filters/${id}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  return { filters, loading, error, create, toggle, remove, refresh };
}
