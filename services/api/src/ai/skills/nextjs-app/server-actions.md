# Next.js Server Actions

Server actions are async functions that run on the server but are callable
from client components as if they were local functions. The framework
handles the RPC. Use them for mutations (form submits, button clicks that
write to a database, etc.) when you don't need a separate REST surface.

## The rules

- The file (or the function) must start with the `'use server'` directive.
- The function must be `async` and exported.
- Arguments and return values must be serializable (JSON primitives, plain
  objects, arrays, FormData, Date). No class instances, functions, or
  Node-only types.
- NEVER import server-only modules (`pg`, `fs`, the Supabase service-role
  client) inside a client component. Keep that surface in the action file.
- Server actions can read `process.env.X` directly — they run server-side.

## Layout

```
app/
  actions/
    items.ts        // 'use server' actions
  items/
    page.tsx        // server component (default)
    new-item-form.tsx  // 'use client' component, imports the action
```

## Worked example — create a row in Supabase

`app/actions/items.ts`:

```ts
'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only — DO NOT expose
);

export async function createItem(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'title required' };

  const { data, error } = await supabase
    .from('items')
    .insert({ title })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/items'); // refetch the list page
  return { ok: true, id: data.id };
}
```

`app/items/new-item-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createItem } from '../actions/items';

export function NewItemForm() {
  const [msg, setMsg] = useState('');

  async function onSubmit(formData: FormData) {
    const r = await createItem(formData);
    setMsg(r.ok ? `created ${r.id}` : r.error);
  }

  return (
    <form action={onSubmit}>
      <input name="title" required />
      <button type="submit">Add</button>
      <p>{msg}</p>
    </form>
  );
}
```

## Common mistakes

- Importing a server-only client (e.g. one that uses
  `SUPABASE_SERVICE_ROLE_KEY`) from a client component. The bundler will
  inline `undefined` and the call will silently fail at runtime.
- Returning a Supabase `PostgrestError` directly — it's not always
  JSON-serializable. Pull `.message` out yourself.
- Forgetting `revalidatePath` / `revalidateTag` after a mutation, so the
  list page keeps showing the stale cache.
