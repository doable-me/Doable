"use client";

import { useState, useEffect, useCallback } from "react";
import { apiMySharedProjects } from "@/lib/api";

/**
 * Loads the set of project IDs the current user has shared to Discover.
 *
 * Single round-trip → O(1) per dashboard render. Returns a refresh fn so
 * dialogs can invalidate after share/unshare without re-fetching projects.
 */
export function useMyShared() {
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiMySharedProjects();
      setSharedIds(new Set(res.data.projectIds));
    } catch {
      setSharedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sharedIds, loading, refresh };
}
