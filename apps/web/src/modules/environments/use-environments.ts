"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types (mirror actual DB row types) ─────────────────

export interface Environment {
  id: string;
  workspace_id: string | null;
  created_by: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_template: boolean;
  scope: "workspace" | "project" | "user";
  project_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContextSkill {
  id: string;
  scope: string;
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  skill_name: string;
  skill_content: string;
  created_at: string;
  updated_at: string;
}

export interface ContextRule {
  id: string;
  scope: string;
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  rule_name: string;
  file_patterns: string[];
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ContextFile {
  id: string;
  workspace_id: string;
  filename: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Connector {
  id: string;
  workspace_id: string;
  scope: string;
  name: string;
  description: string | null;
  transport_type: string;
  server_url: string | null;
  status: string;
  created_at: string;
}

export interface EnvInstruction {
  id: string;
  environment_id: string;
  filename: string;
  content: string;
  created_at: string;
}

export interface KnowledgeFile {
  id: string;
  environment_id: string;
  filename: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentWithItems extends Environment {
  skills: ContextSkill[];
  rules: ContextRule[];
  instructions: EnvInstruction[];
  knowledge: KnowledgeFile[];
  connectors: Connector[];
  skillRefs: string[];
  ruleRefs: string[];
  connectorRefs: string[];
}

export interface DefaultItems {
  skills: ContextSkill[];
  rules: ContextRule[];
  knowledge: KnowledgeFile[];
  connectors: Connector[];
}

// ─── Hook ───────────────────────────────────────────────

export function useEnvironments(workspaceId: string, opts?: { scope?: 'workspace' | 'project' | 'user'; projectId?: string }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts?.scope) params.set("scope", opts.scope);
      if (opts?.projectId) params.set("projectId", opts.projectId);
      const qs = params.toString();
      const res = await apiFetch<{ data: Environment[] }>(
        `/workspaces/${workspaceId}/environments${qs ? `?${qs}` : ""}`,
      );
      setEnvironments(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load environments");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, opts?.scope, opts?.projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Environment CRUD ──

  const createEnvironment = useCallback(
    async (data: { name: string; description?: string; icon?: string; color?: string }) => {
      const res = await apiFetch<{ data: Environment }>(
        `/workspaces/${workspaceId}/environments`,
        { method: "POST", body: JSON.stringify(data) },
      );
      await refresh();
      return res.data;
    },
    [workspaceId, refresh],
  );

  const updateEnvironment = useCallback(
    async (envId: string, data: { name?: string; description?: string; icon?: string; color?: string }) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}`, {
        method: "PUT", body: JSON.stringify(data),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const deleteEnvironment = useCallback(
    async (envId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}`, { method: "DELETE" });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const cloneEnvironment = useCallback(
    async (envId: string, newName?: string) => {
      const res = await apiFetch<{ data: Environment }>(
        `/workspaces/${workspaceId}/environments/${envId}/clone`,
        { method: "POST", body: JSON.stringify({ newName }) },
      );
      await refresh();
      return res.data;
    },
    [workspaceId, refresh],
  );

  // ── Get full environment detail ──

  const getEnvironment = useCallback(
    async (envId: string): Promise<EnvironmentWithItems> => {
      const res = await apiFetch<{ data: EnvironmentWithItems }>(
        `/workspaces/${workspaceId}/environments/${envId}`,
      );
      return res.data;
    },
    [workspaceId],
  );

  // ── Default environment ──

  const getDefaultInfo = useCallback(async (): Promise<{
    data: Environment | null;
    isCustom: boolean;
    items?: DefaultItems;
  }> => {
    return apiFetch(`/workspaces/${workspaceId}/environments-default`);
  }, [workspaceId]);

  const setDefault = useCallback(
    async (envId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/default`, { method: "POST" });
      await refresh();
    },
    [workspaceId, refresh],
  );

  // ── Ref-based item management (add/remove by ID) ──

  const addSkillRef = useCallback(
    async (envId: string, skillId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/skills`, {
        method: "POST", body: JSON.stringify({ id: skillId }),
      });
    },
    [workspaceId],
  );

  const removeSkillRef = useCallback(
    async (envId: string, skillId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/skills/${skillId}`, {
        method: "DELETE",
      });
    },
    [workspaceId],
  );

  const addRuleRef = useCallback(
    async (envId: string, ruleId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/rules`, {
        method: "POST", body: JSON.stringify({ id: ruleId }),
      });
    },
    [workspaceId],
  );

  const removeRuleRef = useCallback(
    async (envId: string, ruleId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/rules/${ruleId}`, {
        method: "DELETE",
      });
    },
    [workspaceId],
  );

  const addKnowledge = useCallback(
    async (envId: string, filename: string, content: string = "") => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/knowledge`, {
        method: "POST", body: JSON.stringify({ filename, content }),
      });
    },
    [workspaceId],
  );

  const updateKnowledge = useCallback(
    async (envId: string, filename: string, content: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/knowledge/${filename}`, {
        method: "PUT", body: JSON.stringify({ content }),
      });
    },
    [workspaceId],
  );

  const removeKnowledge = useCallback(
    async (envId: string, filename: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/knowledge/${filename}`, {
        method: "DELETE",
      });
    },
    [workspaceId],
  );

  const addConnectorRef = useCallback(
    async (envId: string, connectorId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/connectors`, {
        method: "POST", body: JSON.stringify({ id: connectorId }),
      });
    },
    [workspaceId],
  );

  const removeConnectorRef = useCallback(
    async (envId: string, connectorId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/connectors/${connectorId}`, {
        method: "DELETE",
      });
    },
    [workspaceId],
  );

  // ── Instructions CRUD (environment-specific, not refs) ──

  const addInstruction = useCallback(
    async (envId: string, filename: string, content: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/instructions`, {
        method: "POST", body: JSON.stringify({ filename, content }),
      });
    },
    [workspaceId],
  );

  const updateInstruction = useCallback(
    async (envId: string, instrId: string, data: { filename?: string; content?: string }) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/instructions/${instrId}`, {
        method: "PUT", body: JSON.stringify(data),
      });
    },
    [workspaceId],
  );

  const removeInstruction = useCallback(
    async (envId: string, instrId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/environments/${envId}/instructions/${instrId}`, {
        method: "DELETE",
      });
    },
    [workspaceId],
  );

  return {
    environments,
    loading,
    error,
    refresh,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    cloneEnvironment,
    getEnvironment,
    getDefaultInfo,
    setDefault,
    addSkillRef,
    removeSkillRef,
    addRuleRef,
    removeRuleRef,
    addKnowledge,
    updateKnowledge,
    removeKnowledge,
    addConnectorRef,
    removeConnectorRef,
    addInstruction,
    updateInstruction,
    removeInstruction,
  };
}
