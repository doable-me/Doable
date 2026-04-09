# Bug 13 — `GET /workspaces/` (trailing slash) returns 404

**Severity:** 🟡 Medium
**Discovered:** 2026-04-09 during round-2 E2E setup (pre-test probe by team-lead)
**Area:** `services/api/src/routes/workspaces.ts` route registration on Hono
**Status:** Open

## Symptom

```
GET http://localhost:4000/workspaces/      → 404 {"error":"Not Found","path":"/workspaces/"}
GET http://localhost:4000/workspaces       → 200 {"data":[...]}
```

Same class of bug as `bug-07-projects-trailing-slash-404.md` (that one was `POST /projects/` → 404). Hono's route matching is strict about trailing slashes; any code path that constructs a URL with a trailing slash drops a 404 instead of redirecting or matching.

## Impact

- Internal clients / middleware / shared `apiFetch` helpers sometimes append a slash depending on how the base URL and path are concatenated.
- A 404 here masks the real error (e.g. if auth is missing the 404 pre-empts the 401), making debugging harder.
- Inconsistent with `GET /workspaces` which works.

## Reproduction

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/workspaces/ -o /dev/null -w '%{http_code}\n'
# → 404
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/workspaces  -o /dev/null -w '%{http_code}\n'
# → 200
```

## Recommended fix

Option A (narrow): register the trailing-slash variant explicitly for this router.
Option B (wide): add a Hono middleware that strips trailing slash on non-asset routes globally. Probably wanted — `/projects/` has the same bug (bug-07).

```ts
// services/api/src/index.ts
app.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p.length > 1 && p.endsWith('/')) {
    // 308 permanent redirect to canonical no-trailing-slash
    return c.redirect(c.req.url.replace(/\/(\?|$)/, '$1'), 308);
  }
  return next();
});
```

Verify that this doesn't interfere with `/preview/:projectId/` which legitimately ends in a slash to serve the Vite index.

## Acceptance

1. `curl /workspaces/` → 200 or 308→200
2. `curl /projects/` → 200 or 308→200 (fixes bug-07 too)
3. `curl /preview/<pid>/` still serves HTML
