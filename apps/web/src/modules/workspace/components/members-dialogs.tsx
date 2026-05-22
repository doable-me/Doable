"use client";

import { useState } from "react";
import {
  Mail,
  Users,
  Shield,
  UserPlus,
  Trash2,
  Loader2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceMemberData } from "../hooks/use-workspace-members";

const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: Shield,
  member: Users,
  viewer: Eye,
};

// ─── InviteDialog ───────────────────────────────────────────

export function InviteDialog({
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
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">Invite Member</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send an invite to join this workspace.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium">Email address</label>
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

          {error && <p className="text-sm text-destructive">{error}</p>}
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

// ─── RemoveConfirmDialog ────────────────────────────────────

export function RemoveConfirmDialog({
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
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
