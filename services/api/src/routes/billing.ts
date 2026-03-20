import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../middleware/auth.js";
import { authMiddleware } from "../middleware/auth.js";
import { sql } from "../db/index.js";
import { billingQueries } from "@doable/db/queries/billing";
import { creditQueries } from "@doable/db/queries/credits";
import {
  PLANS,
  getPlanById,
  createCheckoutSession,
  createPortalSession,
  createCustomer,
  createTopUpSession,
  constructWebhookEvent,
} from "../lib/stripe.js";
import { PLAN_LIMITS } from "@doable/shared";

const billing = billingQueries(sql);
const creditsDb = creditQueries(sql);

export const billingRoutes = new Hono<AuthEnv>();

// ─── Public: Plans ─────────────────────────────────────────
billingRoutes.get("/plans", (c) => {
  return c.json({
    data: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      features: p.features,
      dailyCredits: p.dailyCredits,
      monthlyCredits: p.monthlyCredits,
      maxProjects: p.maxProjects,
      maxMembers: p.maxMembers,
    })),
  });
});

// ─── Webhook (no auth, raw body) ───────────────────────────
billingRoutes.post("/webhook", async (c) => {
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId) break;

      // Handle top-up
      if (session.metadata?.type === "top_up") {
        const credits = parseInt(session.metadata.credits ?? "0", 10);
        if (credits > 0) {
          await billing.addCredits(workspaceId, { rollover: credits });
          // Also add to user-level credit balances
          try {
            await creditsDb.addRolloverCredits(workspaceId, credits);
          } catch (err) {
            console.warn("[Webhook] Failed to add rollover to user credits:", err);
          }
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

      const priceId = sub.items.data[0]?.price.id;
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
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      });

      // Update workspace plan
      if (plan) {
        await sql`
          UPDATE workspaces SET plan = ${plan.id} WHERE id = ${workspaceId}
        `;
        // Reset credits for new plan (workspace-level)
        const limits = PLAN_LIMITS[plan.id];
        await billing.resetDailyCredits(workspaceId, limits.dailyCredits);
        await billing.resetMonthlyCredits(workspaceId, limits.monthlyCredits);

        // Update user-level credit balances for the new plan
        try {
          await creditsDb.updateWorkspacePlanCredits(workspaceId, plan.id as "free" | "pro" | "business" | "enterprise");
        } catch (err) {
          console.warn("[Webhook] Failed to update user credit balances:", err);
        }
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
      const freeLimits = PLAN_LIMITS.free;
      await billing.resetDailyCredits(workspaceId, freeLimits.dailyCredits);
      await billing.resetMonthlyCredits(workspaceId, freeLimits.monthlyCredits);

      // Update user-level credit balances to free plan
      try {
        await creditsDb.updateWorkspacePlanCredits(workspaceId, "free");
      } catch (err) {
        console.warn("[Webhook] Failed to update user credit balances:", err);
      }
      break;
    }
  }

  return c.json({ received: true });
});

// ─── Authenticated routes below ────────────────────────────
billingRoutes.use("/*", authMiddleware);

// ─── GET /billing/credits ──────────────────────────────────
// Returns user-level credit balance (with auto-initialization and reset)
billingRoutes.get("/credits", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }

  const userId = c.get("userId");

  try {
    const balance = await creditsDb.getCreditBalance(userId, workspaceId);
    return c.json({ data: balance });
  } catch (err) {
    console.error("[Billing] Failed to get credit balance:", err);
    // Fallback to workspace-level credits
    const credits = await billing.getCredits(workspaceId);
    if (!credits) {
      return c.json({ error: "Credits not found" }, 404);
    }
    return c.json({ data: credits });
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
// Legacy workspace-level usage (kept for backwards compatibility)
billingRoutes.get("/usage", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId query param required" }, 400);
  }

  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);

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
  const { workspaceId } = await c.req.json();
  if (!workspaceId) {
    return c.json({ error: "workspaceId required" }, 400);
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
