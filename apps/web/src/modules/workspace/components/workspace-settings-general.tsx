"use client";

import { useState } from "react";
import {
  Save,
  Loader2,
  Hash,
  Calendar,
  Crown,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { Workspace } from "@doable/shared";

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

// ─── Info Item ──────────────────────────────────────────────

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

// ─── General Tab ────────────────────────────────────────────

export function GeneralTab({
  workspace,
  onUpdate,
  addToast,
}: {
  workspace: Workspace & {
    userRole: "owner" | "admin" | "member" | "viewer";
    memberCount: number;
  };
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
