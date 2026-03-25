import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLATFORM_ADMIN_ROLES,
  type WorkspacePlan,
  type WorkspaceRole,
} from "./types/index";

// ─── Plan & Role Metadata ──────────────────────────────────
// Add a new entry here when adding a plan or role.

export interface PlanMeta { label: string; color: string; }
export interface RoleMeta { label: string; color: string; }

export const PLAN_META: Record<WorkspacePlan, PlanMeta> = {
  free:       { label: "Free",       color: "text-zinc-400" },
  pro:        { label: "Pro",        color: "text-brand-400" },
  business:   { label: "Business",   color: "text-purple-400" },
  enterprise: { label: "Enterprise", color: "text-amber-400" },
};

export const ROLE_META: Record<WorkspaceRole, RoleMeta> = {
  viewer: { label: "Viewer", color: "text-zinc-400" },
  member: { label: "Member", color: "text-zinc-300" },
  admin:  { label: "Admin",  color: "text-amber-400" },
  owner:  { label: "Owner",  color: "text-red-400" },
};

// Derived helpers — consuming code should use these, never raw strings.
export const PLAN_LABELS: Record<string, string> =
  Object.fromEntries(WORKSPACE_PLANS.map((p) => [p, PLAN_META[p].label]));

export const ROLE_LABELS: Record<string, string> =
  Object.fromEntries(WORKSPACE_ROLES.map((r) => [r, ROLE_META[r].label]));

/** Check if a role value grants platform admin access */
export function isPlatformAdminRole(role: string): boolean {
  return (PLATFORM_ADMIN_ROLES as readonly string[]).includes(role);
}

/** Compare two roles/plans by hierarchy index. Returns negative if a < b. */
export function compareRoles(a: string, b: string): number {
  return (WORKSPACE_ROLES as readonly string[]).indexOf(a) - (WORKSPACE_ROLES as readonly string[]).indexOf(b);
}
export function comparePlans(a: string, b: string): number {
  return (WORKSPACE_PLANS as readonly string[]).indexOf(a) - (WORKSPACE_PLANS as readonly string[]).indexOf(b);
}

// ─── Plan Limits ────────────────────────────────────────────
export interface PlanLimits {
  maxProjects: number;
  maxMembers: number;
  dailyCredits: number;
  monthlyCredits: number;
  maxFileSize: number; // bytes
  customDomains: boolean;
  analytics: boolean;
  prioritySupport: boolean;
}

export const PLAN_LIMITS: Record<WorkspacePlan, PlanLimits> = {
  free: {
    maxProjects: 3,
    maxMembers: 1,
    dailyCredits: 5,
    monthlyCredits: 0,
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    customDomains: false,
    analytics: false,
    prioritySupport: false,
  },
  pro: {
    maxProjects: 25,
    maxMembers: 5,
    dailyCredits: 50,
    monthlyCredits: 500,
    maxFileSize: 25 * 1024 * 1024, // 25 MB
    customDomains: true,
    analytics: true,
    prioritySupport: false,
  },
  business: {
    maxProjects: 100,
    maxMembers: 25,
    dailyCredits: 200,
    monthlyCredits: 3000,
    maxFileSize: 100 * 1024 * 1024, // 100 MB
    customDomains: true,
    analytics: true,
    prioritySupport: true,
  },
  enterprise: {
    maxProjects: Infinity,
    maxMembers: Infinity,
    dailyCredits: Infinity,
    monthlyCredits: Infinity,
    maxFileSize: 500 * 1024 * 1024, // 500 MB
    customDomains: true,
    analytics: true,
    prioritySupport: true,
  },
};

// ─── AI Constants ───────────────────────────────────────────
export const AI_MAX_CONTEXT_MESSAGES = 50;
export const AI_MAX_MESSAGE_LENGTH = 32_000;
export const AI_SUPPORTED_MODELS = ["claude-sonnet-4-20250514", "gpt-4o"] as const;

// ─── Pagination ─────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ─── Slugs ──────────────────────────────────────────────────
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;

// ─── Sessions ───────────────────────────────────────────────
export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_EXPIRES_IN = "7d";
