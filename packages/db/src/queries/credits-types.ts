// ─── Types ───────────────────────────────────────────────────

export interface CreditBalanceRow {
  id: string;
  user_id: string;
  workspace_id: string;
  daily_credits: number;
  daily_credits_used: number;
  daily_reset_at: Date;
  monthly_credits: number;
  monthly_credits_used: number;
  monthly_reset_at: Date;
  rollover_credits: number;
  plan_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreditUsageLogRow {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string | null;
  credits_consumed: number;
  action_type: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string | null;
  created_at: Date;
}

export interface CreditBalanceSummary {
  daily_remaining: number;
  daily_total: number;
  monthly_remaining: number;
  monthly_total: number;
  rollover_credits: number;
  total_available: number;
  daily_reset_at: Date;
  monthly_reset_at: Date;
  plan_type: string;
}

export interface ConsumeCreditsMetadata {
  projectId?: string;
  actionType: string;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
}