"use client";

import { useState } from "react";
import {
  Users,
  Mail,
  Shield,
  Crown,
  Eye,
  Trash2,
  Loader2,
  Copy,
  Check,
  X,
  Link2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_ROLES,
  ROLE_LABELS as SHARED_ROLE_LABELS,
  ROLE_META,
} from "@doable/shared";
import type { WorkspaceMemberData, WorkspaceInviteData } from "../hooks/use-workspace-members";

// ─── Role Helpers ───────────────────────────────────────────

const ROLE_LABELS = SHARED_ROLE_LABELS;

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  owner: Crown,
  admin: Shield,
  member: Users,
  viewer: Eye,
};

const ROLE_COLORS: Record<string, string> = Object.fromEntries(
  WORKSPACE_ROLES.map((r) => [r, ROLE_META[r].color])
);

const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;

// ─── MemberRow ──────────────────────────────────────────────

export function MemberRow({
  member,
  currentUserId,
  currentUserRole,
  onUpdateRole,
  onRemove,
  addToast,
}: {
  member: WorkspaceMemberData;
  currentUserId: string;
  currentUserRole: string;
  onUpdateRole: (userId: string, role: string) => Promise<void>;
  onRemove: (member: WorkspaceMemberData) => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);

  const displayName = member.display_name || member.email.split("@")[0] || member.email;
  const isCurrentUser = member.user_id === currentUserId;
  const canChangeRole = currentUserRole === "owner" && !isCurrentUser && member.role !== "owner";
  const canRemove =
    !isCurrentUser &&
    member.role !== "owner" &&
    (currentUserRole === "owner" || (currentUserRole === "admin" && member.role !== "admin"));

  const RoleIcon = ROLE_ICONS[member.role] ?? Users;

  const handleRoleChange = async (newRole: string) => {
    setUpdatingRole(true);
    setRoleOpen(false);
    try {
      await onUpdateRole(member.user_id, newRole);
      addToast("success", `Updated ${displayName}'s role to ${ROLE_LABELS[newRole]}`);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
        {(member.display_name ?? member.email).charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{displayName}</p>
          {isCurrentUser && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">You</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {new Date(member.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>

      <div className="relative">
        {canChangeRole ? (
          <button
            onClick={() => setRoleOpen(!roleOpen)}
            disabled={updatingRole}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer hover:opacity-80",
              ROLE_COLORS[member.role]
            )}
          >
            {updatingRole ? <Loader2 className="h-3 w-3 animate-spin" /> : <RoleIcon className="h-3 w-3" />}
            {ROLE_LABELS[member.role]}
          </button>
        ) : (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", ROLE_COLORS[member.role])}>
            <RoleIcon className="h-3 w-3" />
            {ROLE_LABELS[member.role]}
          </span>
        )}

        {roleOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border bg-background py-1 shadow-lg">
              {ASSIGNABLE_ROLES.map((r) => {
                const Icon = ROLE_ICONS[r] ?? Users;
                return (
                  <button
                    key={r}
                    onClick={() => void handleRoleChange(r)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent",
                      member.role === r && "bg-accent/50 font-medium"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {canRemove ? (
        <button
          onClick={() => onRemove(member)}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Remove member"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-10" />
      )}
    </div>
  );
}

// ─── InviteRow ──────────────────────────────────────────────

export function InviteRow({
  invite,
  onRevoke,
  addToast,
}: {
  invite: WorkspaceInviteData;
  onRevoke: (inviteId: string) => Promise<void>;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await onRevoke(invite.id);
      addToast("success", `Revoked invite for ${invite.email}`);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to revoke invite");
      setRevoking(false);
    }
  };

  const isLinkInvite = invite.email === "__invite_link__";

  return (
    <div className="flex items-center gap-4 rounded-lg border border-dashed p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        {isLinkInvite ? <Link2 className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{isLinkInvite ? "Invite link" : invite.email}</p>
        <p className="text-xs text-muted-foreground">
          Expires {new Date(invite.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", ROLE_COLORS[invite.role] ?? ROLE_COLORS.member)}>
        {ROLE_LABELS[invite.role] ?? invite.role}
      </span>
      <button
        onClick={() => void handleRevoke()}
        disabled={revoking}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        title="Revoke invite"
      >
        {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── InviteLinkSection ──────────────────────────────────────

export function InviteLinkSection({
  onGenerate,
  addToast,
}: {
  onGenerate: (role: string) => Promise<string>;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [linkRole, setLinkRole] = useState<string>("member");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const link = await onGenerate(linkRole);
      setGeneratedLink(link);
      addToast("success", "Invite link generated");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("error", "Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {ASSIGNABLE_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => { setLinkRole(r); setGeneratedLink(null); }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                linkRole === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
          Generate Link
        </button>
      </div>

      {generatedLink && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
          <input
            type="text"
            readOnly
            value={generatedLink}
            className="flex-1 bg-transparent text-xs font-mono text-muted-foreground outline-none"
          />
          <button
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            {copied ? <><Check className="h-3 w-3 text-green-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      )}
    </div>
  );
}
