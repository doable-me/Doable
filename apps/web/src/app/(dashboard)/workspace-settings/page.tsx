"use client";

import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  ArrowLeft,
  Users,
  Settings,
  Mail,
  Link2,
  Trash2,
  Shield,
  Crown,
  UserMinus,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Boxes,
  Plug,
  Radio,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiListWorkspaces,
  apiListWorkspaceMembers,
  apiListWorkspaceInvites,
  apiInviteWorkspaceMember,
  apiRemoveWorkspaceMember,
  apiUpdateWorkspaceMemberRole,
  apiRevokeWorkspaceInvite,
  apiGenerateInviteLink,
  apiDeleteWorkspace,
  apiFetch,
  type ApiWorkspace,
  type ApiWorkspaceMember,
  type ApiWorkspaceInvite,
} from "@/lib/api";
import { EnvironmentsPanel } from "@/modules/environments/environments-panel";
import { IntegrationsPanel } from "@/modules/integrations/integrations-panel";
import { McpPanel } from "@/modules/settings/components/mcp-panel";
import { WorkspaceKnowledgePanel } from "./workspace-knowledge";

// ─── Tab definitions ──────────────────────────────────────

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "environments", label: "Environments", icon: Boxes },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mcp", label: "MCP Servers", icon: Radio },
  { id: "knowledge", label: "Knowledge", icon: Brain },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Role display helpers ────────────────────────────────

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "text-amber-400 bg-amber-500/10" },
  admin: { label: "Admin", color: "text-blue-400 bg-blue-500/10" },
  member: { label: "Member", color: "text-zinc-400 bg-zinc-500/10" },
  viewer: { label: "Viewer", color: "text-zinc-500 bg-zinc-500/10" },
};

function RoleBadge({ role }: { role: string }) {
  const info = ROLE_LABELS[role] ?? ROLE_LABELS.member!;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // Active tab
  const initialTab = (searchParams.get("tab") as TabId) || "general";
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "general"
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "general") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", url.toString());
  };

  // Data
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [members, setMembers] = useState<ApiWorkspaceMember[]>([]);
  const [invites, setInvites] = useState<ApiWorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Workspace info editing
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Invite link
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Role change
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const isOwner = workspace?.userRole === "owner";
  const isAdmin = isOwner || workspace?.userRole === "admin";

  const loadData = useCallback(async () => {
    try {
      const wsRes = await apiListWorkspaces();
      const persisted = localStorage.getItem("doable_active_workspace_id");
      const ws = wsRes.data.find((w) => w.id === persisted) ?? wsRes.data[0] ?? null;
      if (!ws) { setLoading(false); return; }

      setWorkspace(ws);
      setEditName(ws.name);
      setEditDesc(ws.description ?? "");

      const [memRes, invRes] = await Promise.all([
        apiListWorkspaceMembers(ws.id),
        isAdmin ? apiListWorkspaceInvites(ws.id).catch(() => ({ data: [] })) : Promise.resolve({ data: [] as ApiWorkspaceInvite[] }),
      ]);
      setMembers(memRes.data);
      setInvites(invRes.data);
    } catch (err) {
      console.error("Failed to load workspace settings:", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!workspace || saving) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiFetch(`/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim() || workspace.name,
          description: editDesc.trim() || null,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      loadData();
    } catch (err) {
      console.error("Failed to update workspace:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!workspace || !inviteEmail.trim() || inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      await apiInviteWorkspaceMember(workspace.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      loadData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!workspace || generatingLink) return;
    setGeneratingLink(true);
    try {
      const res = await apiGenerateInviteLink(workspace.id, "member");
      const token = res.data.token;
      const link = `${window.location.origin}/invite/${token}`;
      setInviteLink(link);
      loadData();
    } catch (err) {
      console.error("Failed to generate invite link:", err);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!workspace) return;
    try {
      await apiRemoveWorkspaceMember(workspace.id, userId);
      loadData();
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!workspace) return;
    setChangingRole(userId);
    try {
      await apiUpdateWorkspaceMemberRole(workspace.id, userId, newRole);
      loadData();
    } catch (err) {
      console.error("Failed to change role:", err);
    } finally {
      setChangingRole(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!workspace) return;
    try {
      await apiRevokeWorkspaceInvite(workspace.id, inviteId);
      loadData();
    } catch (err) {
      console.error("Failed to revoke invite:", err);
    }
  };

  const handleDelete = async () => {
    if (!workspace || deleteConfirm !== workspace.name || deleting) return;
    setDeleting(true);
    try {
      await apiDeleteWorkspace(workspace.id);
      // Switch to another workspace before navigating
      const wsRes = await apiListWorkspaces();
      const remaining = wsRes.data.filter((w) => w.id !== workspace.id);
      if (remaining[0]) {
        localStorage.setItem("doable_active_workspace_id", remaining[0].id);
      } else {
        localStorage.removeItem("doable_active_workspace_id");
      }
      // Full reload to refresh sidebar workspace list
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Failed to delete workspace:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">No workspace found.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </button>

      <h1 className="text-2xl font-bold text-white mb-1">Workspace Settings</h1>
      <p className="text-sm text-zinc-500 mb-2">
        Manage your workspace, team members, environments, and integrations.
      </p>

      {/* ─── Tab Bar ──────────────────────────────────────── */}
      <div className="mb-8 flex gap-1 border-b border-zinc-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "border-brand-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Tab Content ──────────────────────────────────── */}

      {activeTab === "general" && (
        <GeneralTab
          workspace={workspace}
          members={members}
          invites={invites}
          user={user}
          isOwner={isOwner}
          isAdmin={isAdmin}
          editName={editName}
          setEditName={setEditName}
          editDesc={editDesc}
          setEditDesc={setEditDesc}
          saving={saving}
          saveSuccess={saveSuccess}
          handleSave={handleSave}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          inviting={inviting}
          inviteError={inviteError}
          handleInvite={handleInvite}
          generatingLink={generatingLink}
          handleGenerateLink={handleGenerateLink}
          inviteLink={inviteLink}
          linkCopied={linkCopied}
          handleCopyLink={handleCopyLink}
          changingRole={changingRole}
          handleChangeRole={handleChangeRole}
          handleRemoveMember={handleRemoveMember}
          handleRevokeInvite={handleRevokeInvite}
          deleteOpen={deleteOpen}
          setDeleteOpen={setDeleteOpen}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          deleting={deleting}
          handleDelete={handleDelete}
        />
      )}

      {activeTab === "environments" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">Environments</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Bundle skills, rules, knowledge, and MCP connectors into reusable presets.
              Projects inherit the workspace default environment.
            </p>
          </div>
          <div className="p-4">
            <EnvironmentsPanel workspaceId={workspace.id} />
          </div>
        </div>
      )}

      {activeTab === "integrations" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">Integrations</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Connect third-party services like Slack, Notion, GitHub, and more.
              Workspace-level integrations are available to all projects.
            </p>
          </div>
          <div className="p-4">
            <IntegrationsPanel workspaceId={workspace.id} variant="settings" />
          </div>
        </div>
      )}

      {activeTab === "mcp" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">MCP Servers</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Connect Model Context Protocol servers for custom tools and capabilities.
              Workspace-scoped connectors are available to all projects.
            </p>
          </div>
          <div className="p-4">
            <McpPanel workspaceId={workspace.id} />
          </div>
        </div>
      )}

      {activeTab === "knowledge" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200">Knowledge Base</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Context files the AI reads before every interaction.
              Workspace knowledge is inherited by all projects. Projects can add their own overrides.
            </p>
          </div>
          <div className="p-4">
            <WorkspaceKnowledgePanel workspaceId={workspace.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── General Tab (extracted) ──────────────────────────────

interface GeneralTabProps {
  workspace: ApiWorkspace;
  members: ApiWorkspaceMember[];
  invites: ApiWorkspaceInvite[];
  user: { id: string } | null;
  isOwner: boolean;
  isAdmin: boolean;
  editName: string;
  setEditName: (v: string) => void;
  editDesc: string;
  setEditDesc: (v: string) => void;
  saving: boolean;
  saveSuccess: boolean;
  handleSave: () => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteRole: string;
  setInviteRole: (v: string) => void;
  inviting: boolean;
  inviteError: string | null;
  handleInvite: () => void;
  generatingLink: boolean;
  handleGenerateLink: () => void;
  inviteLink: string | null;
  linkCopied: boolean;
  handleCopyLink: () => void;
  changingRole: string | null;
  handleChangeRole: (userId: string, role: string) => void;
  handleRemoveMember: (userId: string) => void;
  handleRevokeInvite: (inviteId: string) => void;
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  deleteConfirm: string;
  setDeleteConfirm: (v: string) => void;
  deleting: boolean;
  handleDelete: () => void;
}

function GeneralTab({
  workspace, members, invites, user, isOwner, isAdmin,
  editName, setEditName, editDesc, setEditDesc, saving, saveSuccess, handleSave,
  inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviting, inviteError, handleInvite,
  generatingLink, handleGenerateLink, inviteLink, linkCopied, handleCopyLink,
  changingRole, handleChangeRole, handleRemoveMember, handleRevokeInvite,
  deleteOpen, setDeleteOpen, deleteConfirm, setDeleteConfirm, deleting, handleDelete,
}: GeneralTabProps) {
  return (
    <>
      {/* ─── General Settings ─────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Settings className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-200">General</h2>
            <p className="text-xs text-zinc-500">Workspace name and description</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Name</label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={!isAdmin}
              className="bg-zinc-800 border-zinc-700 text-zinc-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Description</label>
            <Input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="What's this workspace for?"
              disabled={!isAdmin}
              className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-500 capitalize">
              Plan: <span className="text-zinc-300 font-medium">{workspace.plan}</span>
            </div>
            <div className="text-xs text-zinc-500">
              Your role: <RoleBadge role={workspace.userRole} />
            </div>
          </div>
          {isAdmin && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand-600 text-white hover:bg-brand-500"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saveSuccess ? <Check className="mr-2 h-4 w-4" /> : null}
              {saveSuccess ? "Saved" : "Save changes"}
            </Button>
          )}
        </div>
      </section>

      {/* ─── Team Members ─────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-200">Team Members</h2>
            <p className="text-xs text-zinc-500">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Invite Form */}
        {isAdmin && (
          <div className="mb-5 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <p className="mb-3 text-sm font-medium text-zinc-300">Invite by email</p>
            <div className="flex gap-2">
              <Input
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="bg-brand-600 text-white hover:bg-brand-500"
              >
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </Button>
            </div>
            {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}

            {/* Invite Link */}
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateLink}
                disabled={generatingLink}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                {generatingLink ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                Generate invite link
              </Button>
              {inviteLink && (
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {linkCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {linkCopied ? "Copied!" : "Copy link"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-zinc-700 text-xs text-zinc-300">
                  {(m.display_name ?? m.email)?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {m.display_name ?? m.email}
                  {m.user_id === user?.id && (
                    <span className="ml-1.5 text-[11px] text-zinc-500">(you)</span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== "owner" ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                    disabled={changingRole === m.user_id}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {isAdmin && m.role !== "owner" && m.user_id !== user?.id && (
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove member"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pending Invites ──────────────────────────────── */}
      {isAdmin && invites.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/20">
              <Mail className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-200">Pending Invites</h2>
              <p className="text-xs text-zinc-500">{invites.length} pending</p>
            </div>
          </div>
          <div className="space-y-1">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700">
                  <Mail className="h-3.5 w-3.5 text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{inv.email}</p>
                  <p className="text-[11px] text-zinc-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
                <button
                  onClick={() => handleRevokeInvite(inv.id)}
                  className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Revoke invite"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Danger Zone ──────────────────────────────────── */}
      {isOwner && (
        <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-red-300">Danger Zone</h2>
              <p className="text-xs text-red-400/60">Irreversible actions</p>
            </div>
          </div>
          <p className="mb-4 text-sm text-zinc-400">
            Deleting this workspace will permanently remove all projects, files, and data. This cannot be undone.
          </p>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className="border-red-800 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete workspace
          </Button>
        </section>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete workspace</DialogTitle>
            <DialogDescription className="text-zinc-400">
              This will permanently delete <strong className="text-zinc-200">{workspace.name}</strong> and all its data.
              Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={workspace.name}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteConfirm !== workspace.name || deleting}
              className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
