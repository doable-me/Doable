# Next.js Route Handlers

Route handlers are the App Router replacement for `pages/api/*`. They give
you a REST surface that any client (browser fetch, mobile app, third-party
webhook) can hit. Use them when:

- You need a stable URL (webhooks, OAuth callbacks, public APIs).
- You want SWR / TanStack Query to fetch from a typed endpoint.
- A client component needs server data but cannot use a server action
  (e.g. a GET with cache headers).

For mutations triggered from your own UI, prefer a server action instead.

## File layout

```
app/
  api/
    items/
      route.ts        // GET, POST  → /api/items
      [id]/
        route.ts      // GET, DELETE → /api/items/:id
```

Each `route.ts` exports one function per HTTP verb: `GET`, `POST`, `PUT`,
`PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

## The shape

```ts
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? '20');
  // ...
  return NextResponse.json({ ok: true, items: [] });
}
```

You can also return `Response.json(...)` — `NextResponse` is just a thin
wrapper that adds cookie helpers.

## Worked example — GET /api/items backed by Postgres

`app/api/items/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Connection pool lives at module scope so it's reused across requests.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const { rows } = await pool.query(
      'select id, title, created_at from items order by created_at desc limit 50',
    );
    return NextResponse.json({ ok: true, items: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: 'title required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    'insert into items (title) values ($1) returning id',
    [title],
  );
  return NextResponse.json({ ok: true, id: rows[0].id });
}
```

## Reading secrets

`process.env.X` is fine inside a route handler — the file never ships to
the browser. Reserve `NEXT_PUBLIC_X` for values you actually want inlined
into client bundles.

## Caching

Route handlers are dynamic by default in Next 15. To opt into caching:

```ts
export const revalidate = 60; // ISR-style, 60s
```

Or set `dynamic = 'force-static'` for fully static responses.
