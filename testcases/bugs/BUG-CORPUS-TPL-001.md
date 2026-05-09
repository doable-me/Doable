# BUG-CORPUS-TPL-001 — /templates auth-gated; TC docs claim "public read"

**Severity:** medium (spec ↔ implementation mismatch)
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus-16-26 runner, RUN-CORPUS-16-26 (2026-05-09)

## Repro
```
GET /templates
(no Authorization header)
```

## Actual
HTTP 401 — `{"error":"Missing or invalid Authorization header"}`

## Expected (per TC-TEMPL-LIST-012)
HTTP 200 — list of templates visible without auth ("public read, no auth wall").

## Analysis
`services/api/src/routes/templates.ts` lines 24-25 unconditionally apply `authMiddleware` to all `/` and `/:id` routes:
```ts
templateRoutes.use("/", authMiddleware);
templateRoutes.use("/:id", authMiddleware);
```
Either:
- The product decision is "templates are gated" → update TC-TEMPL-LIST-012 to expect 401 anonymous; or
- Public browse of templates is intended → drop the global `use(authMiddleware)` and only protect mutation/scaffold endpoints (`:id/scaffold`, `:id/use`, `/save-as-template`).

The TC-TEMPL-LIST.md author guide marked this as "Severity: High" with rationale "list visible (no auth wall)". A logged-out user evaluating the platform via marketing site cannot see templates, which is a UX downgrade.

## Fix recommendation
Remove the blanket `templateRoutes.use("/", authMiddleware)` and `templateRoutes.use("/:id", authMiddleware)`. Keep `authMiddleware` on the per-route mutations that already declare it (lines 102, 143, etc.). This matches the existing pattern for `/marketplace` and `/frameworks`.

## Evidence
`testcases/evidence/env1/TC-TEMPL-LIST-012.body`
