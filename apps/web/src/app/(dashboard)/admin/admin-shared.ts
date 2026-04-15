import {
  WORKSPACE_PLANS,
  WORKSPACE_ROLES,
  PLAN_META,
  ROLE_META,
  PLAN_LABELS,
  ROLE_LABELS,
} from "@doable/shared";

// ─── Role / Plan display helpers ────────────────────────────

export const PLAN_OPTIONS = [
  { value: "", label: "All plans" },
  ...WORKSPACE_PLANS.map((p, i) => ({
    value: p,
    label: i === WORKSPACE_PLANS.length - 1 ? `${PLAN_LABELS[p]} only` : `${PLAN_LABELS[p]}+`,
  })),
];

export const ROLE_OPTIONS = [
  { value: "", label: "Any role" },
  ...WORKSPACE_ROLES.map((r, i) => ({
    value: r,
    label: i === WORKSPACE_ROLES.length - 1 ? `${ROLE_LABELS[r]} only` : `${ROLE_LABELS[r]}+`,
  })),
];

// ─── AI Allocation types ────────────────────────────────────

export interface UserAiAllocation {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_platform_admin: boolean;
  platform_role: string | null;
  role: string | null;
  workspace_plan: string | null;
  source: "copilot" | "custom" | null;
  copilot_account_id: string | null;
  copilot_account_label: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_label: string | null;
  provider_type: string | null;
  provider_model: string | null;
  /** @deprecated use copilot_model / provider_model */
  model: string | null;
  preference_updated_at: string | null;
  // Credit fields
  daily_credits: number | null;
  daily_credits_used: number | null;
  monthly_credits: number | null;
  monthly_credits_used: number | null;
  rollover_credits: number | null;
  // Workspace AI settings (for effective model calculation)
  enforce_ai: boolean | null;
  enforced_model: string | null;
  default_source: "copilot" | "custom" | null;
  default_copilot_model: string | null;
  default_provider_model: string | null;
  ws_default_copilot_account_id: string | null;
  ws_default_provider_id: string | null;
}

// Helpers shared by AiStatusBadge and UserRow
export function rowActiveSide(row: UserAiAllocation): "copilot" | "custom" | null {
  if (row.source) return row.source;
  if (row.provider_id) return "custom";
  if (row.copilot_account_id) return "copilot";
  return null;
}

export function rowActiveModel(row: UserAiAllocation): string | null {
  const side = rowActiveSide(row);
  if (side === "custom") return row.provider_model ?? row.model;
  if (side === "copilot") return row.copilot_model ?? row.model;
  return null;
}

export function rowHasAllocation(row: UserAiAllocation): boolean {
  const side = rowActiveSide(row);
  if (side === "custom") return !!row.provider_id;
  if (side === "copilot") return !!row.copilot_account_id;
  return false;
}

/** Compute the effective model considering inheritance: enforcement → user override → workspace defaults */
export function getEffectiveModel(row: UserAiAllocation): { model: string | null; source: "enforced" | "user" | "workspace" | "none" } {
  // 1. Enforcement overrides everything
  if (row.enforce_ai && row.enforced_model) {
    return { model: row.enforced_model, source: "enforced" };
  }
  // 2. User override
  const userModel = rowActiveModel(row);
  if (userModel) {
    return { model: userModel, source: "user" };
  }
  // 3. Workspace defaults
  const wsSrc = row.default_source;
  const wsModel = wsSrc === "custom" ? row.default_provider_model : row.default_copilot_model;
  if (wsModel) {
    return { model: wsModel, source: "workspace" };
  }
  return { model: null, source: "none" };
}

/** Get credit summary for display */
export function getCreditSummary(row: UserAiAllocation): {
  dailyUsed: number; dailyTotal: number; dailyRemaining: number;
  monthlyUsed: number; monthlyTotal: number; monthlyRemaining: number;
  rollover: number; totalAvailable: number;
} {
  const dailyTotal = row.daily_credits ?? 0;
  const dailyUsed = row.daily_credits_used ?? 0;
  const monthlyTotal = row.monthly_credits ?? 0;
  const monthlyUsed = row.monthly_credits_used ?? 0;
  const rollover = row.rollover_credits ?? 0;
  const dailyRemaining = Math.max(0, dailyTotal - dailyUsed);
  const monthlyRemaining = Math.max(0, monthlyTotal - monthlyUsed);
  return {
    dailyUsed, dailyTotal, dailyRemaining,
    monthlyUsed, monthlyTotal, monthlyRemaining,
    rollover, totalAvailable: dailyRemaining + monthlyRemaining + rollover,
  };
}

// ─── Role / Plan color helpers ──────────────────────────────

export const ROLE_COLORS: Record<string, string> =
  Object.fromEntries(WORKSPACE_ROLES.map((r) => [r, ROLE_META[r].color]));

export const PLAN_COLORS: Record<string, string> =
  Object.fromEntries(WORKSPACE_PLANS.map((p) => [p, PLAN_META[p].color]));
