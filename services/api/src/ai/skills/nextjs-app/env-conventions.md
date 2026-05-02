# Environment Variables in Next.js

Next.js has two flavours of env var, and getting them mixed up either
breaks the app at runtime or — worse — leaks a secret into the browser
bundle.

## The two flavours

| Prefix              | Where it's available                  | Inlined into JS bundle? |
|---------------------|---------------------------------------|-------------------------|
| `process.env.X`     | Server only (RSC, actions, handlers)  | No                      |
| `NEXT_PUBLIC_X`     | Server AND browser                    | Yes — at build time     |

If a value is referenced inside a client component (a file with
`'use client'`), it MUST start with `NEXT_PUBLIC_`. Otherwise Next.js
inlines `undefined` and the call silently fails at runtime.

If a value is a secret (API keys, service-role tokens, signing secrets,
DB passwords), it MUST NOT start with `NEXT_PUBLIC_`. Anything with that
prefix ends up in the public JavaScript bundle that ships to every
visitor.

## Worked example — Supabase

`.env.local`:

```bash
# Browser-safe — public anon key, project URL
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# SERVER ONLY — admin key that bypasses RLS
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

Client component (browser) — uses the anon key, RLS still applies:

```tsx
'use client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

Server action — uses service-role to bypass RLS for trusted writes:

```ts
'use server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // never expose with NEXT_PUBLIC_
);
```

## Common mistakes

- Naming a secret `NEXT_PUBLIC_STRIPE_SECRET_KEY` so it would "just work"
  in a client component. This leaks the secret to every browser. The fix
  is to call Stripe from a server action or route handler instead.
- Reading `process.env.SOMETHING` (no `NEXT_PUBLIC_` prefix) inside a
  client component, then debugging for an hour because it's `undefined`.
- Editing `.env.local` and not restarting `next dev` — env values are
  read at process start, not on every request.

## Vite syntax does NOT work in Next.js

Vite uses `import.meta.env.VITE_*`. That syntax does nothing in Next.js
and will be left as a literal that resolves to `undefined`. If you're
porting code from a Vite project:

```ts
// Vite
const url = import.meta.env.VITE_API_URL;

// Next.js equivalent
const url = process.env.NEXT_PUBLIC_API_URL;
```
