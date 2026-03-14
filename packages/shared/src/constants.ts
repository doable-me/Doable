import type { WorkspacePlan } from "./types/index.js";

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
