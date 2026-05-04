# Next.js Integration Patterns

## Why Next.js is Different

Next.js apps have **server-side execution capability** that Vite SPAs lack. This creates two distinct integration paths:

| Path | Where it runs | Auth mechanism | Credential access |
|------|--------------|----------------|-------------------|
| Client Components | Browser | Preview JWT or client API key | Via proxy only |
| Server Components | Node.js on Doable | Server API key | Via proxy (internal network) |
| Server Actions | Node.js on Doable | Server API key | Via proxy (internal network) |
| API Routes | Node.js on Doable | Server API key | Via proxy (internal network) |
| Middleware | Edge/Node.js | Server API key | Via proxy (internal network) |

The server-side path is **more powerful**:
- Higher rate limits (trusted server-to-server)
- Can chain multiple integration calls without round-tripping to browser
- Can hold intermediate secrets in memory without browser exposure
- Lower latency (localhost fetch vs internet round-trip from browser)

## Architecture for Next.js Projects

```
Browser (Client Components)
    │
    │  useIntegration("stripe", "create_checkout_session", {...})
    │  → fetch("/__doable/connector-proxy/stripe/create_checkout_session")
    │    Auth: Bearer <preview-jwt or dpk_c_*>
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Doable API Server                                   │
│  /__doable/connector-proxy (same as Vite path)      │
└─────────────────────────────────────────────────────┘


Next.js Server (Server Actions / API Routes)
    │
    │  const doable = createServerClient();
    │  await doable.integrations.run("stripe", "create_checkout_session", {...})
    │  → fetch("http://127.0.0.1:3001/__doable/connector-proxy/...")
    │    Auth: Bearer <dpk_s_*>
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Doable API Server (internal, same machine)          │
│  /__doable/connector-proxy                           │
└─────────────────────────────────────────────────────┘
```

## Pattern 1: Server Action with Integration Call

This is the **recommended pattern** for Next.js apps. Keeps credentials entirely server-side.

```typescript
// app/actions/payment.ts
"use server";

import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export async function createCheckout(productId: string, email: string) {
  // Validate inputs (server-side, trusted)
  if (!productId || !email) throw new Error("Missing required fields");

  // Call Stripe via secure proxy
  const result = await doable.integrations.run("stripe", "create_checkout_session", {
    line_items: [{ price: productId, quantity: 1 }],
    customer_email: email,
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cancel`,
  });

  if (!result.success) {
    throw new Error(`Payment setup failed: ${result.error?.message}`);
  }

  return { checkoutUrl: result.data.url };
}
```

```typescript
// app/checkout/page.tsx (Client Component)
"use client";

import { createCheckout } from "../actions/payment";

export default function CheckoutPage() {
  async function handleCheckout() {
    const { checkoutUrl } = await createCheckout("price_abc123", "user@example.com");
    window.location.href = checkoutUrl;
  }

  return <button onClick={handleCheckout}>Pay Now</button>;
}
```

## Pattern 2: API Route Handling Webhooks

```typescript
// app/api/webhooks/stripe/route.ts
import { createServerClient } from "@doable/sdk/server";
import { NextResponse } from "next/server";

const doable = createServerClient();

export async function POST(request: Request) {
  const body = await request.json();

  // Verify webhook signature (Stripe sends this)
  // Note: For webhook verification, the raw body is needed
  // This is a limitation — see "Webhook Pattern" below

  if (body.type === "checkout.session.completed") {
    // Notify team via Slack
    await doable.integrations.run("slack", "send_channel_message", {
      channel: "#sales",
      text: `💰 New sale: ${body.data.object.amount_total / 100} ${body.data.object.currency}`,
    });

    // Update Notion database
    await doable.integrations.run("notion", "create_database_item", {
      database_id: process.env.NOTION_SALES_DB,
      properties: {
        "Amount": { number: body.data.object.amount_total / 100 },
        "Email": { email: body.data.object.customer_email },
        "Date": { date: { start: new Date().toISOString() } },
      },
    });
  }

  return NextResponse.json({ received: true });
}
```

## Pattern 3: Server Component Data Fetching

```typescript
// app/dashboard/page.tsx (Server Component — no "use client")
import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export default async function DashboardPage() {
  // Fetch data server-side (no client JS needed)
  const [slackChannels, stripeBalance] = await Promise.all([
    doable.integrations.run("slack", "list_channels", {}),
    doable.integrations.run("stripe", "get_balance", {}),
  ]);

  return (
    <div>
      <h1>Dashboard</h1>
      <section>
        <h2>Slack Channels</h2>
        <ul>
          {slackChannels.data?.channels?.map((ch: any) => (
            <li key={ch.id}>{ch.name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Stripe Balance</h2>
        <p>${stripeBalance.data?.available?.[0]?.amount / 100}</p>
      </section>
    </div>
  );
}
```

## Pattern 4: Middleware for Auth Gates

```typescript
// middleware.ts
import { createServerClient } from "@doable/sdk/server";
import { NextResponse } from "next/server";

const doable = createServerClient();

export async function middleware(request: Request) {
  // Example: check if user is in a specific Slack workspace
  // (Using integration as an auth provider)
  const sessionToken = request.headers.get("x-session-token");
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Could verify against an integration (e.g., check user in workspace)
  // This is advanced usage — most apps won't need this
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

## Webhook Patterns (Inbound)

For integrations that **send** data to the app (webhooks from Stripe, GitHub, Slack, etc.):

### Problem
Published Next.js apps need a stable URL that external services can POST to. During preview, there's no stable URL.

### Solution: Doable Webhook Relay

```
External Service (Stripe)
    │
    │  POST https://hooks.doable.me/p/<projectId>/stripe
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Doable Webhook Relay (API server route)         │
│                                                  │
│  1. Receive webhook                              │
│  2. Verify signature (if integration provides)  │
│  3. Store in webhook_events table               │
│  4. Forward to app's dev server (if running)    │
│     POST http://127.0.0.1:<port>/api/webhooks   │
│  5. Or queue for next app startup               │
└─────────────────────────────────────────────────┘
```

This means:
- The app always has a stable webhook URL (`hooks.doable.me/p/<id>/<integration>`)
- Works in both preview and deployed modes
- Webhook signature verification happens at the relay (where we have the signing secret from vault)
- App receives pre-verified, clean payloads

## Environment Variables for Next.js

Doable injects these env vars when starting a Next.js dev server:

```bash
# Client-exposed (browser bundle)
NEXT_PUBLIC_DOABLE_PROJECT_ID=<uuid>
NEXT_PUBLIC_DOABLE_PROJECT_KEY=dpk_c_xxxx...   # Only in deployed mode

# Server-only (API routes, Server Actions)
DOABLE_PROJECT_ID=<uuid>
DOABLE_PROJECT_KEY=dpk_s_xxxx...               # Only in deployed mode
DOABLE_PROXY_URL=http://127.0.0.1:3001/__doable/connector-proxy

# Integration-specific (from envKeyMap — same as Vite)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # Server-only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... 
STRIPE_SECRET_KEY=sk_live_...                  # Server-only
```

**Key insight:** Next.js naturally separates client/server env vars via the `NEXT_PUBLIC_` prefix convention. The existing `vault-bridge.ts` already handles this split via `envKeyMap.client` vs `envKeyMap.server`.

## Hybrid Approach: When to Use Proxy vs Direct Env

| Integration | Use Proxy | Use Direct Env | Why |
|---|---|---|---|
| Slack (send message) | ✅ | ❌ | OAuth token, complex auth |
| Supabase (query data) | ❌ | ✅ | Real-time subscriptions need direct WebSocket |
| Stripe (create charge) | ✅ | ⚠️ server-only | Secret key must stay server-side |
| Stripe (elements UI) | ❌ | ✅ | Publishable key is browser-safe |
| OpenAI (completions) | ✅ | ❌ | API key, expensive calls need rate limiting |
| Firebase (auth) | ❌ | ✅ | Client SDK needs direct WebSocket/long-poll |
| GitHub (create issue) | ✅ | ❌ | OAuth token |
| Twilio (send SMS) | ✅ | ❌ | Account SID + auth token |

**Rule of thumb:** Use the proxy for all server-side operations. Use direct env only for client SDKs that require persistent connections (WebSocket, real-time) and expose only browser-safe credentials (public/anon keys).

## Dev vs Deploy Differences

### During Preview (Dev Server)

```
Next.js dev server (started by Doable)
├── Listens on 127.0.0.1:<port>
├── Gets env vars from resolveProjectEnvVars()
├── Server Actions call proxy at DOABLE_PROXY_URL (internal)
├── Client Components get preview JWT via postMessage
└── HMR works normally (Turbopack)
```

### After Deploy (Production)

```
Next.js production server (via runtime adapter)
├── Listens on unix socket or 127.0.0.1:<port>
├── Gets env vars from deploy-time snapshot
├── Server Actions call proxy at DOABLE_PROXY_URL (internal, same machine)
├── Client Components use NEXT_PUBLIC_DOABLE_PROJECT_KEY
└── Static pages served via Caddy
```

The key difference: in preview, client auth is ephemeral (JWT via postMessage). In production, it's a persistent API key baked into the client bundle as `NEXT_PUBLIC_DOABLE_PROJECT_KEY`.

## Error Handling Patterns

```typescript
// Recommended: wrap integration calls in try/catch with user-friendly errors
"use server";

import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export async function sendNotification(message: string) {
  const result = await doable.integrations.run("slack", "send_channel_message", {
    channel: "#notifications",
    text: message,
  });

  if (!result.success) {
    switch (result.error?.code) {
      case "INTEGRATION_NOT_CONNECTED":
        throw new Error("Slack is not connected. Please set it up in project settings.");
      case "RATE_LIMITED":
        throw new Error("Too many messages sent. Please try again in a minute.");
      case "EXECUTION_FAILED":
        throw new Error("Could not reach Slack. Please try again later.");
      default:
        throw new Error("Something went wrong. Please try again.");
    }
  }

  return { sent: true };
}
```

## TypeScript Support

The SDK ships with generated types for all 200+ integrations:

```typescript
// Auto-generated from Activepieces action definitions
import type { SlackActions } from "@doable/sdk/types/slack";

// Provides autocomplete for action names and props:
await doable.integrations.run<SlackActions["send_channel_message"]["output"]>(
  "slack",
  "send_channel_message",
  { channel: "#general", text: "hello" }  // ← typed props
);
```

Type generation is a **nice-to-have** for Phase 2. Phase 1 uses `Record<string, unknown>` props.
