"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Settings,
  Users,
  AlertTriangle,
  Save,
  Loader2,
  Check,
  X,
  Trash2,
  ArrowRightLeft,
  Hash,
  Calendar,
  Crown,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { WORKSPACE_ROLES, type Workspace } from "@doable/shared";
import { MembersPage } from "./members-page";

// ─── Types ──────────────────────────────────────────────────

interface WorkspaceSettingsProps {
  workspace: Workspace & {
    userRole: "owner" | "admin" | "member" | "viewer";
    memberCount: number;
  };
  currentUserId: string;
  onUpdate: (updated: Workspace) => void;
}

type Tab = "general" | "members" | "danger";

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

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
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-6", className)}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType; minRole: string }[] = [
  { id: "general", label: "General", icon: Settings, minRole: "admin" },
  { id: "members", label: "Members", icon: Users, minRole: "member" },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle, minRole: "owner" },
];

const ROLE_HIERARCHY: readonly string[] = [...WORKSPACE_ROLES].reverse();

function hasRole(userRole: string, requiredRole: string): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) <= ROLE_HIERARCHY.indexOf(requiredRole);
}

// ─── General Tab ────────────────────────────────────────────

function GeneralTab({
  workspace,
  onUpdate,
  addToast,
}: {
  workspace: WorkspaceSettingsProps["workspace"];
  onUpdate: (updated: Workspace) => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(
    workspace.description ?? ""
  );
  const [saving, setSaving] = useState(false);

  const hasChanges =
    name !== workspace.name ||
    description !== (workspace.description ?? "");

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const { data } = await apiFetch<{ data: Workspace }>(
        `/workspaces/${workspace.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
          }),
        }
      );
      onUpdate(data);
      addToast("success", "Workspace settings saved");
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Failed to save"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace Details">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="ws-name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="ws-description"
              className="text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="ws-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A brief description of your workspace"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              {hasChanges && "You have unsaved changes"}
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                hasChanges
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Workspace Information"
        description="Read-only metadata about your workspace."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoItem
            icon={Hash}
            label="Workspace ID"
            value={workspace.id}
            mono
          />
          <InfoItem
            icon={Hash}
            label="Slug"
            value={workspace.slug}
            mono
          />
          <InfoItem
            icon={Calendar}
            label="Created"
            value={new Date(workspace.createdAt).toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            )}
          />
          <InfoItem
            icon={Crown}
            label="Plan"
            value={workspace.plan}
            badge
          />
          <InfoItem
            icon={Users}
            label="Members"
            value={String(workspace.memberCount)}
          />
          <InfoItem
            icon={Shield}
            label="Your Role"
            value={workspace.userRole}
            badge
          />
        </div>
      </SectionCard>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge ? (
          <span className="mt-0.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
            {value}
          </span>
        ) : (
          <p
            className={cn(
              "mt-0.5 text-sm truncate",
              mono && "font-mono text-xs"
            )}
            title={value}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Danger Tab ─────────────────────────────────────────────

function DangerTab({
  workspace,
  addToast,
}: {
  workspace: WorkspaceSettingsProps["workspace"];
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");

  const handleDelete = async () => {
    if (deleteConfirm !== workspace.name) return;
    setDeleting(true);
    try {
      await apiFetch(`/workspaces/${workspace.id}`, {
        method: "DELETE",
      });
      addToast("success", "Workspace deleted successfully");
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    } catch (err) {
      addToast(
        "error",
        err instanceof Error
          ? err.message
          : "Failed to delete workspace"
      );
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Transfer Ownership */}
      <div className="rounded-xl border border-amber-200 p-6 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <ArrowRightLeft className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">
              Transfer Ownership
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Transfer ownership of this workspace to another member.
              You will be demoted to admin.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="transfer-email"
                  className="text-sm font-medium"
                >
                  New owner email
                </label>
                <input
                  id="transfer-email"
                  type="email"
                  value={transferEmail}
                  onChange={(e) => setTransferEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                disabled={
                  !transferEmail.trim() || !transferEmail.includes("@")
                }
                onClick={() =>
                  addToast(
                    "success",
                    "Transfer request sent."
                  )
                }
                className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer Ownership
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Workspace */}
      <div className="rounded-xl border border-destructive/30 p-6">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-destructive">
              Delete Workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete this workspace, all its projects,
              files, and member associations. This action cannot be
              undone.
            </p>

            {!showDeleteDialog ? (
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4" />
                Delete This Workspace
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">
                  Are you absolutely sure?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type{" "}
                  <span className="font-mono text-destructive">
                    {workspace.name}
                  </span>{" "}
                  to confirm.
                </p>

                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={workspace.name}
                    className="flex h-10 w-full rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleDelete()}
                      disabled={
                        deleteConfirm !== workspace.name || deleting
                      }
                      className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {deleting
                        ? "Deleting..."
                        : "I understand, delete this workspace"}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteDialog(false);
                        setDeleteConfirm("");
                      }}
                      className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function WorkspaceSettings({
  workspace,
  currentUserId,
  onUpdate,
}: WorkspaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const { toasts, addToast, dismissToast } = useToasts();

  const visibleTabs = TABS.filter((tab) =>
    hasRole(workspace.userRole, tab.minRole)
  );

  // If the user doesn't have access to the current tab, fall back
  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "members");
    }
  }, [workspace.userRole]);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      {activeTab === "general" && (
        <GeneralTab
          workspace={workspace}
          onUpdate={onUpdate}
          addToast={addToast}
        />
      )}
      {activeTab === "members" && (
        <MembersPage
          workspaceId={workspace.id}
          currentUserId={currentUserId}
          currentUserRole={workspace.userRole}
        />
      )}
      {activeTab === "danger" && (
        <DangerTab workspace={workspace} addToast={addToast} />
      )}
    </div>
  );
}
