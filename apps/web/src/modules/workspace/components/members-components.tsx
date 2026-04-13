"use client";

import { useState, useCallback } from "react";
import {
  Users,
  Shield,
  Crown,
  Eye,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_ROLES,
  ROLE_LABELS as SHARED_ROLE_LABELS,
  ROLE_META,
} from "@doable/shared";

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

// ─── Toast System ───────────────────────────────────────────

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

export function ToastContainer({
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
          <button onClick={() => onDismiss(toast.id)} className="ml-2 shrink-0 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// ─── SectionCard ────────────────────────────────────────────

export function SectionCard({
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
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── MemberAvatar ───────────────────────────────────────────

export function MemberAvatar({
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
    return <img src={avatarUrl} alt={name} className={cn("rounded-full object-cover", sizeClasses)} />;
  }

  return (
    <div className={cn("flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", sizeClasses)}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── MemberRow ──────────────────────────────────────────────

export { MemberRow } from "./members-rows";

// ─── InviteRow ──────────────────────────────────────────────

export { InviteRow } from "./members-rows";

// ─── InviteLinkSection ──────────────────────────────────────

export { InviteLinkSection } from "./members-rows";

// ─── MembersLoadingSkeleton ─────────────────────────────────

export function MembersLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
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
