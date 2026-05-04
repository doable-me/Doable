# Client SDK Specification — `@doable/sdk`

## Overview

A lightweight SDK injected into generated apps that abstracts the connector-proxy calls. Framework-agnostic core with framework-specific bindings.

## Package Structure

```
@doable/sdk/
├── index.ts          # Core: createClient(), integrations.run()
├── react.ts          # React hooks: useIntegration(), useIntegrationQuery()
├── server.ts         # Server-side: for Next.js API routes / Server Actions
└── types.ts          # Shared TypeScript types
```

The SDK is **NOT published to npm**. It lives at `packages/doable-sdk/` in the monorepo and is:
- Bundled into Vite apps via the scaffold template's `package.json`
- Available to Next.js apps via the same mechanism
- Lightweight (~3KB gzipped, zero dependencies)

## Core API (`@doable/sdk`)

```typescript
// ─── Types ──────────────────────────────────────────────

export interface IntegrationCallResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { integrationId: string; actionName: string; durationMs: number } | null;
}

export interface DoableSDKConfig {
  /** Override proxy base URL (defaults to same-origin /__doable/connector-proxy) */
  proxyUrl?: string;
  /** Project API key for deployed apps (omit in preview — token arrives via postMessage) */
  apiKey?: string;
  /** Project ID (required when using apiKey) */
  projectId?: string;
}

// ─── Client Factory ─────────────────────────────────────

export function createDoableClient(config?: DoableSDKConfig): DoableClient;

export interface DoableClient {
  /** Call an integration action */
  integrations: {
    run<T = unknown>(
      integrationId: string,
      actionName: string,
      props?: Record<string, unknown>,
    ): Promise<IntegrationCallResult<T>>;

    /** List available integrations for this project (cached) */
    list(): Promise<AvailableIntegration[]>;
  };
}
```

## Usage in Vite Apps (Client-Side)

```typescript
// src/lib/doable.ts
import { createDoableClient } from "@doable/sdk";

// In preview mode, token arrives automatically via postMessage (connector-bridge)
// In deployed mode, use project API key from env
export const doable = createDoableClient({
  apiKey: import.meta.env.VITE_DOABLE_PROJECT_KEY,  // only set in deployed mode
  projectId: import.meta.env.VITE_DOABLE_PROJECT_ID,
});
```

```typescript
// src/components/ContactForm.tsx
import { doable } from "../lib/doable";

async function handleSubmit(formData: FormData) {
  const result = await doable.integrations.run("slack", "send_channel_message", {
    channel: "#leads",
    text: `New contact: ${formData.get("name")} — ${formData.get("email")}`,
  });

  if (result.success) {
    alert("Message sent!");
  } else {
    console.error("Failed:", result.error?.message);
  }
}
```

## Usage in Next.js Apps

### Client Components (same as Vite)

```typescript
// app/lib/doable.ts
import { createDoableClient } from "@doable/sdk";

export const doable = createDoableClient({
  apiKey: process.env.NEXT_PUBLIC_DOABLE_PROJECT_KEY,
  projectId: process.env.NEXT_PUBLIC_DOABLE_PROJECT_ID,
});
```

### Server Actions (server-side, no browser involved)

```typescript
// app/actions/notify.ts
"use server";

import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient({
  apiKey: process.env.DOABLE_PROJECT_KEY,  // Server-only key (higher rate limits)
  projectId: process.env.DOABLE_PROJECT_ID,
  // proxyUrl defaults to DOABLE_PROXY_URL env var or inferred from runtime
});

export async function notifySlack(channel: string, text: string) {
  const result = await doable.integrations.run("slack", "send_channel_message", {
    channel,
    text,
  });
  if (!result.success) throw new Error(result.error?.message);
  return result.data;
}
```

### API Routes (server-side)

```typescript
// app/api/webhook/route.ts
import { createServerClient } from "@doable/sdk/server";
import { NextResponse } from "next/server";

const doable = createServerClient();

export async function POST(request: Request) {
  const body = await request.json();

  // Process webhook, then notify via integration
  await doable.integrations.run("discord", "send_channel_message", {
    channel_id: process.env.DISCORD_CHANNEL_ID,
    content: `Received webhook: ${body.event}`,
  });

  return NextResponse.json({ ok: true });
}
```

## React Hooks (`@doable/sdk/react`)

```typescript
import { useIntegration, useIntegrationQuery } from "@doable/sdk/react";

// ─── Mutation Hook (fire-and-forget actions) ─────────────

function SendButton() {
  const slack = useIntegration("slack", "send_channel_message");

  return (
    <button
      onClick={() => slack.run({ channel: "#general", text: "Hello!" })}
      disabled={slack.loading}
    >
      {slack.loading ? "Sending..." : "Send to Slack"}
    </button>
  );
}

// ─── Query Hook (fetch data from integrations) ──────────

function ChannelList() {
  const { data, loading, error, refetch } = useIntegrationQuery(
    "slack",
    "list_channels",
    {},  // props
    { enabled: true }  // options
  );

  if (loading) return <p>Loading channels...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data?.channels?.map((ch: any) => (
        <li key={ch.id}>{ch.name}</li>
      ))}
    </ul>
  );
}
```

### Hook Signatures

```typescript
// Mutation hook — for actions with side effects
export function useIntegration<T = unknown>(
  integrationId: string,
  actionName: string,
): {
  run: (props?: Record<string, unknown>) => Promise<IntegrationCallResult<T>>;
  loading: boolean;
  error: { code: string; message: string } | null;
  data: T | null;
  reset: () => void;
};

// Query hook — for read-only data fetching
export function useIntegrationQuery<T = unknown>(
  integrationId: string,
  actionName: string,
  props?: Record<string, unknown>,
  options?: {
    enabled?: boolean;       // default true
    refetchInterval?: number; // ms, for polling
    staleTime?: number;       // ms, cache duration
  },
): {
  data: T | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  refetch: () => void;
};
```

## Internal Implementation

### Token Management (Preview Mode)

```typescript
// Internal — handles the postMessage token flow transparently
class TokenManager {
  private token: string | null = null;
  private waiters: Array<(token: string) => void> = [];

  constructor() {
    // Listen for token from editor host (connector-bridge delivers this)
    if (typeof window !== "undefined") {
      window.addEventListener("message", (ev) => {
        if (ev.data?.type === "doable:connector-proxy-token") {
          this.token = ev.data.token;
          this.waiters.forEach((resolve) => resolve(this.token!));
          this.waiters = [];
        }
      });
      // Request token on init
      window.parent?.postMessage({ type: "doable:connector-proxy-ready" }, "*");
    }
  }

  async getToken(): Promise<string> {
    if (this.token) return this.token;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  invalidate() {
    this.token = null;
    window.parent?.postMessage({ type: "doable:connector-proxy-ready" }, "*");
  }
}
```

### Fetch Wrapper

```typescript
async function callProxy<T>(
  integrationId: string,
  actionName: string,
  props: Record<string, unknown>,
  config: DoableSDKConfig,
): Promise<IntegrationCallResult<T>> {
  const baseUrl = config.proxyUrl ?? "/__doable/connector-proxy";
  const url = `${baseUrl}/${integrationId}/${actionName}`;

  const headers: Record<string, string> = { "content-type": "application/json" };

  if (config.apiKey) {
    headers["authorization"] = `Bearer ${config.apiKey}`;
    if (config.projectId) headers["x-doable-project-id"] = config.projectId;
  } else {
    const token = await tokenManager.getToken();
    headers["authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ props }),
  });

  // Token expired — refresh and retry once
  if (res.status === 401 && !config.apiKey) {
    tokenManager.invalidate();
    const freshToken = await tokenManager.getToken();
    headers["authorization"] = `Bearer ${freshToken}`;
    const retry = await fetch(url, { method: "POST", headers, body: JSON.stringify({ props }) });
    return retry.json();
  }

  return res.json();
}
```

## Server SDK (`@doable/sdk/server`)

For Next.js server-side usage (Server Actions, API Routes, middleware):

```typescript
export function createServerClient(config?: {
  apiKey?: string;    // defaults to process.env.DOABLE_PROJECT_KEY
  projectId?: string; // defaults to process.env.DOABLE_PROJECT_ID
  proxyUrl?: string;  // defaults to process.env.DOABLE_PROXY_URL
}): DoableClient {
  const resolvedConfig = {
    apiKey: config?.apiKey ?? process.env.DOABLE_PROJECT_KEY,
    projectId: config?.projectId ?? process.env.DOABLE_PROJECT_ID,
    proxyUrl: config?.proxyUrl ?? process.env.DOABLE_PROXY_URL ?? "http://127.0.0.1:3001/__doable/connector-proxy",
  };

  return createDoableClient(resolvedConfig);
}
```

**Key difference from client SDK:**
- Uses `DOABLE_PROJECT_KEY` (server-only, no `VITE_`/`NEXT_PUBLIC_` prefix)
- Calls the proxy over internal network (127.0.0.1), not through the public URL
- Higher rate limits (server keys are trusted more than browser tokens)
- No postMessage token flow — just a static API key

## Env Vars Injected by Doable

| Env Var | Scope | When Set | Purpose |
|---------|-------|----------|---------|
| `VITE_DOABLE_PROJECT_KEY` | Client | Deployed Vite apps | Browser proxy auth |
| `NEXT_PUBLIC_DOABLE_PROJECT_KEY` | Client | Deployed Next.js apps | Browser proxy auth |
| `DOABLE_PROJECT_KEY` | Server | Deployed Next.js apps | Server-side proxy auth (higher limits) |
| `VITE_DOABLE_PROJECT_ID` | Client | Always | Project identification |
| `NEXT_PUBLIC_DOABLE_PROJECT_ID` | Client | Always | Project identification |
| `DOABLE_PROJECT_ID` | Server | Always | Project identification |
| `DOABLE_PROXY_URL` | Server | Deployed | Internal proxy URL for server SDK |

In **preview mode**, no env vars are needed — the connector-bridge handles token delivery via postMessage automatically.

## Backward Compatibility

The existing `window.__doable.callConnector()` global continues to work. The SDK is a higher-level wrapper that:
1. Adds TypeScript types
2. Adds React hooks
3. Handles the two auth modes transparently
4. Adds retry logic
5. Provides a server-side variant for Next.js

Generated apps will import from `@doable/sdk`. Existing apps using `window.__doable.callConnector` directly will continue to function unchanged.
