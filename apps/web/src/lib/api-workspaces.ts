import { apiFetch } from "./api-core";

// ─── Workspace Types ─────────────────────────────────────

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  plan: string;
  /** Per-workspace admin override set via /admin/plans. When non-null and
   *  > 0 this takes precedence over the plan-tier default everywhere
   *  client-side limits are computed. */
  max_projects_override: number | null;
  created_at: string;
  updated_at: string;
  userRole: "owner" | "admin" | "member" | "viewer";
  memberCount: number;
  credits: {
    dailyRemaining: number;
    dailyTotal: number;
    monthlyRemaining: number;
    rolloverCredits: number;
  } | null;
}

// ─── Workspace API Methods ────────────────────────────────

export async function apiListWorkspaces(): Promise<{ data: ApiWorkspace[] }> {
  return apiFetch("/workspaces");
}

export async function apiGetWorkspace(id: string): Promise<{ data: ApiWorkspace }> {
  return apiFetch(`/workspaces/${id}`);
}

export async function apiDeleteWorkspace(id: string): Promise<{ data: { id: string; deleted: boolean } }> {
  return apiFetch(`/workspaces/${id}`, { method: "DELETE" });
}

// ─── Workspace Member Types ──────────────────────────────

export interface ApiWorkspaceMember {
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

export interface ApiWorkspaceInvite {
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

// ─── Workspace Member API Methods ────────────────────────

export async function apiListWorkspaceMembers(workspaceId: string): Promise<{ data: ApiWorkspaceMember[] }> {
  return apiFetch(`/workspaces/${workspaceId}/members`);
}

export async function apiInviteWorkspaceMember(
  workspaceId: string,
  data: { email: string; role: string }
): Promise<{ data: ApiWorkspaceInvite }> {
  return apiFetch(`/workspaces/${workspaceId}/members/invite`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiRemoveWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<{ data: { workspaceId: string; userId: string; removed: boolean } }> {
  return apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function apiUpdateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: string
): Promise<{ data: ApiWorkspaceMember }> {
  return apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function apiAcceptWorkspaceInvite(
  token: string
): Promise<{ data: { invite: ApiWorkspaceInvite; member: ApiWorkspaceMember } }> {
  return apiFetch("/workspaces/invite/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function apiListWorkspaceInvites(workspaceId: string): Promise<{ data: ApiWorkspaceInvite[] }> {
  return apiFetch(`/workspaces/${workspaceId}/invites`);
}

export async function apiRevokeWorkspaceInvite(
  workspaceId: string,
  inviteId: string
): Promise<{ data: { inviteId: string; revoked: boolean } }> {
  return apiFetch(`/workspaces/${workspaceId}/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export async function apiGenerateInviteLink(
  workspaceId: string,
  role: string
): Promise<{ data: ApiWorkspaceInvite }> {
  return apiFetch(`/workspaces/${workspaceId}/invite-link`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}
