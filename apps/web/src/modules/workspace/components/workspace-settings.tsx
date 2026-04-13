"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Settings,
  Users,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

import { GeneralTab } from "./workspace-settings-general";
import { DangerTab } from "./workspace-settings-danger";

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
