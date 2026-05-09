# BUG-WS-003 — GET /templates exposes full registry without authentication

**Severity:** medium (information disclosure / DoS surface)
**Filed by:** workspace-shard executor
**Date:** 2026-05-10
**Test:** TC-TEMPL-LIST-noauth on https://zantaz-api.doable.me

## Summary
`GET /templates` returns 200 with the full template registry (template ids, names, descriptions, official flag, tags, code-files reference, etc.) when called without an `Authorization` header.

## Repro
```
curl -i https://zantaz-api.doable.me/templates
# HTTP/2 200
# {"data":{"templates":[{"id":"blank","name":"Blank Project","description":"Minimal React + Vite + Tailwind CSS v4 + shadcn/ui starter...","category":"starter","tags":["react","vite","tailwind","typescript","starter"],"previewImageUrl":null,"isOfficial":true,"file...
```

## Expected
Either 401 (consistent with the rest of the API which requires `Authorization: Bearer <jwt>`) or an explicit, documented decision to make the registry public.

If a public templates catalog is intended, the endpoint should:
- exclude any non-official / private / draft templates from the unauthenticated listing,
- be rate-limited,
- be served by a public router that bypasses the global auth middleware deliberately.

## Impact
- Surface-area enumeration: anyone can crawl the full registry, including templates that may include private code-snippets in their `codeFiles` payload.
- Inconsistent with the rest of the workspace/project API which requires JWT.
- Easy DoS / scraping target since no auth ⇒ no per-user rate limiting.

## Suggested fix
Mount `/templates` behind the auth middleware, or add an explicit `is_public` flag and only return rows where `is_public = true` for unauthenticated callers.
