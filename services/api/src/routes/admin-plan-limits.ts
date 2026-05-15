import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { PLAN_LIMITS, type PlanLimits } from "@doable/shared";
import type { WorkspacePlan } from "@doable/shared";

export const adminPlanLimitsRoutes = new Hono<AuthEnv>({ strict: false });

adminPlanLimitsRoutes.use("*", authMiddleware);
adminPlanLimitsRoutes.use("*", platformAdminMiddleware);

const PLANS = ["free", "pro", "business", "enterprise"] as const;

// ─── GET /admin/plan-limits — all plan limits (merged with defaults) ─────
adminPlanLimitsRoutes.get("/plan-limits", async (c) => {
  try {
    const rows = await sql<{
      plan: string;
      max_projects: number | null;
      max_members: number | null;
      daily_credits: number | null;
      monthly_credits: number | null;
      max_file_size: number | null;
      custom_domains: boolean | null;
      analytics: boolean | null;
      priority_support: boolean | null;
      updated_at: string | null;
    }[]>`SELECT * FROM platform_plan_limits ORDER BY
      CASE plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'business' THEN 2 WHEN 'enterprise' THEN 3 END`;

    const result = PLANS.map((plan) => {
      const row = rows.find((r) => r.plan === plan);
      const defaults = PLAN_LIMITS[plan];
      const safeNum = (v: number | bigint | null | undefined) => {
        if (v == null) return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
      };
      return {
        plan,
        maxProjects: safeNum(row?.max_projects ?? defaults.maxProjects),
        maxMembers: safeNum(row?.max_members ?? defaults.maxMembers),
        dailyCredits: safeNum(row?.daily_credits ?? defaults.dailyCredits),
        monthlyCredits: safeNum(row?.monthly_credits ?? defaults.monthlyCredits),
        maxFileSize: safeNum(row?.max_file_size ?? defaults.maxFileSize),
        customDomains: row?.custom_domains ?? defaults.customDomains,
        analytics: row?.analytics ?? defaults.analytics,
        prioritySupport: row?.priority_support ?? defaults.prioritySupport,
        isOverridden: row != null && (
          row.max_projects != null || row.max_members != null ||
          row.daily_credits != null || row.monthly_credits != null ||
          row.max_file_size != null || row.custom_domains != null ||
          row.analytics != null || row.priority_support != null
        ),
        updatedAt: row?.updated_at ?? null,
      };
    });

    // Serialize defaults with Infinity → null for JSON safety
    const safeDefaults: Record<string, any> = {};
    for (const p of PLANS) {
      const d = PLAN_LIMITS[p];
      safeDefaults[p] = {
        maxProjects: isFinite(d.maxProjects) ? d.maxProjects : null,
        maxMembers: isFinite(d.maxMembers) ? d.maxMembers : null,
        dailyCredits: isFinite(d.dailyCredits) ? d.dailyCredits : null,
        monthlyCredits: isFinite(d.monthlyCredits) ? d.monthlyCredits : null,
        maxFileSize: isFinite(d.maxFileSize) ? d.maxFileSize : null,
        customDomains: d.customDomains,
        analytics: d.analytics,
        prioritySupport: d.prioritySupport,
      };
    }

    return c.json({ data: result, defaults: safeDefaults });
  } catch (err) {
    console.error("[admin/plan-limits] Error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// ─── PUT /admin/plan-limits/:plan — update a plan's limits ─────
const updateSchema = z.object({
  maxProjects: z.number().int().min(1).max(100000).nullable().optional(),
  maxMembers: z.number().int().min(1).max(100000).nullable().optional(),
  dailyCredits: z.number().int().min(0).max(1000000).nullable().optional(),
  monthlyCredits: z.number().int().min(0).max(10000000).nullable().optional(),
  maxFileSize: z.number().int().min(1048576).max(1073741824).nullable().optional(), // 1MB - 1GB
  customDomains: z.boolean().nullable().optional(),
  analytics: z.boolean().nullable().optional(),
  prioritySupport: z.boolean().nullable().optional(),
});

adminPlanLimitsRoutes.put("/plan-limits/:plan", async (c) => {
  const plan = c.req.param("plan");
  if (!PLANS.includes(plan as any)) {
    return c.json({ error: "Invalid plan" }, 400);
  }

  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const d = parsed.data;
  const userId = c.get("userId");

  try {
    await sql`
      INSERT INTO platform_plan_limits (plan, max_projects, max_members, daily_credits, monthly_credits, max_file_size, custom_domains, analytics, priority_support, updated_by, updated_at)
      VALUES (${plan}, ${d.maxProjects ?? null}, ${d.maxMembers ?? null}, ${d.dailyCredits ?? null}, ${d.monthlyCredits ?? null}, ${d.maxFileSize ?? null}, ${d.customDomains ?? null}, ${d.analytics ?? null}, ${d.prioritySupport ?? null}, ${userId}, now())
      ON CONFLICT (plan) DO UPDATE SET
        max_projects = ${d.maxProjects ?? null},
        max_members = ${d.maxMembers ?? null},
        daily_credits = ${d.dailyCredits ?? null},
        monthly_credits = ${d.monthlyCredits ?? null},
        max_file_size = ${d.maxFileSize ?? null},
        custom_domains = ${d.customDomains ?? null},
        analytics = ${d.analytics ?? null},
        priority_support = ${d.prioritySupport ?? null},
        updated_by = ${userId},
        updated_at = now()
    `;

    // Invalidate in-memory cache
    planLimitsCache = null;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[admin/plan-limits] Update error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// ─── PUT /admin/plan-limits/:plan/reset — reset to defaults ─────
adminPlanLimitsRoutes.put("/plan-limits/:plan/reset", async (c) => {
  const plan = c.req.param("plan");
  if (!PLANS.includes(plan as any)) {
    return c.json({ error: "Invalid plan" }, 400);
  }

  try {
    await sql`
      UPDATE platform_plan_limits
      SET max_projects = NULL, max_members = NULL, daily_credits = NULL,
          monthly_credits = NULL, max_file_size = NULL, custom_domains = NULL,
          analytics = NULL, priority_support = NULL, updated_at = now()
      WHERE plan = ${plan}
    `;
    planLimitsCache = null;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[admin/plan-limits] Reset error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// ─── Shared cache for use in other routes ─────────────────────────

let planLimitsCache: Record<string, PlanLimits> | null = null;
let planLimitsCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get effective plan limits (DB overrides merged with hardcoded defaults).
 * Cached for 1 minute. Used by other route handlers.
 */
export async function getEffectivePlanLimits(): Promise<Record<WorkspacePlan, PlanLimits>> {
  if (planLimitsCache && Date.now() - planLimitsCacheTime < CACHE_TTL) {
    return planLimitsCache as Record<WorkspacePlan, PlanLimits>;
  }

  try {
    const rows = await sql<{
      plan: string;
      max_projects: number | null;
      max_members: number | null;
      daily_credits: number | null;
      monthly_credits: number | null;
      max_file_size: number | null;
      custom_domains: boolean | null;
      analytics: boolean | null;
      priority_support: boolean | null;
    }[]>`SELECT * FROM platform_plan_limits`;

    const result: Record<string, PlanLimits> = {};
    for (const plan of PLANS) {
      const row = rows.find((r) => r.plan === plan);
      const defaults = PLAN_LIMITS[plan];
      result[plan] = {
        maxProjects: row?.max_projects ?? defaults.maxProjects,
        maxMembers: row?.max_members ?? defaults.maxMembers,
        dailyCredits: row?.daily_credits ?? defaults.dailyCredits,
        monthlyCredits: row?.monthly_credits ?? defaults.monthlyCredits,
        maxFileSize: row?.max_file_size ?? defaults.maxFileSize,
        customDomains: row?.custom_domains ?? defaults.customDomains,
        analytics: row?.analytics ?? defaults.analytics,
        prioritySupport: row?.priority_support ?? defaults.prioritySupport,
      };
    }

    planLimitsCache = result;
    planLimitsCacheTime = Date.now();
    return result as Record<WorkspacePlan, PlanLimits>;
  } catch (err) {
    console.error("[getEffectivePlanLimits] DB error, falling back to defaults:", err);
    return PLAN_LIMITS;
  }
}
