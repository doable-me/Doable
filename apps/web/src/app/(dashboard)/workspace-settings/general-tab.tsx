"use client";

import { useEffect, useState } from "react";
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
  Layers,
} from "lucide-react";
import type {
  ApiWorkspace,
  ApiWorkspaceMember,
  ApiWorkspaceInvite,
} from "@/lib/api";
import { apiGetAiDefaults, apiUpdateAiDefaults } from "@/lib/api";

// Mirrors `services/api/src/frameworks/init.ts:DEFAULT_ENABLED`. The 6
// other framework adapters were removed; backups are at
// ~/Documents/doable-disabled-frameworks-backup-<date>/.
const FRAMEWORK_OPTIONS = [
  { id: "", label: "No default (let users choose)" },
  { id: "vite-react", label: "React (Vite)" },
  { id: "nextjs-app", label: "Next.js" },
] as const;

function DefaultFrameworkSection({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetAiDefaults(workspaceId)
      .then((res) => {
        if (cancelled) return;
        const fw = (res.data as { default_framework_id?: string | null }).default_framework_id;
        setValue(fw ?? "");
      })
      .catch(() => { /* fall back to empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const handleSave = async (newValue: string) => {
    setValue(newValue);
    if (!isAdmin) return;
    setSaving(true);
    try {
      await apiUpdateAiDefaults(workspaceId, {
        // Cast through unknown — the API helper's typed shape predates
        // default_framework_id; the server validates it via z.enum.
        ...({ defaultFrameworkId: newValue || null } as unknown as Parameters<typeof apiUpdateAiDefaults>[1]),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
          <Layers className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Default framework</h2>
          <p className="text-xs text-muted-foreground">
            Used when a creator doesn&apos;t pick a framework and the prompt
            doesn&apos;t clearly signal one. Defaults to React (Vite) when unset.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <select
          value={value}
          onChange={(e) => handleSave(e.target.value)}
          disabled={!isAdmin || loading || saving}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          {FRAMEWORK_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {savedAt && <Check className="h-4 w-4 text-green-400" />}
        {!isAdmin && (
          <span className="text-xs text-muted-foreground">Read-only — admin permission required.</span>
        )}
      </div>
    </section>
  );
}

// ─── Role display helpers ────────────────────────────────

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "text-amber-400 bg-amber-500/10" },
  admin: { label: "Admin", color: "text-blue-400 bg-blue-500/10" },
  member: { label: "Member", color: "text-muted-foreground bg-muted" },
  viewer: { label: "Viewer", color: "text-muted-foreground bg-muted" },
};

function RoleBadge({ role }: { role: string }) {
  const info = ROLE_LABELS[role] ?? ROLE_LABELS.member!;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── General Tab ─────────────────────────────────────────

export interface GeneralTabProps {
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

export function GeneralTab({
  workspace, members, invites, user, isOwner, isAdmin,
  editName, setEditName, editDesc, setEditDesc, saving, saveSuccess, handleSave,
  inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviting, inviteError, handleInvite,
  generatingLink, handleGenerateLink, inviteLink, linkCopied, handleCopyLink,
  changingRole, handleChangeRole, handleRemoveMember, handleRevokeInvite,
  deleteOpen, setDeleteOpen, deleteConfirm, setDeleteConfirm, deleting, handleDelete,
}: GeneralTabProps) {
  return (
    <>
      {/* General Settings */}
      <section className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Settings className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">General</h2>
            <p className="text-xs text-muted-foreground">Workspace name and description</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="What's this workspace for?" disabled={!isAdmin} />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground capitalize">
              Plan: <span className="text-foreground font-medium">{workspace.plan}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Your role: <RoleBadge role={workspace.userRole} />
            </div>
          </div>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saving} className="bg-brand-600 text-white hover:bg-brand-500">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saveSuccess ? <Check className="mr-2 h-4 w-4" /> : null}
              {saveSuccess ? "Saved" : "Save changes"}
            </Button>
          )}
        </div>
      </section>

      {/* Default framework — admin-only setting that informs project create
          when the user doesn't pick a framework explicitly. */}
      <DefaultFrameworkSection workspaceId={workspace.id} isAdmin={isAdmin} />

      {/* Team Members */}
      <section className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
            <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {isAdmin && (
          <div className="mb-5 rounded-lg border border-border bg-secondary p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Invite by email</p>
            <div className="flex gap-2">
              <Input placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleInvite()} className="flex-1" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="bg-brand-600 text-white hover:bg-brand-500">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </Button>
            </div>
            {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
            <div className="mt-3 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerateLink} disabled={generatingLink}>
                {generatingLink ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                Generate invite link
              </Button>
              {inviteLink && (
                <button onClick={handleCopyLink} className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {linkCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {linkCopied ? "Copied!" : "Copy link"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-secondary text-xs text-foreground">
                  {(m.display_name ?? m.email)?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.display_name ?? m.email}
                  {m.user_id === user?.id && <span className="ml-1.5 text-[11px] text-muted-foreground">(you)</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== "owner" ? (
                  <select value={m.role} onChange={(e) => handleChangeRole(m.user_id, e.target.value)} disabled={changingRole === m.user_id} className="rounded border border-input bg-background px-2 py-1 text-[11px] text-foreground">
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {isAdmin && m.role !== "owner" && m.user_id !== user?.id && (
                  <button onClick={() => handleRemoveMember(m.user_id)} className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remove member">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending Invites */}
      {isAdmin && invites.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/20">
              <Mail className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Pending Invites</h2>
              <p className="text-xs text-muted-foreground">{invites.length} pending</p>
            </div>
          </div>
          <div className="space-y-1">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">Expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                </div>
                <RoleBadge role={inv.role} />
                <button onClick={() => handleRevokeInvite(inv.id)} className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Revoke invite">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Danger Zone */}
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
          <p className="mb-4 text-sm text-muted-foreground">
            Deleting this workspace will permanently remove all projects, files, and data. This cannot be undone.
          </p>
          <Button variant="outline" onClick={() => setDeleteOpen(true)} className="border-red-800 text-red-400 hover:bg-red-500/10 hover:text-red-300">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete workspace
          </Button>
        </section>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete workspace</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will permanently delete <strong className="text-foreground">{workspace.name}</strong> and all its data. Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder={workspace.name} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleteConfirm !== workspace.name || deleting} className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
