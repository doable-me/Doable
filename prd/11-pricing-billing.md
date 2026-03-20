# 11 — Pricing, Billing & Credits

## Overview

Doable uses a credit-based pricing model where credits power AI generations. Subscriptions are per-workspace with unlimited team members. The system includes daily credits, monthly credits, rollovers, top-ups, and tiered plans.

---

## 1. Pricing Tiers

### 1.1 Plan Comparison

| Feature | Free | Pro ($25/mo) | Business ($50/mo) | Enterprise (Custom) |
|---------|------|-------------|-------------------|-------------------|
| **Monthly credits** | — | 100 | 100 | Custom |
| **Daily credits** | 5 | 5 | 5 | Custom |
| **Max monthly** | ~30 (5/day cap) | ~150 (100 + 5/day) | ~150 (100 + 5/day) | Custom |
| **Credit rollover** | ❌ | ✅ (up to plan limit) | ✅ (up to plan limit) | ✅ |
| **Top-up credits** | ❌ | ✅ (on-demand) | ✅ (on-demand) | ✅ |
| **Team members** | Up to 20 | Up to 20 | Unlimited | Unlimited |
| **Projects** | Unlimited | Unlimited | Unlimited | Unlimited |
| **Project visibility** | Public only | Public + Restricted | Public + Restricted | Public + Restricted |
| **Custom domains** | ❌ | ✅ | ✅ | ✅ |
| **Remove branding** | ❌ | ✅ | ✅ | ✅ |
| **Code editing (Dev Mode)** | ❌ | ✅ | ✅ | ✅ |
| **User roles** | ❌ | ✅ | ✅ | ✅ |
| **Unlimited subdomains** | ❌ | ✅ (doable.app) | ✅ | ✅ |
| **SSO (OIDC/SAML)** | ❌ | ❌ | ✅ | ✅ |
| **Data training opt-out** | ❌ | ❌ | ✅ | ✅ |
| **Design templates** | ❌ | ❌ | ✅ | ✅ |
| **Design systems** | ❌ | ❌ | ❌ | ✅ |
| **Group access controls** | ❌ | ❌ | ❌ | ✅ |
| **Custom integrations** | ❌ | ❌ | ❌ | ✅ |
| **Dedicated support** | ❌ | ❌ | ❌ | ✅ |
| **Custom onboarding** | ❌ | ❌ | ❌ | ✅ |
| **Premium support** | ❌ | ❌ | ❌ | ✅ |

### 1.2 Pricing Options
| Billing Period | Discount |
|---------------|----------|
| **Monthly** | Standard price |
| **Annual** | Discounted (typically 20%) |
| **Student discount** | Up to 50% off with university email |

---

## 2. Credit System

### 2.1 Credit Mechanics
| Feature | Description |
|---------|-------------|
| **What consumes credits** | AI prompts, code generation, edits, deployments |
| **Variable cost** | Complex tasks consume more credits than simple ones |
| **Daily credits** | Refresh every 24 hours |
| **Monthly credits** | Refresh on billing cycle |
| **Rollover** | Unused monthly credits roll over (Pro+, up to plan limit) |
| **Expiry reminders** | Notifications when rollover credits expire soon |

### 2.2 Credit Conservation
| Strategy | Description |
|----------|-------------|
| **Plan Mode** | Creates plans before code → fewer wasted generations |
| **Atomic prompts** | Specific prompts consume fewer credits than vague ones |
| **Visual Edits** | Direct UI edits may consume fewer credits than chat |
| **Knowledge** | Custom knowledge reduces back-and-forth |

### 2.3 Credit Top-ups (Pro+)
| Feature | Description |
|---------|-------------|
| **On-demand** | Buy additional credits anytime |
| **Instant** | Available immediately after purchase |
| **No subscription change** | Top-ups are separate from plan credits |

---

## 3. Billing Management

### 3.1 Subscription Management
| Feature | Description |
|---------|-------------|
| **Upgrade** | Instant plan upgrade |
| **Downgrade** | Effective at end of billing period |
| **Cancel** | Cancel anytime, access until period end |
| **Payment methods** | Credit card, possibly others |
| **Invoices** | Downloadable invoices |

### 3.2 Payment Issue Handling
| Feature | Description |
|---------|-------------|
| **In-app alerts** | Failed/overdue payments shown inside the app |
| **Grace period** | Brief period to resolve payment issues |
| **Retry** | Payment retry mechanism |
| **Downgrade** | Auto-downgrade to Free on persistent failure |

### 3.3 Usage Dashboard
| Metric | Description |
|--------|-------------|
| **Credits used** | Current period usage |
| **Credits remaining** | Available credits |
| **Rollover balance** | Rolled-over credits from previous periods |
| **Usage history** | Graph of credits consumed over time |
| **Per-project** | Breakdown by project |
| **Per-member** | Credit consumption per workspace collaborator |
| **Per-member limits** | Admins can set maximum credit usage per collaborator |
| **Cloud usage per-project** | % distribution of cloud resource consumption by project |

---

## 4. Enterprise Pricing

### 4.1 Custom Quotes
| Factor | Description |
|--------|-------------|
| **Team size** | Number of users |
| **Usage volume** | Expected credit consumption |
| **Features needed** | Design systems, SSO, custom integrations |
| **Support level** | Dedicated, premium, or standard |
| **Compliance** | SOC 2, GDPR, data agreements |

### 4.2 Enterprise Features
| Feature | Description |
|---------|-------------|
| **Custom credit pools** | Usage-based allocation |
| **Dedicated support** | Named support contact |
| **Custom onboarding** | Guided setup and training |
| **Custom API connections** | Bespoke integrations |
| **Group access controls** | Advanced user management |
| **Design systems** | Org-wide design consistency |
| **Data protection** | DPA, compliance agreements |
| **Security** | Enhanced security features |

---

## 5. Cloud Usage (Separate)

### 5.1 Cloud Billing
| Feature | Description |
|---------|-------------|
| **Hosting** | Included in plan for basic usage |
| **Edge functions** | Usage-based beyond free tier |
| **Storage** | Usage-based beyond free tier |
| **Database** | Usage-based beyond free tier |
| **AI features** | Usage-based beyond credits |

### 5.2 Add-ons (Pro+)
- Additional storage capacity
- Higher edge function execution limits
- Premium database features
- Enhanced monitoring/analytics

---

## 6. Student Pricing

### 6.1 Eligibility
| Feature | Description |
|---------|-------------|
| **Verification** | University/education email required |
| **Discount** | Up to 50% off paid plans |
| **Duration** | Renewed annually with verification |
| **Plans** | Applies to Pro and Business |
