"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ─────────────────────────────────────────────

export interface Skill {
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

export interface Rule {
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

// ─── Hook ──────────────────────────────────────────────

export function useSkillsRules(workspaceId: string) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, rulesRes] = await Promise.all([
        apiFetch<{ data: Skill[] }>(`/workspaces/${workspaceId}/skills`),
        apiFetch<{ data: Rule[] }>(`/workspaces/${workspaceId}/rules`),
      ]);
      setSkills(skillsRes.data);
      setRules(rulesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills & rules");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Skills CRUD ──

  const createSkill = useCallback(
    async (data: { skillName: string; skillContent: string }) => {
      await apiFetch(`/workspaces/${workspaceId}/skills`, {
        method: "POST",
        body: JSON.stringify({ scope: "workspace", ...data }),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const updateSkill = useCallback(
    async (id: string, skillContent: string) => {
      await apiFetch(`/workspaces/${workspaceId}/skills/${id}`, {
        method: "PUT",
        body: JSON.stringify({ skillContent }),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const deleteSkill = useCallback(
    async (id: string) => {
      await apiFetch(`/workspaces/${workspaceId}/skills/${id}`, { method: "DELETE" });
      await refresh();
    },
    [workspaceId, refresh],
  );

  // ── Rules CRUD ──

  const createRule = useCallback(
    async (data: { ruleName: string; content: string; filePatterns: string[] }) => {
      await apiFetch(`/workspaces/${workspaceId}/rules`, {
        method: "POST",
        body: JSON.stringify({ scope: "workspace", ...data }),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const updateRule = useCallback(
    async (id: string, content: string, filePatterns?: string[]) => {
      await apiFetch(`/workspaces/${workspaceId}/rules/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content, filePatterns }),
      });
      await refresh();
    },
    [workspaceId, refresh],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await apiFetch(`/workspaces/${workspaceId}/rules/${id}`, { method: "DELETE" });
      await refresh();
    },
    [workspaceId, refresh],
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
