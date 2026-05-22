# Calling Connected Integrations from a Next.js App

Use `@doable/sdk` to call connected integrations. The SDK proxies calls
through a secure server-side bridge — credentials never reach the browser.
Each user's own configured integration credentials are used (workspace/project scoped).

Add to `package.json` dependencies:
```json
{ "@doable/sdk": "workspace:*" }
```

## Pattern 1 — Server Actions (PREFERRED for mutations)

```ts
// app/actions/notify.ts
'use server';

import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export async function notifySlack(channel: string, text: string) {
  const result = await doable.integrations.run("slack", "send_channel_message", {
    channel,
    text,
  });
  if (!result.success) throw new Error(result.error?.message);
  return result.data;
}
```

The client component imports `notifySlack` and calls it. The Slack token never
leaves the Doable API server.

## Pattern 2 — Server Components (data fetching)

```ts
// app/dashboard/page.tsx (Server Component)
import { createServerClient } from "@doable/sdk/server";

const doable = createServerClient();

export default async function DashboardPage() {
  const channels = await doable.integrations.run("slack", "list_channels", {});
  return (
    <ul>
      {channels.data?.channels?.map((ch: any) => (
        <li key={ch.id}>{ch.name}</li>
      ))}
    </ul>
  );
}
```

## Pattern 3 — Client Components (interactive UI)

For client components that need to call integrations directly:

```tsx
'use client';

import { useIntegration } from "@doable/sdk/react";

export function NotifyButton() {
  const slack = useIntegration("slack", "send_channel_message");

  return (
    <button
      onClick={() => slack.run({ channel: "#general", text: "Hello!" })}
      disabled={slack.loading}
    >
      {slack.loading ? "Sending..." : "Notify Slack"}
    </button>
  );
}
```

## Pattern 4 — Route Handlers (for webhooks / external callbacks)

```ts
// app/api/webhook/route.ts
import { createServerClient } from "@doable/sdk/server";
import { NextResponse } from "next/server";

const doable = createServerClient();

export async function POST(req: Request) {
  const body = await req.json();
  await doable.integrations.run("slack", "send_channel_message", {
    channel: "#alerts",
    text: `Webhook received: ${body.event}`,
  });
  return NextResponse.json({ ok: true });
}
```

## Auth — handled automatically

- **Server-side** (`createServerClient()`): Uses `DOABLE_PROJECT_KEY` env var (auto-provisioned)
- **Client-side** (`useIntegration()`): Token arrives via postMessage from Doable editor in preview,
  or uses `NEXT_PUBLIC_DOABLE_PROJECT_KEY` when deployed

## Response shape

```ts
interface IntegrationCallResult<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { integrationId: string; actionName: string; durationMs: number } | null;
}
```

## Checklist

1. Confirm the integration is connected (check `<connected-integrations>` block).
2. Add `@doable/sdk` to package.json: `"@doable/sdk": "workspace:*"`.
3. Server-side calls → `createServerClient()` from `@doable/sdk/server`.
4. Client-side calls → `useIntegration()` from `@doable/sdk/react`.
5. Always handle `result.success === false` — the user may have revoked the connection.
