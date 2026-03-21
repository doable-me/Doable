"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  content: string;
  scope: "workspace" | "project" | "user";
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  name: string;
  content: string;
  scope: "workspace" | "project" | "user";
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillPayload {
  name: string;
  content: string;
  scope: "workspace" | "project" | "user";
  projectId?: string;
}

export interface CreateRulePayload {
  name: string;
  content: string;
  scope: "workspace" | "project" | "user";
  projectId?: string;
}

// ─── Hook ───────────────────────────────────────────────────

export function useSkills(
  workspaceId: string,
  projectId?: string,
  apiBaseUrl = "/api"
) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = projectId ? `?projectId=${projectId}` : "";
      const [skillsRes, rulesRes] = await Promise.all([
        fetch(`${apiBaseUrl}/workspaces/${workspaceId}/skills${query}`, {
          credentials: "include",
        }),
        fetch(`${apiBaseUrl}/workspaces/${workspaceId}/rules${query}`, {
          credentials: "include",
        }),
      ]);
      if (!skillsRes.ok) throw new Error("Failed to load skills");
      if (!rulesRes.ok) throw new Error("Failed to load rules");
      const skillsJson = (await skillsRes.json()) as { data: Skill[] };
      const rulesJson = (await rulesRes.json()) as { data: Rule[] };
      setSkills(skillsJson.data);
      setRules(rulesJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId, apiBaseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ─── Skill CRUD ─────────────────────────────────────────

  const createSkill = useCallback(
    async (payload: CreateSkillPayload) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/skills`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to create skill");
      }
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const updateSkill = useCallback(
    async (skillId: string, payload: Partial<CreateSkillPayload>) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/skills/${skillId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to update skill");
      }
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const deleteSkill = useCallback(
    async (skillId: string) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/skills/${skillId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to delete skill");
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  // ─── Rule CRUD ──────────────────────────────────────────

  const createRule = useCallback(
    async (payload: CreateRulePayload) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/rules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to create rule");
      }
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const updateRule = useCallback(
    async (ruleId: string, payload: Partial<CreateRulePayload>) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/rules/${ruleId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to update rule");
      }
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
  );

  const deleteRule = useCallback(
    async (ruleId: string) => {
      const res = await fetch(
        `${apiBaseUrl}/workspaces/${workspaceId}/rules/${ruleId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to delete rule");
      await refresh();
    },
    [workspaceId, apiBaseUrl, refresh]
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
