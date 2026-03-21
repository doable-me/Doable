"use client";

import { useState, useCallback } from "react";
import {
  Users,
  Mail,
  Shield,
  Crown,
  Eye,
  UserPlus,
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
  useWorkspaceMembers,
  type WorkspaceMemberData,
  type WorkspaceInviteData,
} from "../hooks/use-workspace-members";

// ─── Types ──────────────────────────────────────────────────

interface MembersPageProps {
  workspaceId: string;
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member" | "viewer";
}

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

// ─── Role Helpers ───────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  owner: Crown,
  admin: Shield,
  member: Users,
  viewer: Eye,
};

const ROLE_COLORS: Record<string, string> = {
  owner:
    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  admin:
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  member:
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  viewer:
    "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;

// ─── Toast System ───────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-bottom-2",
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          )}
        >
          {toast.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <X className="h-4 w-4 shrink-0" />
          )}
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-2 shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (type: "success" | "error", message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// ─── Section Card ───────────────────────────────────────────

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────

function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  size?: "sm" | "md";
}) {
  const sizeClasses = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn("rounded-full object-cover", sizeClasses)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        sizeClasses
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Invite Dialog ──────────────────────────────────────────

function InviteDialog({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onInvite(email.trim(), role);
      setEmail("");
      setRole("member");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invite"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">Invite Member</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send an invite to join this workspace.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="invite-email"
              className="text-sm font-medium"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <div className="flex gap-2">
              {ASSIGNABLE_ROLES.map((r) => {
                const Icon = ROLE_ICONS[r] ?? Users;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                      role === r
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !email.trim() || !email.includes("@")}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {submitting ? "Sending..." : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Remove Confirmation Dialog ─────────────────────────────

function RemoveConfirmDialog({
  member,
  onClose,
  onConfirm,
}: {
  member: WorkspaceMemberData;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setRemoving(false);
    }
  };

  const displayName =
    member.display_name || member.email.split("@")[0] || member.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Remove Member</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to remove{" "}
          <strong className="text-foreground">{displayName}</strong>{" "}
          from this workspace? They will lose access to all projects.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleRemove()}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {removing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Member Row ─────────────────────────────────────────────

function MemberRow({
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

  const displayName =
    member.display_name || member.email.split("@")[0] || member.email;
  const isCurrentUser = member.user_id === currentUserId;
  const canChangeRole = currentUserRole === "owner" && !isCurrentUser && member.role !== "owner";
  const canRemove =
    !isCurrentUser &&
    member.role !== "owner" &&
    (currentUserRole === "owner" ||
      (currentUserRole === "admin" && member.role !== "admin"));

  const RoleIcon = ROLE_ICONS[member.role] ?? Users;

  const handleRoleChange = async (newRole: string) => {
    setUpdatingRole(true);
    setRoleOpen(false);
    try {
      await onUpdateRole(member.user_id, newRole);
      addToast("success", `Updated ${displayName}'s role to ${ROLE_LABELS[newRole]}`);
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Failed to update role"
      );
    } finally {
      setUpdatingRole(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/30">
      <MemberAvatar
        name={displayName ?? "User"}
        avatarUrl={member.avatar_url}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{displayName}</p>
          {isCurrentUser && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              You
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {member.email}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {new Date(member.joined_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>

      {/* Role badge / dropdown */}
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
            {updatingRole ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RoleIcon className="h-3 w-3" />
            )}
            {ROLE_LABELS[member.role]}
          </button>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              ROLE_COLORS[member.role]
            )}
          >
            <RoleIcon className="h-3 w-3" />
            {ROLE_LABELS[member.role]}
          </span>
        )}

        {roleOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setRoleOpen(false)}
            />
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

      {/* Remove button */}
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

// ─── Invite Row ─────────────────────────────────────────────

function InviteRow({
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
      addToast(
        "error",
        err instanceof Error ? err.message : "Failed to revoke invite"
      );
      setRevoking(false);
    }
  };

  const isLinkInvite = invite.email === "__invite_link__";

  return (
    <div className="flex items-center gap-4 rounded-lg border border-dashed p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        {isLinkInvite ? (
          <Link2 className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Mail className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {isLinkInvite ? "Invite link" : invite.email}
        </p>
        <p className="text-xs text-muted-foreground">
          Expires{" "}
          {new Date(invite.expires_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          ROLE_COLORS[invite.role] ?? ROLE_COLORS.member
        )}
      >
        {ROLE_LABELS[invite.role] ?? invite.role}
      </span>

      <button
        onClick={() => void handleRevoke()}
        disabled={revoking}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        title="Revoke invite"
      >
        {revoking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

// ─── Invite Link Section ────────────────────────────────────

function InviteLinkSection({
  onGenerate,
  addToast,
}: {
  onGenerate: (role: string) => Promise<string>;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [linkRole, setLinkRole] = useState<string>("member");
  const [generatedLink, setGeneratedLink] = useState<string | null>(
    null
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const link = await onGenerate(linkRole);
      setGeneratedLink(link);
      addToast("success", "Invite link generated");
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Failed to generate link"
      );
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
              onClick={() => {
                setLinkRole(r);
                setGeneratedLink(null);
              }}
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
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Link2 className="h-3 w-3" />
          )}
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
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function MembersLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function MembersPage({
  workspaceId,
  currentUserId,
  currentUserRole,
}: MembersPageProps) {
  const {
    members,
    invites,
    loading,
    error,
    inviteMember,
    removeMember,
    updateRole,
    revokeInvite,
    generateInviteLink,
  } = useWorkspaceMembers(workspaceId);

  const { toasts, addToast, dismissToast } = useToasts();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [removingMember, setRemovingMember] =
    useState<WorkspaceMemberData | null>(null);

  const isAdmin =
    currentUserRole === "owner" || currentUserRole === "admin";

  if (loading) {
    return <MembersLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">Failed to load members</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Members Section */}
      <SectionCard
        title={`Members (${members.length})`}
        description="People who have access to this workspace and its projects."
        action={
          isAdmin ? (
            <button
              onClick={() => setInviteDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Invite
            </button>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onUpdateRole={updateRole}
              onRemove={(m) => setRemovingMember(m)}
              addToast={addToast}
            />
          ))}
        </div>
      </SectionCard>

      {/* Pending Invites */}
      {isAdmin && invites.length > 0 && (
        <SectionCard
          title={`Pending Invites (${invites.length})`}
          description="Invites that have been sent but not yet accepted."
        >
          <div className="space-y-2">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                onRevoke={revokeInvite}
                addToast={addToast}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Invite Link */}
      {isAdmin && (
        <SectionCard
          title="Invite Link"
          description="Generate a shareable link to invite people to this workspace."
        >
          <InviteLinkSection
            onGenerate={generateInviteLink}
            addToast={addToast}
          />
        </SectionCard>
      )}

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onInvite={async (email, role) => {
          await inviteMember(email, role);
          addToast("success", `Invite sent to ${email}`);
        }}
      />

      {/* Remove Confirmation Dialog */}
      {removingMember && (
        <RemoveConfirmDialog
          member={removingMember}
          onClose={() => setRemovingMember(null)}
          onConfirm={async () => {
            const name =
              removingMember.display_name ||
              removingMember.email.split("@")[0];
            await removeMember(removingMember.user_id);
            addToast("success", `${name} has been removed`);
          }}
        />
      )}
    </div>
  );
}
