import Stripe from "stripe";
import type { WorkspacePlan } from "@doable/shared";

// ─── Stripe Client ─────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

if (!STRIPE_SECRET_KEY) {
  console.warn("⚠ STRIPE_SECRET_KEY not set — billing features will be unavailable.");
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { typescript: true })
  : (null as unknown as Stripe);

// ─── Plan Definitions ──────────────────────────────────────
export interface PlanDefinition {
  id: WorkspacePlan;
  name: string;
  description: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  contactSales?: boolean;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  features: string[];
  dailyCredits: number;
  monthlyCredits: number;
  maxProjects: number;
  maxMembers: number;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    description: "For personal projects and experimentation",
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    features: [
      "3 projects",
      "5 daily AI credits",
      "Community support",
      "Doable subdomain",
    ],
    dailyCredits: 5,
    monthlyCredits: 0,
    maxProjects: 3,
    maxMembers: 1,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professionals and small teams",
    priceMonthly: 25,
    priceYearly: 240,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    stripePriceIdYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? "",
    features: [
      "25 projects",
      "50 daily AI credits",
      "500 monthly AI credits",
      "Custom domains",
      "Analytics",
      "5 team members",
    ],
    dailyCredits: 50,
    monthlyCredits: 500,
    maxProjects: 25,
    maxMembers: 5,
  },
  {
    id: "business",
    name: "Business",
    description: "For growing teams and organizations",
    priceMonthly: 50,
    priceYearly: 480,
    stripePriceIdMonthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID ?? "",
    stripePriceIdYearly: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID ?? "",
    features: [
      "100 projects",
      "200 daily AI credits",
      "3,000 monthly AI credits",
      "Custom domains",
      "Advanced analytics",
      "25 team members",
      "Priority support",
    ],
    dailyCredits: 200,
    monthlyCredits: 3000,
    maxProjects: 100,
    maxMembers: 25,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For large organizations with custom needs",
    priceMonthly: null,
    priceYearly: null,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    features: [
      "Unlimited projects",
      "Unlimited AI credits",
      "Custom domains",
      "Enterprise analytics",
      "Unlimited team members",
      "Priority support",
      "SLA & dedicated CSM",
    ],
    dailyCredits: Infinity,
    monthlyCredits: Infinity,
    maxProjects: Infinity,
    maxMembers: Infinity,
    contactSales: true,
  },
];

export function getPlanById(planId: string): PlanDefinition | undefined {
  return PLANS.find((p) => p.id === planId);
}

// ─── Checkout Session ──────────────────────────────────────
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode: "subscription",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { workspaceId: opts.workspaceId },
    subscription_data: {
      metadata: { workspaceId: opts.workspaceId },
    },
  });
}

// ─── Customer Portal ───────────────────────────────────────
export async function createPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
}

// ─── Customer Management ───────────────────────────────────
export async function createCustomer(opts: {
  email: string;
  name?: string;
  workspaceId: string;
}): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email: opts.email,
    name: opts.name,
    metadata: { workspaceId: opts.workspaceId },
  });
}

// ─── Top-up (one-time credits purchase) ────────────────────
export async function createTopUpSession(opts: {
  customerId: string;
  amount: number; // cents
  credits: number;
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${opts.credits} AI Credits`,
            description: "One-time credit top-up for Doable",
          },
          unit_amount: opts.amount,
        },
        quantity: 1,
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      workspaceId: opts.workspaceId,
      credits: String(opts.credits),
      type: "top_up",
    },
  });
}

// ─── Webhook Verification ──────────────────────────────────
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.cancel(subscriptionId);
}
