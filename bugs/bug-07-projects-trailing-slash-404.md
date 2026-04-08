# Bug 7 — `POST /projects/` (trailing slash) returns 404

**Severity:** 🟢 Low (minor API usability)
**Area:** `services/api/src/routes/projects.ts` / Hono app mounting
**Discovered:** 2026-04-08 during ui-driver Phase 1 setup
**Status:** Open

## Symptom

- `POST http://127.0.0.1:4000/projects` → `201 Created` (works)
- `POST http://127.0.0.1:4000/projects/` → `404 Not Found` (fails)

## Root cause

Hono's default router is strict about trailing slashes. Routes registered at `/projects` don't match `/projects/`, and vice versa. The project-create handler is registered at one path; the other 404s.

## Impact

- API clients that use URL-join helpers that append a trailing slash (common default in many HTTP client libraries) get a 404 on project creation.
- Documentation and examples need to specify the exact form, which is easy to get wrong.
- ui-driver hit this during the 2026-04-08 test and had to fall back to the no-slash form.

## Fix

### Option A — loosen Hono strict mode

Check how the Hono app is instantiated in `services/api/src/index.ts` and pass `strict: false`:

```ts
const app = new Hono({ strict: false });
```

This treats `/projects` and `/projects/` as equivalent across all routes.

### Option B — explicit redirect middleware

Add a middleware that 308-redirects trailing-slash requests to the canonical no-slash form. Preserves strict routing but papers over the footgun:

```ts
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(url.toString(), 308);
  }
  await next();
});
```

### Option C — ignore

If the team is fine with API clients needing to know the exact URL form, document it and move on. Lowest-cost option but friction will surface occasionally.

## Recommendation

Option A. `strict: false` is a one-line change with no behavioral downside for this codebase.

## Reproduction

```bash
TOKEN="<valid JWT>"
curl -w "\n%{http_code}\n" -X POST http://127.0.0.1:4000/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","workspaceId":"..."}'
# → 201

curl -w "\n%{http_code}\n" -X POST http://127.0.0.1:4000/projects/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","workspaceId":"..."}'
# → 404
```
