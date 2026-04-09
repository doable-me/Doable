# Bug 14 — `GET /integrations/connections?workspaceId=undefined` returns 500 instead of 400

**Severity:** 🟡 Medium
**Discovered:** 2026-04-09 round-2 E2E setup probe
**Area:** `services/api/src/routes/integrations.ts` — GET /connections handler, query param validation path
**Status:** Open

## Symptom

```
GET /integrations/connections                        → 400 {"error":"workspaceId query parameter is required"}  ✓ OK
GET /integrations/connections?workspaceId=undefined  → 500 {"error":"Internal Server Error","message":"invalid input syntax for type uuid: \"undefined\""}  ✗
GET /integrations/connections?workspaceId=bad        → 500 (likely same — not verified)
```

A literal string `undefined` reaches the UUID cast in the SQL query, blowing up with a database-level error. This is a form of SQL injection surface area control — any invalid UUID should be rejected at the HTTP layer, not the DB driver, and should return a 400 with a clean error.

Easy to trigger in practice: any client that does `?workspaceId=${workspaces[0]?.id}` without guarding against `undefined` sends the literal string "undefined". The front-end apparently handles this because it awaits the list first, but tests, scripts, and badly-written client code trip it constantly.

## Impact

- Surfaces raw Postgres error text to unauthenticated-but-valid-JWT clients (info leakage about DB type / column name).
- A 500 is alerted on in production monitoring — this creates noise.
- Any upstream code that retries on 5xx but not on 4xx will retry pointlessly on a bad request.

## Reproduction

```
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:4000/integrations/connections?workspaceId=undefined"
# → 500 {"error":"Internal Server Error","message":"invalid input syntax for type uuid: \"undefined\""}
```

## Recommended fix

Validate the query param with a UUID regex (or zod) before it hits the query builder:

```ts
// services/api/src/routes/integrations.ts
import { z } from 'zod';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/connections', async (c) => {
  const wid = c.req.query('workspaceId');
  if (!wid) return c.json({ error: 'workspaceId query parameter is required' }, 400);
  if (!UUID.test(wid)) return c.json({ error: 'workspaceId must be a valid UUID' }, 400);
  // ... existing code
});
```

Do the same sweep for any other route that takes a UUID in query or body without validation. Grep for `c.req.query` and `c.req.param` touched by bare DB queries.

## Acceptance

1. `?workspaceId=undefined` → 400 with JSON body
2. `?workspaceId=not-a-uuid` → 400
3. `?workspaceId=<valid uuid>` → 200
4. No raw Postgres error text leaks in any of the above.
