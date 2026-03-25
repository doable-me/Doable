"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getToken() {
  return localStorage.getItem("doable_access_token");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface FeatureFlag {
  feature_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  min_plan: string | null;
  min_role: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  is_platform_admin: boolean;
  platform_role: string;
  created_at: string;
}

export function usePlatformAdmin() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.isPlatformAdmin === true;

  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFeatures = useCallback(async () => {
    if (!isPlatformAdmin) return;
    try {
      const data = await apiFetch("/admin/features");
      setFeatures(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load features");
    }
  }, [isPlatformAdmin]);

  const loadUsers = useCallback(async () => {
    if (!isPlatformAdmin) return;
    try {
      const data = await apiFetch("/admin/users");
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    Promise.all([loadFeatures(), loadUsers()]).finally(() => setLoading(false));
  }, [isPlatformAdmin, loadFeatures, loadUsers]);

  const toggleFeature = useCallback(async (key: string, enabled: boolean) => {
    await apiFetch(`/admin/features/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    setFeatures((prev) => prev.map((f) => f.feature_key === key ? { ...f, enabled } : f));
  }, []);

  const updateFeature = useCallback(async (key: string, data: Partial<Pick<FeatureFlag, "enabled" | "min_plan" | "min_role">>) => {
    const updated = await apiFetch(`/admin/features/${key}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: data.enabled,
        minPlan: data.min_plan,
        minRole: data.min_role,
      }),
    });
    setFeatures((prev) => prev.map((f) => f.feature_key === key ? updated : f));
  }, []);

  const setUserRole = useCallback(async (userId: string, role: string) => {
    await apiFetch(`/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, platform_role: role, is_platform_admin: role === "admin" || role === "owner" } : u));
  }, []);

  const setUserPlan = useCallback(async (userId: string, plan: string) => {
    await apiFetch(`/admin/users/${userId}/plan`, {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    });
  }, []);

  const bulkUpdateUsers = useCallback(async (userIds: string[], updates: { role?: string; plan?: string }) => {
    const res = await apiFetch("/admin/users/bulk-update", {
      method: "POST",
      body: JSON.stringify({ userIds, ...updates }),
    });
    // Refresh users list after bulk update
    await Promise.all([loadFeatures(), loadUsers()]);
    return res;
  }, [loadFeatures, loadUsers]);

  const toggleUserAdmin = useCallback(async (userId: string, isAdmin: boolean) => {
    await apiFetch(`/admin/users/${userId}/admin`, {
      method: "PATCH",
      body: JSON.stringify({ isPlatformAdmin: isAdmin }),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_platform_admin: isAdmin } : u));
  }, []);

  const setUserOverride = useCallback(async (featureKey: string, userId: string, enabled: boolean) => {
    await apiFetch(`/admin/features/${featureKey}/overrides`, {
      method: "POST",
      body: JSON.stringify({ userId, enabled }),
    });
  }, []);

  const removeUserOverride = useCallback(async (featureKey: string, userId: string) => {
    await apiFetch(`/admin/features/${featureKey}/overrides/${userId}`, {
      method: "DELETE",
    });
  }, []);

  return {
    isPlatformAdmin,
    features,
    users,
    loading,
    error,
    toggleFeature,
    updateFeature,
    toggleUserAdmin,
    setUserOverride,
    removeUserOverride,
    setUserRole,
    setUserPlan,
    bulkUpdateUsers,
    reload: () => Promise.all([loadFeatures(), loadUsers()]),
  };
}
