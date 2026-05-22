"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

export interface Skill {
  id: string;
  skill_name: string;
  description: string;
  skill_content: string;
  auto_invoke: boolean;
  scope: "workspace" | "project" | "user";
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: string;
  rule_name: string;
  content: string;
  file_patterns: string[];
  scope: "workspace" | "project" | "user";
  project_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Hook ───────────────────────────────────────────────────

export function useSkills(workspaceId: string, projectId?: string) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = projectId ? `?projectId=${projectId}` : "";
      const [skillsJson, rulesJson] = await Promise.all([
        apiFetch<{ data: Skill[] }>(`/workspaces/${workspaceId}/skills${query}`),
        apiFetch<{ data: Rule[] }>(`/workspaces/${workspaceId}/rules${query}`),
      ]);
      setSkills(skillsJson.data);
      setRules(rulesJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSkill = useCallback(
    async (payload: { skillName: string; description: string; skillContent: string; autoInvoke?: boolean; scope: string; projectId?: string }) => {
      await apiFetch(`/workspaces/${workspaceId}/skills`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const updateSkill = useCallback(
    async (skillId: string, updates: { skillContent?: string; description?: string; autoInvoke?: boolean }) => {
      await apiFetch(`/workspaces/${workspaceId}/skills/${skillId}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const deleteSkill = useCallback(
    async (skillId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/skills/${skillId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const createRule = useCallback(
    async (payload: { ruleName: string; content: string; filePatterns: string[]; scope: string; projectId?: string }) => {
      await apiFetch(`/workspaces/${workspaceId}/rules`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const updateRule = useCallback(
    async (ruleId: string, content: string, filePatterns?: string[]) => {
      await apiFetch(`/workspaces/${workspaceId}/rules/${ruleId}`, {
        method: "PUT",
        body: JSON.stringify({ content, filePatterns }),
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  const deleteRule = useCallback(
    async (ruleId: string) => {
      await apiFetch(`/workspaces/${workspaceId}/rules/${ruleId}`, {
        method: "DELETE",
      });
      await refresh();
    },
    [workspaceId, refresh]
  );

  return {
    skills,
    rules,
    loading,
    error,
    refresh,
    createSkill,
    updateSkill,
    deleteSkill,
    createRule,
    updateRule,
    deleteRule,
  };
}
