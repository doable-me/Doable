# BUG-WSI-003 — /design-comments/:projectId returns 308 redirect

## Environment
- <env>: https://<env>-api.doable.me
- 2026-05-10 ~18:58Z
- qa-owner JWT, projectId from /projects

## Reproduction
```bash
curl -i -H "Authorization: Bearer $OWNER" \
  https://<env>-api.doable.me/design-comments/ec8fd6b0-4297-4198-b396-f9a44eecda08
# HTTP/2 308
```

POST same path also returns 308. No `Location` header captured (used `-o` not `-i`); body empty.

## Suspected cause
Caddy or Cloudflare issuing PSL-style permanent redirect. `services/api/src/routes/design-comments.ts` registers:
- `designCommentRoutes.get("/:projectId", ...)` mounted at `/design-comments`

Routes look correct. The 308 likely comes from edge layer (Caddy/CF) rewriting the URL — possibly to a trailing-slash variant or to web frontend.

## Recommended action
1. Run `curl -i -L` to capture Location.
2. Inspect Caddy config on <env> server for any `/design-comments` rewrite.
3. Confirm whether CF Page Rules / Workers add redirects.

## Severity
high — entire design-comments API unreachable from external clients on <env> tenant.

## Evidence
`testcases/evidence/<env>/comments.json` (empty body), `comments-create.json` (empty body), curl status 308.
