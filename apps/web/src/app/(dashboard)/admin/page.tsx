"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformAdmin, type FeatureFlag } from "@/hooks/use-platform-admin";
import {
  Shield,
  ToggleLeft,
  ToggleRight,
  Users,
  Settings2,
  Crown,
  Loader2,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Role / Plan display helpers ────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

const ROLE_LABELS: Record<string, string> = {
  viewer: "Viewer",
  member: "Member",
  admin: "Admin",
  owner: "Owner",
};

const PLAN_OPTIONS = [
  { value: "", label: "All plans" },
  { value: "free", label: "Free+" },
  { value: "pro", label: "Pro+" },
  { value: "business", label: "Business+" },
  { value: "enterprise", label: "Enterprise only" },
];

const ROLE_OPTIONS = [
  { value: "", label: "Any role" },
  { value: "viewer", label: "Viewer+" },
  { value: "member", label: "Member+" },
  { value: "admin", label: "Admin+" },
  { value: "owner", label: "Owner only" },
];

// ─── Feature Row ────────────────────────────────────────────

function FeatureRow({
  feature,
  onToggle,
  onUpdate,
}: {
  feature: FeatureFlag;
  onToggle: (key: string, enabled: boolean) => void;
  onUpdate: (key: string, data: Partial<Pick<FeatureFlag, "enabled" | "min_plan" | "min_role">>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          onClick={() => onToggle(feature.feature_key, !feature.enabled)}
          className="shrink-0"
        >
          {feature.enabled ? (
            <ToggleRight className="h-6 w-6 text-brand-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-zinc-600" />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${feature.enabled ? "text-white" : "text-zinc-500"}`}>
              {feature.label}
            </span>
            <code className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
              {feature.feature_key}
            </code>
          </div>
          {feature.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{feature.description}</p>
          )}
        </div>

        {/* Restrictions badges */}
        <div className="flex items-center gap-2 shrink-0">
          {feature.min_plan && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-400 font-medium">
              {PLAN_LABELS[feature.min_plan]}+
            </span>
          )}
          {feature.min_role && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">
              {ROLE_LABELS[feature.min_role]}+
            </span>
          )}
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min Plan:</label>
            <select
              value={feature.min_plan ?? ""}
              onChange={(e) =>
                onUpdate(feature.feature_key, { min_plan: e.target.value || null })
              }
              className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
            >
              {PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Min Role:</label>
            <select
              value={feature.min_role ?? ""}
              onChange={(e) =>
                onUpdate(feature.feature_key, { min_role: e.target.value || null })
              }
              className="rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 px-2 py-1 outline-none focus:border-brand-500"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Page ─────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    isPlatformAdmin,
    features,
    users,
    loading,
    error,
    toggleFeature,
    updateFeature,
    toggleUserAdmin,
  } = usePlatformAdmin();

  const [activeTab, setActiveTab] = useState<"features" | "users">("features");

  // Redirect non-admins
  if (!loading && !isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-300">Access Denied</h2>
        <p className="text-sm text-zinc-500">Platform admin access required.</p>
        <Button
          onClick={() => router.push("/dashboard")}
          className="bg-brand-600 text-white hover:bg-brand-500"
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Shield className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">System Administration</h1>
            <p className="text-sm text-zinc-500">Manage platform features, users, and access controls</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-px">
        {[
          { key: "features" as const, label: "Feature Flags", icon: Settings2 },
          { key: "users" as const, label: "Users", icon: Users },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? "text-white border-b-2 border-brand-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Feature Flags Tab */}
      {activeTab === "features" && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-4">
            Toggle features on/off globally. Set minimum plan or workspace role requirements. Per-user overrides coming soon.
          </p>
          {features.map((f) => (
            <FeatureRow
              key={f.feature_key}
              feature={f}
              onToggle={toggleFeature}
              onUpdate={updateFeature}
            />
          ))}
          {features.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">
              No feature flags configured. Run the migration to seed defaults.
            </p>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 mb-4">
            Manage platform admin access. Platform admins can access this system admin panel and control all feature flags.
          </p>
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400">
                {(u.display_name ?? u.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {u.display_name ?? u.email.split("@")[0]}
                </p>
                <p className="text-xs text-zinc-500 truncate">{u.email}</p>
              </div>
              {u.is_platform_admin && (
                <Crown className="h-4 w-4 text-amber-400 shrink-0" />
              )}
              <button
                onClick={() => toggleUserAdmin(u.id, !u.is_platform_admin)}
                disabled={u.id === user?.id}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  u.is_platform_admin
                    ? "bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                }`}
              >
                {u.is_platform_admin ? "Revoke Admin" : "Make Admin"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
