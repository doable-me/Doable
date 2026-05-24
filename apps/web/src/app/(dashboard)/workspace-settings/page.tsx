"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Loader2, Boxes, Plug, Radio, Brain, Sparkles, Bot } from "lucide-react";
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
import { SkillsRulesPanel } from "@/modules/settings/components/skills-rules-panel";
import { WorkspaceKnowledgePanel } from "./workspace-knowledge";
import { GeneralTab } from "./general-tab";
import { DoableAiWorkspaceTab } from "./doable-ai-tab";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "@/components/ui/toast-container";

// ─── Tab definitions ──────────────────────────────────────

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "environments", label: "Environments", icon: Boxes },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mcp", label: "MCP Servers", icon: Radio },
  { id: "skills", label: "Skills & Rules", icon: Sparkles },
  { id: "knowledge", label: "Knowledge", icon: Brain },
  { id: "doable-ai", label: "Doable AI", icon: Bot },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

function WorkspaceSettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

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
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const { toasts, addToast, dismissToast } = useToasts();

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const wsRes = await apiListWorkspaces();
      const persisted = localStorage.getItem("doable_active_workspace_id");
      const ws = wsRes.data.find((w) => w.id === persisted) ?? wsRes.data[0] ?? null;
      if (!ws) {
        // Distinguish "empty list" from "failed call" so user gets a useful message.
        setLoadError(
          wsRes.data.length === 0
            ? "You are not a member of any workspace yet. Create one from the dashboard to continue."
            : null,
        );
        setLoading(false);
        return;
      }

      setWorkspace(ws);
      setEditName(ws.name);
      setEditDesc(ws.description ?? "");

      const [memRes, invRes] = await Promise.all([
        apiListWorkspaceMembers(ws.id).catch((e) => {
          console.warn("workspace-settings: members fetch failed", e);
          return { data: [] as ApiWorkspaceMember[] };
        }),
        isAdmin
          ? apiListWorkspaceInvites(ws.id).catch(() => ({ data: [] as ApiWorkspaceInvite[] }))
          : Promise.resolve({ data: [] as ApiWorkspaceInvite[] }),
      ]);
      setMembers(memRes.data);
      setInvites(invRes.data);
    } catch (err) {
      console.error("Failed to load workspace settings:", err);
      setLoadError(
        err instanceof Error
          ? `Couldn't load workspaces: ${err.message}`
          : "Couldn't load workspaces. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    // Wait for auth to settle before hitting the API — otherwise an unauthenticated
    // request races against token refresh and surfaces as a fake "No workspace found".
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      setLoadError("You're signed out. Please sign in to view workspace settings.");
      return;
    }
    loadData();
  }, [loadData, authLoading, isAuthenticated]);

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground max-w-md">
          {loadError ?? "No workspace found."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadData()}>
            Retry
          </Button>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-1">Workspace Settings</h1>
      <p className="text-sm text-muted-foreground mb-2">
        Manage your workspace, team members, environments, and integrations.
      </p>

      {/* ─── Tab Bar ──────────────────────────────────────── */}
      <div className="mb-8 flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                isActive
                  ? "border-brand-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
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
        <SettingsSection title="Environments" description="Bundle skills, rules, knowledge, and MCP connectors into reusable presets. Projects inherit the workspace default environment.">
          <EnvironmentsPanel workspaceId={workspace.id} />
        </SettingsSection>
      )}

      {activeTab === "integrations" && (
        <SettingsSection title="Integrations" description="Connect third-party services like Slack, Notion, GitHub, and more. Workspace-level integrations are available to all projects.">
          <IntegrationsPanel workspaceId={workspace.id} variant="settings" />
        </SettingsSection>
      )}

      {activeTab === "mcp" && (
        <SettingsSection title="MCP Servers" description="Connect Model Context Protocol servers for custom tools and capabilities. Workspace-scoped connectors are available to all projects.">
          <McpPanel workspaceId={workspace.id} />
        </SettingsSection>
      )}

      {activeTab === "skills" && (
        <SettingsSection title="Skills & Rules" description="Manage reusable skills and rules that shape how the AI works. Workspace-level skills are inherited by all projects.">
          <SkillsRulesPanel workspaceId={workspace.id} />
        </SettingsSection>
      )}

      {activeTab === "knowledge" && (
        <SettingsSection title="Knowledge Base" description="Context files the AI reads before every interaction. Workspace knowledge is inherited by all projects. Projects can add their own overrides.">
          <WorkspaceKnowledgePanel workspaceId={workspace.id} />
        </SettingsSection>
      )}

      {activeTab === "doable-ai" && (
        <DoableAiWorkspaceTab workspaceId={workspace.id} isAdmin={isAdmin} addToast={addToast} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceSettingsPageInner />
    </Suspense>
  );
}
