"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface WorkspaceMemberData {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  invited_by: string | null;
  joined_at: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface WorkspaceInviteData {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface UseWorkspaceMembersReturn {
  members: WorkspaceMemberData[];
  invites: WorkspaceInviteData[];
  loading: boolean;
  error: string | null;
  inviteMember: (email: string, role: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  updateRole: (userId: string, role: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  generateInviteLink: (role: string) => Promise<string>;
  refetch: () => void;
}

export function useWorkspaceMembers(
  workspaceId: string | null
): UseWorkspaceMembersReturn {
  const [members, setMembers] = useState<WorkspaceMemberData[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);

    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiFetch<{ data: WorkspaceMemberData[] }>(
          `/workspaces/${workspaceId}/members`
        ),
        apiFetch<{ data: WorkspaceInviteData[] }>(
          `/workspaces/${workspaceId}/invites`
        ).catch(() => ({ data: [] as WorkspaceInviteData[] })),
      ]);

      setMembers(membersRes.data);
      setInvites(invitesRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const inviteMember = async (email: string, role: string) => {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/members/invite`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    await fetchMembers();
  };

  const removeMember = async (userId: string) => {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    });
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const updateRole = async (userId: string, role: string) => {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId
          ? { ...m, role: role as WorkspaceMemberData["role"] }
          : m
      )
    );
  };

  const revokeInvite = async (inviteId: string) => {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: "DELETE",
    });
    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const generateInviteLink = async (role: string): Promise<string> => {
    if (!workspaceId) throw new Error("No workspace selected");
    const res = await apiFetch<{ data: WorkspaceInviteData }>(
      `/workspaces/${workspaceId}/invite-link`,
      {
        method: "POST",
        body: JSON.stringify({ role }),
      }
    );
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/invite/${res.data.token}`;
  };

  return {
    members,
    invites,
    loading,
    error,
    inviteMember,
    removeMember,
    updateRole,
    revokeInvite,
    generateInviteLink,
    refetch: fetchMembers,
  };
}
