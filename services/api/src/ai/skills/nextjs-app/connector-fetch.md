# Calling Connectors from a Next.js App

A Next.js project has a server runtime, so it does NOT need the
`/__doable/connector-proxy/*` bridge. That path exists only for static
SPAs (Vite, plain React) that cannot hold secrets. In Next.js you call
the third-party API directly from server code, using `process.env`.

There are two common patterns.

## Pattern 1 — Server-only call

Use this for anything triggered by a server action, route handler, or
server component. You read `process.env.X` directly and call the SDK.

```ts
// app/actions/notify.ts
'use server';

import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function notify(text: string) {
  await slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID!,
    text,
  });
}
```

The client component imports `notify` and calls it. The Slack token never
leaves the server.

## Pattern 2 — Client component needs to call a connector

You CAN'T import the SDK or read the secret in the browser. Instead,
generate a thin route handler that proxies the call server-side, then have
the client `fetch` your own route handler.

`app/api/slack/notify/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text?: string };
  if (!text) {
    return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
  }
  await slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID!,
    text,
  });
  return NextResponse.json({ ok: true });
}
```

`components/notify-button.tsx`:

```tsx
'use client';

import useSWRMutation from 'swr/mutation';

async function postNotify(url: string, { arg }: { arg: { text: string } }) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  return r.json();
}

export function NotifyButton() {
  const { trigger, isMutating } = useSWRMutation('/api/slack/notify', postNotify);
  return (
    <button onClick={() => trigger({ text: 'hello from the client' })} disabled={isMutating}>
      Notify
    </button>
  );
}
```

## Do NOT use the connector-proxy bridge

```
// WRONG in a Next.js project — that path is for static SPAs
fetch('/__doable/connector-proxy/slack/post-message', ...)
```

The bridge is mounted by Caddy in front of published static previews. A
Next.js project owns its own server, so it serves its own route handlers
and reads its own env vars. Going through the bridge would add an
unnecessary hop and a JWT round-trip you don't need.

## Checklist

1. Decide: is the call triggered server-side (action / handler) or
   client-side (button click in a `'use client'` component)?
2. Server-side → Pattern 1.
3. Client-side → Pattern 2 (route handler + fetch).
4. Secrets go in `.env.local` as `process.env.X` — never `NEXT_PUBLIC_X`.
