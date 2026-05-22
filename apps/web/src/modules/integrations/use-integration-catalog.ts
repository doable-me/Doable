"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

export interface CustomAuthField {
  name: string;
  displayName: string;
  description?: string;
  type: "text" | "secret" | "dropdown";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface EnhancedAuthInfo {
  providerKey: string;
  connectLabel: string;
  requiresResourceSelection: boolean;
  resourceLabel?: string;
}

export interface CatalogItem {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  authType: "oauth2" | "secret_text" | "custom_auth" | "basic_auth" | "none";
  tier: "built_in" | "community";
  connected: boolean;
  actionCount: number;
  customAuthFields?: CustomAuthField[];
  enhancedAuth?: EnhancedAuthInfo;
}

export interface IntegrationAction {
  name: string;
  displayName: string;
  description: string;
}

export interface NativeConnection {
  id: string;
  integrationId: string;
  displayName: string;
  logoUrl?: string;
  scope: string;
  projectId?: string;
  authType: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Category labels for display
export const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  productivity: "Productivity",
  developer_tools: "Developer Tools",
  crm_sales: "CRM & Sales",
  marketing: "Marketing",
  finance_payments: "Finance & Payments",
  ai_ml: "AI & ML",
  data_storage: "Data & Storage",
  social_media: "Social Media",
  ecommerce: "E-Commerce",
  project_management: "Project Management",
  customer_support: "Customer Support",
  hr: "HR",
  analytics: "Analytics",
  content: "Content",
  automation: "Automation",
  other: "Other",
};

// Auth type labels
export const AUTH_LABELS: Record<string, string> = {
  oauth2: "Sign in",
  secret_text: "API Key",
  custom_auth: "Custom",
  basic_auth: "Username & Password",
  none: "No auth needed",
};

export function useIntegrationCatalog(workspaceId: string) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [connections, setConnections] = useState<NativeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (workspaceId) params.set("workspaceId", workspaceId);
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      const qs = params.toString();

      const res = await apiFetch<{ data: CatalogItem[]; categories: string[] }>(
        `/integrations/catalog${qs ? `?${qs}` : ""}`
      );
      setCatalog(res.data);
      setCategories(res.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, search, category]);

  const fetchConnections = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await apiFetch<{ data: NativeConnection[] }>(
        `/integrations/connections?workspaceId=${workspaceId}`
      );
      setConnections(res.data);
    } catch {
      // Silently fail — connections are supplementary
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchCatalog();
    fetchConnections();
  }, [fetchCatalog, fetchConnections]);

  const connect = useCallback(async (integrationId: string, data: {
    scope?: string;
    credentials?: Record<string, unknown>;
    displayName?: string;
    projectId?: string;
  }) => {
    const res = await apiFetch<{ data: NativeConnection }>("/integrations/connect", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        integrationId,
        scope: data.scope ?? "user",
        credentials: data.credentials,
        displayName: data.displayName,
        projectId: data.projectId,
      }),
    });
    await fetchCatalog();
    await fetchConnections();
    return res.data;
  }, [workspaceId, fetchCatalog, fetchConnections]);

  const disconnect = useCallback(async (connectionId: string) => {
    await apiFetch(`/integrations/connections/${connectionId}`, { method: "DELETE" });
    await fetchCatalog();
    await fetchConnections();
  }, [fetchCatalog, fetchConnections]);

  const testConnection = useCallback(async (connectionId: string) => {
    const res = await apiFetch<{ data: { success: boolean; message?: string; integrationId?: string } }>(
      `/integrations/connections/${connectionId}/test`,
      { method: "POST" }
    );
    return { valid: res.data.success, message: res.data.message, error: res.data.success ? undefined : res.data.message };
  }, []);

  const getAuthorizationUrl = useCallback(async (integrationId: string, scope?: string) => {
    const params = new URLSearchParams({ workspaceId });
    if (scope) params.set("scope", scope);
    const res = await apiFetch<{ authorizationUrl: string }>(
      `/integrations/oauth/${integrationId}/authorize?${params}`
    );
    return res.authorizationUrl;
  }, [workspaceId]);

  const getActions = useCallback(async (integrationId: string) => {
    const res = await apiFetch<{ data: IntegrationAction[] }>(
      `/integrations/catalog/${integrationId}/actions`
    );
    return res.data;
  }, []);

  const getEnhancedAuthUrl = useCallback(async (integrationId: string) => {
    const params = new URLSearchParams({ workspaceId });
    const res = await apiFetch<{ authorizationUrl: string }>(
      `/integrations/enhanced-auth/${integrationId}/authorize?${params}`
    );
    return res.authorizationUrl;
  }, [workspaceId]);

  const connectedItems = catalog.filter(i => i.connected);
  const availableItems = catalog.filter(i => !i.connected);

  return {
    catalog, categories, connections, loading, error,
    search, setSearch, category, setCategory,
    connectedItems, availableItems,
    connect, disconnect, testConnection,
    getAuthorizationUrl, getEnhancedAuthUrl, getActions,
    refresh: () => { fetchCatalog(); fetchConnections(); },
  };
}
