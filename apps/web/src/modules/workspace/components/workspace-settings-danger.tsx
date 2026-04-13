"use client";

import { useState } from "react";
import {
  Loader2,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── Danger Tab ─────────────────────────────────────────────

export function DangerTab({
  workspace,
  addToast,
}: {
  workspace: { id: string; name: string };
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
