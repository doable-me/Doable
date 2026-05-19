import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { billingQueries } from "@doable/db/queries/billing";
import { creditQueries } from "@doable/db/queries/credits";
import { workspaceQueries } from "@doable/db/queries/workspaces";
import {
  PLANS,
  getPlanById,
  createCheckoutSession,
  createPortalSession,
  createCustomer,
  createTopUpSession,
  constructWebhookEvent,
  cancelSubscription,
} from "../lib/stripe.js";
import { PLAN_LIMITS } from "@doable/shared";

const billing = billingQueries(sql);
const creditsDb = creditQueries(sql);
const workspaces = workspaceQueries(sql);

export const billingRoutes = new Hono<AuthEnv>({ strict: false });

/**
 * Verify the caller is a member of the target workspace. Used by every
 * billing route that accepts a `workspaceId` parameter — otherwise any
 * authenticated user could probe/manipulate billing state for any workspace
 * by guessing/enumerating workspaceId. See BUG-BILLING-002 and the wider
 * 2026-05-15 audit that found 6+ other endpoints missing this check.
 */
async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  return !!row;
}

// ─── Public: Plans ─────────────────────────────────────────
billingRoutes.get("/plans", (c) => {
  return c.json({
    data: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      priceCents: p.priceMonthly != null ? Math.round(p.priceMonthly * 100) : null,
      contactSales: p.contactSales ?? false,
      features: p.features,
      dailyCredits: p.dailyCredits,
      monthlyCredits: p.monthlyCredits,
      maxProjects: p.maxProjects === Infinity ? null : p.maxProjects,
      maxMembers: p.maxMembers === Infinity ? null : p.maxMembers,
      storageMb: p.id === "free" ? 512 : p.id === "pro" ? 25600 : p.id === "business" ? 102400 : null,
    })),
  });
});

// ─── Webhook (no auth, raw body) ───────────────────────────
billingRoutes.post("/webhook", async (c) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json({ received: true, mode: "bypass", skipped: true });
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event;
  try {
    const body = await c.req.text();
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    console.error("[Stripe Webhook] Verification failed:", err);
    return c.json({ error: "Webhook verification failed" }, 400);
  }

  try {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId) break;

      // Handle top-up
      if (session.metadata?.type === "top_up") {
        const credits = parseInt(session.metadata.credits ?? "0", 10);
        if (credits > 0) {
          await creditsDb.addRolloverCredits(workspaceId, credits);
        }
        break;
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) break;

      const firstItem = sub.items.data[0];
      const priceId = firstItem?.price.id;
      const plan = PLANS.find(
        (p) =>
          p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
      );

      await billing.upsertSubscription({
        workspaceId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan: plan?.id ?? "free",
        status: sub.status === "active" ? "active" : sub.status,
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : undefined,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : undefined,
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      });

      // Update workspace plan
      if (plan) {
        await sql`
          UPDATE workspaces SET plan = ${plan.id} WHERE id = ${workspaceId}
        `;
        // Update credit balances for all workspace members
        await creditsDb.updateWorkspacePlanCredits(workspaceId, plan.id as "free" | "pro" | "business" | "enterprise");
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) break;

      await billing.upsertSubscription({
        workspaceId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan: "free",
        status: "canceled",
      });

      await sql`
        UPDATE workspaces SET plan = 'free' WHERE id = ${workspaceId}
      `;
      // Reset all workspace members to free plan credits
      await creditsDb.updateWorkspacePlanCredits(workspaceId, "free");
      break;
    }
  }
  } catch (err) {
    console.error("[Stripe Webhook] Event processing error:", err);
    // Always return 200 so Stripe doesn't retry endlessly
    return c.json({ received: true, error: "processing_failed" });
  }

  return c.json({ received: true });
});

// ─── Authenticated routes below ────────────────────────────
billingRoutes.use("/*", authMiddleware);

// ─── Top-up packages (hardcoded, used in bypass + Stripe modes) ──
const TOPUP_PACKAGES = [
  { id: "small",   credits: 100,  priceCents: 500,   bonus: 0 },
  { id: "medium",  credits: 500,  priceCents: 2000,  bonus: 50 },
  { id: "large",   credits: 1500, priceCents: 5000,  bonus: 250 },
  { id: "xlarge",  credits: 5000, priceCents: 15000, bonus: 1000 },
] as const;

// ─── GET /billing/balance ──────────────────────────────────
// Workspace-scoped balance shape per BUG-PUB-001 / TC-BILLING-CREDITS-001.
billingRoutes.get("/balance", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }
  const userId = c.get("userId");
  // BUG-BILLING-002: Verify caller is a member of the target workspace before
  // returning credit balance — otherwise any authenticated user could probe
  // any workspace's billing state by guessing/enumerating workspaceId.
  const [membership] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!membership) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  try {
    const b = await creditsDb.getCreditBalance(userId, workspaceId);
    return c.json({
      data: {
        dailyRemaining: b.daily_remaining,
        dailyMax: b.daily_total,
        monthlyRemaining: b.monthly_remaining,
        monthlyMax: b.monthly_total,
        topupRemaining: b.rollover_credits,
        planUnlimited: b.plan_type === "enterprise",
        planType: b.plan_type,
      },
    });
  } catch (err: any) {
    console.error("[Billing] /balance error:", err?.message ?? err);
    return c.json({
      data: {
        dailyRemaining: 0, dailyMax: 0,
        monthlyRemaining: 0, monthlyMax: 0,
        topupRemaining: 0, planUnlimited: false, planType: "free",
      },
    });
  }
});

// ─── GET /billing/topup/packages ───────────────────────────
billingRoutes.get("/topup/packages", (c) => {
  return c.json({ data: TOPUP_PACKAGES });
});

// ─── POST /billing/topup ───────────────────────────────────
// Bypass mode (STRIPE_SECRET_KEY empty): grants rollover credits directly.
// Stripe mode: delegates to /top-up (existing checkout) — clients should use that.
const topupBodySchema = z.object({
  workspaceId: z.string().uuid(),
  packageId: z.enum(["small", "medium", "large", "xlarge"]),
});
billingRoutes.post("/topup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = topupBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { workspaceId, packageId } = parsed.data;
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: same as /top-up — top-up packages grant real
  // money-equivalent credits to the target workspace.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  const pkg = TOPUP_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return c.json({ error: "Unknown packageId" }, 400);

  const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;
  if (!stripeEnabled) {
    // Bypass mode — grant immediately
    const granted = pkg.credits + pkg.bonus;
    await creditsDb.addRolloverCredits(workspaceId, granted);
    return c.json({
      data: {
        mode: "bypass",
        granted,
        packageId,
        transactionType: "topup_grant_bypass",
      },
    });
  }

  // Stripe mode — create checkout session for the package amount
  let subscription = await billing.getSubscription(workspaceId);
  let customerId = subscription?.stripe_customer_id;
  if (!customerId) {
    const userEmail = c.get("userEmail");
    const customer = await createCustomer({ email: userEmail, workspaceId });
    customerId = customer.id;
  }
  const origin = c.req.header("origin") ?? "http://localhost:3000";
  const session = await createTopUpSession({
    customerId,
    amount: pkg.priceCents,
    credits: pkg.credits + pkg.bonus,
    workspaceId,
    successUrl: `${origin}/billing?topup=success`,
    cancelUrl: `${origin}/billing?topup=canceled`,
  });
  return c.json({ data: { mode: "stripe", url: session.url, packageId } });
});

// ─── GET /billing/invoices ─────────────────────────────────
// Reads from billing_invoices table if present; returns [] otherwise (bypass mode).
billingRoutes.get("/invoices", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: invoices may contain Stripe URLs + customer
  // amounts. Require membership before returning anything (even an empty
  // list, since an empty list still confirms the workspace exists).
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  try {
    const rows = await sql<any[]>`
      SELECT id, workspace_id, stripe_invoice_id, amount_cents, currency,
             status, hosted_invoice_url, invoice_pdf, created_at
      FROM billing_invoices
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return c.json({ data: rows });
  } catch (err: any) {
    // Table may not exist (no Stripe integration yet) — return empty list, not 404.
    if (err?.code === "42P01") {
      return c.json({ data: [] });
    }
    console.error("[Billing] /invoices error:", err?.message ?? err);
    return c.json({ data: [] });
  }
});

// ─── GET /billing/credits ──────────────────────────────────
// Returns user-level credit balance (with auto-initialization and reset)
billingRoutes.get("/credits", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }

  const userId = c.get("userId");

  // BUG-BILLING-002: Verify caller is a member of the target workspace before
  // returning credit balance — prevents cross-tenant data leak.
  const [membership] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!membership) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  try {
    const balance = await creditsDb.getCreditBalance(userId, workspaceId);
    return c.json({ data: balance });
  } catch (err: any) {
    console.error("[Billing] getCreditBalance error:", err?.message ?? err);
    // Return safe defaults on failure (e.g. FK violation if user/workspace mismatch)
    return c.json({
      data: {
        daily_remaining: 0,
        daily_total: 0,
        monthly_remaining: 0,
        monthly_total: 0,
        rollover_credits: 0,
        total_available: 0,
        daily_reset_at: null,
        monthly_reset_at: null,
        plan_type: "free",
      },
    });
  }
});

// ─── GET /billing/credits/usage ─────────────────────────────
// Detailed usage history with daily breakdown
billingRoutes.get("/credits/usage", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }

  const userId = c.get("userId");
  // BUG-BILLING-002: membership check — prevents cross-tenant data leak
  const [membership] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);

  const days = parseInt(c.req.query("days") ?? "30", 10);

  try {
    const history = await creditsDb.getCreditUsageHistory(userId, workspaceId, days);
    return c.json({ data: history });
  } catch (err) {
    console.error("[Billing] Failed to get credit usage history:", err);
    return c.json({ data: { rows: [], total: 0, dailyBreakdown: [] } });
  }
});

// ─── GET /billing/usage ────────────────────────────────────
// Legacy workspace-level usage (kept for backwards compatibility).
// When no workspaceId is supplied, default to the caller's primary workspace
// (most-recently-updated workspace they're a member of). If the caller is
// not a member of any workspace, respond with an empty paginated result —
// matching the staging contract where `GET /billing/usage` with no params
// returns `{ data: [], pagination: {...} }` (BUG-API-BILLING-USAGE-PARAMS-001).
billingRoutes.get("/usage", async (c) => {
  const userId = c.get("userId");
  let workspaceId = c.req.query("workspaceId");

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);

  if (!workspaceId) {
    try {
      const memberships = await workspaces.getUserWorkspaces(userId);
      workspaceId = memberships[0]?.id;
    } catch (err: any) {
      console.error("[Billing] getUserWorkspaces error:", err?.message ?? err);
    }
    if (!workspaceId) {
      return c.json({
        data: [],
        pagination: { total: 0, page, pageSize, totalPages: 0 },
      });
    }
  } else {
    // BUG-BILLING-002 audit: caller supplied an explicit workspaceId — they
    // must be a member, otherwise any authed user could read every
    // workspace's full credit-usage history (project IDs, timestamps, etc).
    if (!(await isWorkspaceMember(workspaceId, userId))) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }
  }

  try {
    const { rows, total } = await billing.getUsageHistory(workspaceId, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json({
      data: rows,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    console.error("[Billing] getUsageHistory error:", err?.message ?? err);
    return c.json({
      data: [],
      pagination: { total: 0, page, pageSize, totalPages: 0 },
    });
  }
});

// ─── POST /billing/subscribe ───────────────────────────────
const subscribeSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.enum(["pro", "business"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

billingRoutes.post("/subscribe", async (c) => {
  const body = await c.req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { workspaceId, planId, interval } = parsed.data;
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: must be a member to spin up a Stripe checkout
  // that mutates this workspace's plan/customer/subscription state.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  const plan = getPlanById(planId);
  if (!plan) {
    return c.json({ error: "Plan not found" }, 404);
  }

  const priceId =
    interval === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) {
    return c.json({ error: "Price not configured for this plan" }, 400);
  }

  // Get or create Stripe customer
  let subscription = await billing.getSubscription(workspaceId);
  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    const userEmail = c.get("userEmail");
    const customer = await createCustomer({
      email: userEmail,
      workspaceId,
    });
    customerId = customer.id;
  }

  const origin = c.req.header("origin") ?? "http://localhost:3000";
  const session = await createCheckoutSession({
    customerId,
    priceId,
    workspaceId,
    successUrl: `${origin}/billing?success=true`,
    cancelUrl: `${origin}/billing?canceled=true`,
  });

  return c.json({ data: { url: session.url } });
});

// ─── POST /billing/portal ──────────────────────────────────
billingRoutes.post("/portal", async (c) => {
  // Stripe-bypass check FIRST — before any body parsing, so a request with
  // no body (or invalid JSON) still gets the informative 503 instead of a
  // useless "Invalid JSON" 400. See BUG-PUB-002 / TC-BILLING-PORTAL-003.
  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json(
      {
        error: "stripe_disabled",
        message: "Billing portal unavailable in bypass mode",
      },
      503,
    );
  }

  // Tolerate empty/missing body — only workspaceId matters here.
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const workspaceId = (body as { workspaceId?: string }).workspaceId;
  if (!workspaceId) {
    return c.json({ error: "workspaceId required" }, 400);
  }

  // BUG-BILLING-002 audit: a Stripe portal session lets the holder edit
  // payment methods, view invoices, cancel — strictly members only.
  const userId = c.get("userId");
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }

  const subscription = await billing.getSubscription(workspaceId);
  if (!subscription?.stripe_customer_id) {
    return c.json({ error: "No billing account found" }, 404);
  }

  const origin = c.req.header("origin") ?? "http://localhost:3000";
  const session = await createPortalSession({
    customerId: subscription.stripe_customer_id,
    returnUrl: `${origin}/billing`,
  });

  return c.json({ data: { url: session.url } });
});

// ─── POST /billing/top-up ──────────────────────────────────
const topUpSchema = z.object({
  workspaceId: z.string().uuid(),
  credits: z.number().int().min(10).max(10000),
});

billingRoutes.post("/top-up", async (c) => {
  const body = await c.req.json();
  const parsed = topUpSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { workspaceId, credits } = parsed.data;
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: top-up grants money-equivalent credits to the
  // target workspace — must verify the caller is allowed to buy for it.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  const pricePerCredit = 5; // 5 cents per credit
  const amount = credits * pricePerCredit;

  let subscription = await billing.getSubscription(workspaceId);
  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    const userEmail = c.get("userEmail");
    const customer = await createCustomer({ email: userEmail, workspaceId });
    customerId = customer.id;
  }

  const origin = c.req.header("origin") ?? "http://localhost:3000";
  const session = await createTopUpSession({
    customerId,
    amount,
    credits,
    workspaceId,
    successUrl: `${origin}/billing?topup=success`,
    cancelUrl: `${origin}/billing?topup=canceled`,
  });

  return c.json({ data: { url: session.url } });
});

// ─── GET /billing/subscription ─────────────────────────────
billingRoutes.get("/subscription", authMiddleware, async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: don't reveal plan/Stripe sub state to non-members.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  const [ws] = await sql<{ id: string; plan: string }[]>`SELECT id, plan FROM workspaces WHERE id = ${workspaceId}`;
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const sub = await billing.getSubscription(workspaceId);
  return c.json({ data: { plan: ws.plan, status: sub?.stripe_subscription_id ? "active" : "none", stripeSubscriptionId: sub?.stripe_subscription_id ?? null, currentPeriodEnd: null, cancelAtPeriodEnd: false, mode: process.env.STRIPE_SECRET_KEY ? "stripe" : "bypass" } });
});

// ─── GET /billing/limits ───────────────────────────────────
billingRoutes.get("/limits", authMiddleware, async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: plan/limits is workspace-private — gate it.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  const [ws] = await sql<{ plan: string }[]>`SELECT plan FROM workspaces WHERE id = ${workspaceId}`;
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  const plan = ws.plan as keyof typeof PLAN_LIMITS;
  return c.json({ data: { plan: ws.plan, limits: PLAN_LIMITS[plan] ?? PLAN_LIMITS.free } });
});

// ─── POST /billing/cancel ──────────────────────────────────
billingRoutes.post("/cancel", authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const workspaceId = (body as { workspaceId?: string }).workspaceId;
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
  const userId = c.get("userId");
  // BUG-BILLING-002 audit: cancelling a subscription is workspace-owner
  // territory. Require workspace membership at minimum; richer role checks
  // (only owner/admin) can layer on top later.
  if (!(await isWorkspaceMember(workspaceId, userId))) {
    return c.json({ error: "Not a member of this workspace" }, 403);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    await sql`UPDATE workspaces SET plan = 'free', updated_at = now() WHERE id = ${workspaceId}`;
    return c.json({ data: { cancelled: true, mode: "bypass" } });
  }
  const sub = await billing.getSubscription(workspaceId);
  if (!sub?.stripe_subscription_id) return c.json({ error: "No active subscription" }, 404);
  await cancelSubscription(sub.stripe_subscription_id);
  return c.json({ data: { cancelled: true } });
});

// ─── GET /billing/topup/history ────────────────────────────
billingRoutes.get("/topup/history", authMiddleware, async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);
  const userId = c.get("userId");
  const [membership] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId} LIMIT 1
  `;
  if (!membership) return c.json({ error: "Not a member of this workspace" }, 403);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const rows = await sql`SELECT id, workspace_id, credits, transaction_type, stripe_session_id, created_at FROM billing_transactions WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`.catch(() => []);
  return c.json({ data: rows, total: rows.length, limit, offset });
});

// ─── POST /billing/grant ───────────────────────────────────
// Platform-admin only: grant rollover credits to a workspace
billingRoutes.post("/grant", authMiddleware, async (c) => {
  const [caller] = await sql<{ is_platform_admin: boolean }[]>`
    SELECT is_platform_admin FROM users WHERE id = ${c.get("userId")} LIMIT 1
  `;
  if (!caller?.is_platform_admin) return c.json({ error: "Platform admin required" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { workspaceId, credits } = body as { workspaceId?: string; credits?: number };
  if (!workspaceId || typeof credits !== "number" || credits <= 0) return c.json({ error: "workspaceId and positive credits required" }, 400);
  await creditsDb.addRolloverCredits(workspaceId, credits);
  return c.json({ data: { granted: credits, workspaceId } });
});

// ─── POST /billing/revoke ──────────────────────────────────
// Platform-admin only: revoke rollover credits from a workspace
billingRoutes.post("/revoke", authMiddleware, async (c) => {
  const [caller] = await sql<{ is_platform_admin: boolean }[]>`
    SELECT is_platform_admin FROM users WHERE id = ${c.get("userId")} LIMIT 1
  `;
  if (!caller?.is_platform_admin) return c.json({ error: "Platform admin required" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const { workspaceId, credits } = body as { workspaceId?: string; credits?: number };
  if (!workspaceId || typeof credits !== "number" || credits <= 0) return c.json({ error: "workspaceId and positive credits required" }, 400);
  await creditsDb.addRolloverCredits(workspaceId, -credits);
  return c.json({ data: { revoked: credits, workspaceId } });
});
